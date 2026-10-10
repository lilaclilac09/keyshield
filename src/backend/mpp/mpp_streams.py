"""
mpp_streams.py — Metered Payment Protocol streams.

Implements the server-side state machine for `/mpp/streams/*` so the
frontend's ActivitySection MPP UI works (ROADMAP §6a + spec 10.4).

On-chain mode (Phase 10.4-real, this file):
  - `settle_on_chain()` submits a real `mpp_settle` (ix #26) when env
    is configured (KS_MPP_SETTLER_KEY + KS_PLATFORM_USDC_ATA +
    KS_KEYSHIELD_PROGRAM_ID). Idempotency log lives in
    `mpp_settle_attempts`.
  - With env unset OR with the stream's PaymentStream PDA still
    DB-only, `settle_on_chain` falls back to a stub. The DB still
    settles, but only artifacts whose upstream response passed
    `fulfillment.py`. Unverified pending is dropped, not paid.
  - Every on-chain submit includes a 32-byte artifact root. A missing
    or all-zero root is refused before the transaction is built.
  - `max_total_micro_usdc` is the hard cap. Available escrow is
    `cap - settled - held`. Phase 1 locks an estimate in
    `held_micro_usdc`. Phase 2 binds that hold to the SHA-256 artifact
    hash. Phase 3 (`settle_receipt`) captures only when the consumer
    session key's HMAC over that hash verifies, then submits
    `mpp_settle`. A bad signature or an expired hold returns the lock
    to the available balance. Unsigned interval settlement does not
    debit. Closed streams reject further record/settle/receipt
    mutations. A consumed artifact hash is `NonceReused`.
  - Per spec 10 §Q3, x402 and MPP debit the SAME PaymentStream USDC
    ATA on-chain.

Tables (created lazily on first call to `_db()`):
  - mpp_streams:          one row per opened stream
  - mpp_events:           append-only audit log of open/record/settle/close
  - mpp_settle_attempts:  idempotency log for on-chain mpp_settle submissions
  - mpp_artifacts:        verified fulfillment hashes awaiting capture
  - mpp_holds:            estimated-cost locks (held → captured/released/expired)

The DB lives at v2-mvp/data/mpp.db so resetting MPP state doesn't nuke
usage history. Same lifecycle pattern as `usage.DB_PATH`.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sqlite3
import time
from dataclasses import dataclass, replace
from pathlib import Path

from .capture import verify_artifact_signature
from .fulfillment import (
    FulfillmentRejected,
    artifact_root,
    canonical_preimage,
    coerce_body,
    sha256,
    verify_fulfillment,
)

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent.parent / "data" / "mpp.db"


def _resolve_db_path() -> Path:
    """DB file for this process.

    `KS_MPP_DB` pins a file (the adversarial suite gives each case its
    own sqlite file). Otherwise `DB_PATH` is used, which tests replace
    by monkeypatching the module global.
    """
    override = os.environ.get("KS_MPP_DB", "").strip()
    if override:
        return Path(override)
    return DB_PATH


# How long an in-flight (no recorded result yet) settle attempt is
# considered "pending" before a retry can take over. Keeps `settle`
# safe under concurrent record_usage calls without blocking forever
# if the previous attempt died mid-flight.
_PENDING_RECENCY_SECS = 60


# ─── DB setup ─────────────────────────────────────────────────────────────────


def _db() -> sqlite3.Connection:
    path = _resolve_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False, timeout=5.0)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS mpp_streams (
            id                          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id                     TEXT    NOT NULL,
            agent_pubkey                TEXT    NOT NULL,
            agent_name                  TEXT,
            upstream                    TEXT    NOT NULL,
            rate_per_call_micro_usdc    INTEGER NOT NULL DEFAULT 0,
            rate_per_token_micro_usdc   INTEGER NOT NULL DEFAULT 0,
            settlement_interval_secs    INTEGER NOT NULL DEFAULT 60,
            status                      TEXT    NOT NULL DEFAULT 'open',
            opened_at                   INTEGER NOT NULL,
            last_settled_at             INTEGER NOT NULL,
            closed_at                   INTEGER,
            total_calls                 INTEGER NOT NULL DEFAULT 0,
            total_tokens                INTEGER NOT NULL DEFAULT 0,
            pending_micro_usdc          INTEGER NOT NULL DEFAULT 0,
            settled_micro_usdc          INTEGER NOT NULL DEFAULT 0,
            max_total_micro_usdc        INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_mpp_streams_user
            ON mpp_streams (user_id, opened_at DESC);

        CREATE TABLE IF NOT EXISTS mpp_events (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id       TEXT    NOT NULL,
            stream_id     INTEGER NOT NULL,
            kind          TEXT    NOT NULL,
            calls         INTEGER NOT NULL DEFAULT 0,
            tokens        INTEGER NOT NULL DEFAULT 0,
            micro_usdc    INTEGER NOT NULL DEFAULT 0,
            cost_usd      REAL    NOT NULL DEFAULT 0.0,
            ts            INTEGER NOT NULL,
            upstream      TEXT    NOT NULL,
            agent_name    TEXT,
            agent_pubkey  TEXT    NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_mpp_events_user_ts
            ON mpp_events (user_id, ts DESC);
        CREATE INDEX IF NOT EXISTS idx_mpp_events_stream
            ON mpp_events (stream_id, ts DESC);

        -- Spec 10 Phase 10.4-real idempotency log. Each row is one
        -- attempt at submitting an `mpp_settle` ix to Solana. The
        -- `tx_signature` column is the cluster-assigned sig once the
        -- ix lands; until then it stays NULL. `success`=1 means the
        -- caller observed a confirmed return; success=0 means the
        -- attempt errored (network down, BudgetExceeded, etc.).
        --
        -- Idempotency is by (stream_id, requested_micro_usdc, ts):
        -- a `record_usage` retry within the recency window finds the
        -- pending row and skips re-submission. The ts component
        -- prevents identical-amount settles across DIFFERENT
        -- intervals from colliding.
        CREATE TABLE IF NOT EXISTS mpp_settle_attempts (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            stream_id               INTEGER NOT NULL,
            requested_micro_usdc    INTEGER NOT NULL,
            tx_signature            TEXT,
            debited_micro_usdc      INTEGER NOT NULL DEFAULT 0,
            success                 INTEGER NOT NULL DEFAULT 0,
            error                   TEXT,
            ts                      INTEGER NOT NULL,
            UNIQUE (stream_id, requested_micro_usdc, ts)
        );
        CREATE INDEX IF NOT EXISTS idx_mpp_settle_attempts_stream
            ON mpp_settle_attempts (stream_id, ts DESC);

        -- One row per verified upstream response. Settlement debits
        -- only rows with settled=0, and only after their hashes are
        -- folded into the artifact root passed to mpp_settle.
        CREATE TABLE IF NOT EXISTS mpp_artifacts (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            stream_id       INTEGER NOT NULL,
            artifact_hash   TEXT    NOT NULL,
            body_sha256     TEXT    NOT NULL,
            calls           INTEGER NOT NULL,
            tokens          INTEGER NOT NULL,
            micro_usdc      INTEGER NOT NULL,
            settled         INTEGER NOT NULL DEFAULT 0,
            ts              INTEGER NOT NULL,
            UNIQUE (stream_id, artifact_hash)
        );
        CREATE INDEX IF NOT EXISTS idx_mpp_artifacts_stream
            ON mpp_artifacts (stream_id, settled, id);

        -- Off-chain idempotency for a retried proxy call. The primary
        -- key is the checkpoint: the same (stream, request) cannot
        -- insert two rows. `tokens` is the high-water mark of bytes
        -- actually observed, so a later retry bills only the increase.
        CREATE TABLE IF NOT EXISTS mpp_request_keys (
            stream_id     INTEGER NOT NULL,
            request_id    TEXT    NOT NULL,
            calls         INTEGER NOT NULL,
            tokens        INTEGER NOT NULL,
            micro_usdc    INTEGER NOT NULL,
            artifact_hash TEXT    NOT NULL,
            PRIMARY KEY (stream_id, request_id)
        );

        -- Phase-1 lock. `artifact_hash` stays NULL until the upstream
        -- body is hashed and bound. status is held, captured, released,
        -- or expired. Expiry returns the lock to available balance.
        CREATE TABLE IF NOT EXISTS mpp_holds (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            stream_id       INTEGER NOT NULL,
            artifact_hash   TEXT,
            micro_usdc      INTEGER NOT NULL,
            status          TEXT    NOT NULL DEFAULT 'held',
            expires_at      INTEGER NOT NULL,
            created_at      INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_mpp_holds_stream
            ON mpp_holds (stream_id, status, expires_at);
    """)

    # Spec 10 Phase 10.5 wallet sign-off — idempotent column adds. Once
    # the frontend wallet adapter signs+sends the `open_payment_stream`
    # ix, it POSTs the resulting tx signature so the UI can switch from
    # the "Open on-chain stream" CTA to a green Solana-explorer link.
    # `withdraw_agent_wallet` sigs reuse the same column (withdraw is
    # terminal, so the open-sig is preserved separately in mpp_events).
    #
    # SQLite doesn't have `ADD COLUMN IF NOT EXISTS`, so we probe via
    # PRAGMA table_info and only ALTER on first run. This keeps `_db()`
    # safely callable on already-migrated databases (and on databases
    # that pre-date this column entirely).
    existing_cols = {row[1] for row in conn.execute("PRAGMA table_info(mpp_streams)")}
    if "tx_signature" not in existing_cols:
        conn.execute("ALTER TABLE mpp_streams ADD COLUMN tx_signature TEXT")
    # On-chain stream PDA + USDC ATA — populated when the wallet adapter
    # signs `open_payment_stream` and posts back the addresses.
    # `_get_stream_pda_ata()` reads these to build the `mpp_settle` ix.
    if "stream_pda" not in existing_cols:
        conn.execute("ALTER TABLE mpp_streams ADD COLUMN stream_pda TEXT")
    if "stream_usdc_ata" not in existing_cols:
        conn.execute("ALTER TABLE mpp_streams ADD COLUMN stream_usdc_ata TEXT")
    # Hard budget cap in micro-USDC. NULL means the row is uncapped
    # (legacy streams). On-chain this is `max_total_micro_usdc`; a
    # debit that would pass it is BudgetExceeded (program 6100) and
    # must not change balances.
    if "max_total_micro_usdc" not in existing_cols:
        conn.execute("ALTER TABLE mpp_streams ADD COLUMN max_total_micro_usdc INTEGER")
    # Monotonic settlement sequence. 0 means nothing has been accepted.
    # A receipt's sequence_number must be strictly greater than this.
    # The honest settler assigns last_settled_seq + 1.
    if "last_settled_seq" not in existing_cols:
        conn.execute(
            "ALTER TABLE mpp_streams ADD COLUMN last_settled_seq INTEGER NOT NULL DEFAULT 0"
        )
    # Micro-USDC locked by an open hold. Available escrow is
    # cap - settled - held. Capture moves held into settled; release
    # and expiry move it back to available.
    if "held_micro_usdc" not in existing_cols:
        conn.execute(
            "ALTER TABLE mpp_streams ADD COLUMN held_micro_usdc INTEGER NOT NULL DEFAULT 0"
        )

    attempt_cols = {row[1] for row in conn.execute("PRAGMA table_info(mpp_settle_attempts)")}
    if "artifact_root" not in attempt_cols:
        conn.execute("ALTER TABLE mpp_settle_attempts ADD COLUMN artifact_root TEXT")

    conn.commit()
    return conn


# ─── exceptions ──────────────────────────────────────────────────────────────


class StreamNotFound(Exception):
    """The (user_id, stream_id) pair does not exist."""


class StreamClosed(Exception):
    """Operation requires an open stream but the stream is closed.

    Message is `StreamAlreadyClosed`. The on-chain counterpart is
    `PaymentStreamInactive` (6052).
    """


class BudgetExceeded(Exception):
    """Debit would push settled usage past `max_total_micro_usdc`.

    On-chain counterpart is `BudgetExceeded` (6100). The debit is
    rolled back; balances stay where they were.
    """

    def __init__(self, message: str = "BudgetExceeded"):
        super().__init__(message)


class ReplayRejected(Exception):
    """This fulfillment hash was already consumed by a settlement.

    On-chain counterpart is `NonceReused` (6101).
    """

    def __init__(self, message: str = "NonceReused"):
        super().__init__(message)


class CaptureRejected(Exception):
    """The consumer session MAC over the artifact hash did not verify.

    The hold is released back to available balance before this is raised.
    """

    def __init__(self, message: str = "invalid capture signature"):
        super().__init__(message)


class HoldExpired(Exception):
    """The estimate lock timed out and returned to available balance."""

    def __init__(self, message: str = "hold expired"):
        super().__init__(message)


@dataclass(frozen=True)
class SettleOutcome:
    """Result of one attempt to submit `mpp_settle`.

    `mode="stub"` means chain config is absent and the DB may settle
    verified artifacts locally. `mode="submitted"` means the chain
    accepted the debit (or an identical root was already consumed).
    `mode="failed"` leaves pending usage in place for a later retry.
    `mode="indeterminate"` is an RPC timeout or drop: the ledger does
    not debit, and the attempt cache must not block a retry.
    """

    debited_micro_usdc: int
    mode: str


# ─── row → dict helpers ──────────────────────────────────────────────────────


_STREAM_COLS = (
    "id, user_id, agent_pubkey, agent_name, upstream, "
    "rate_per_call_micro_usdc, rate_per_token_micro_usdc, "
    "settlement_interval_secs, status, opened_at, last_settled_at, "
    "closed_at, total_calls, total_tokens, "
    "pending_micro_usdc, settled_micro_usdc, tx_signature, "
    "max_total_micro_usdc, last_settled_seq, held_micro_usdc"
)


def _row_to_stream(row: tuple) -> dict:
    # Note: the DB column is `tx_signature` but the frontend reads
    # `on_chain_signature` (Spec 10 Phase 10.5 wallet sign-off field
    # name). The dict carries both keys so legacy callers and the new
    # frontend banner both work without surprises.
    sig = row[16] if len(row) > 16 else None
    cap = row[17] if len(row) > 17 else None
    seq = int(row[18]) if len(row) > 18 and row[18] is not None else 0
    held = int(row[19]) if len(row) > 19 and row[19] is not None else 0
    if cap is not None:
        cap = int(cap)
    settled = int(row[15])
    # Remaining hard-cap headroom after settled debits and open holds.
    # NULL cap → uncapped, escrow is None.
    escrow = None if cap is None else cap - settled - held
    return {
        "id": row[0],
        "user_id": row[1],
        "agent_pubkey": row[2],
        "agent_name": row[3] or "",
        "upstream": row[4],
        "rate_per_call_micro_usdc": row[5],
        "rate_per_token_micro_usdc": row[6],
        "settlement_interval_secs": row[7],
        "status": row[8],
        "opened_at": row[9],
        "last_settled_at": row[10],
        "closed_at": row[11],
        "total_calls": row[12],
        "total_tokens": row[13],
        "pending_micro_usdc": row[14],
        "settled_micro_usdc": settled,
        "on_chain_signature": sig,
        "max_total_micro_usdc": cap,
        "escrow_micro_usdc": escrow,
        "last_settled_seq": seq,
        "held_micro_usdc": held,
    }


_EVENT_COLS = (
    "id, user_id, stream_id, kind, calls, tokens, micro_usdc, "
    "cost_usd, ts, upstream, agent_name, agent_pubkey"
)


def _row_to_event(row: tuple) -> dict:
    return {
        "id": row[0],
        "user_id": row[1],
        "stream_id": row[2],
        "kind": row[3],
        "calls": row[4],
        "tokens": row[5],
        "micro_usdc": row[6],
        "cost_usd": row[7],
        "ts": row[8],
        "upstream": row[9],
        "agent_name": row[10] or "",
        "agent_pubkey": row[11],
    }


# ─── private helpers ─────────────────────────────────────────────────────────


def _begin_immediate(conn: sqlite3.Connection) -> None:
    """Own the write lock for this connection only.

    `isolation_level=None` disables the driver's implicit BEGIN so the
    explicit `BEGIN IMMEDIATE` is the transaction. Other connections
    keep the default isolation. Callers COMMIT or ROLLBACK themselves.
    """
    conn.isolation_level = None
    conn.execute("BEGIN IMMEDIATE")


def _rollback(conn: sqlite3.Connection) -> None:
    try:
        conn.execute("ROLLBACK")
    except sqlite3.OperationalError:
        pass


def _race_window() -> None:
    """Optional pause so two debits overlap inside one settlement.

    Set `KS_MPP_RACE_WINDOW_MS` only in tests. Production leaves it
    unset. The pause sits inside the write transaction, so a correct
    cap check still serializes; a check-then-act debit does not.
    """
    raw = os.environ.get("KS_MPP_RACE_WINDOW_MS", "").strip()
    if not raw:
        return
    try:
        delay_ms = int(raw)
    except ValueError:
        return
    if delay_ms > 0:
        time.sleep(delay_ms / 1000)


def _get_owned_stream(conn: sqlite3.Connection, user_id: str, stream_id: int) -> dict:
    """Fetch a stream that belongs to user_id, else raise StreamNotFound.

    Owner-scoped lookup is the entire access-control surface for MPP —
    we never expose another user's stream by id, even if the id is
    guessed correctly.
    """
    row = conn.execute(
        f"SELECT {_STREAM_COLS} FROM mpp_streams WHERE id = ? AND user_id = ?",
        (stream_id, user_id),
    ).fetchone()
    if row is None:
        raise StreamNotFound(stream_id)
    return _row_to_stream(row)


def _emit_event(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    stream: dict,
    kind: str,
    calls: int = 0,
    tokens: int = 0,
    micro_usdc: int = 0,
    ts: int | None = None,
) -> dict:
    """Append a row to mpp_events. Returns the row as a dict."""
    ts = ts if ts is not None else int(time.time())
    cost_usd = round(micro_usdc / 1_000_000, 6)
    cur = conn.execute(
        """
        INSERT INTO mpp_events
          (user_id, stream_id, kind, calls, tokens, micro_usdc,
           cost_usd, ts, upstream, agent_name, agent_pubkey)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            user_id,
            stream["id"],
            kind,
            calls,
            tokens,
            micro_usdc,
            cost_usd,
            ts,
            stream["upstream"],
            stream.get("agent_name") or "",
            stream["agent_pubkey"],
        ),
    )
    return {
        "id": cur.lastrowid,
        "user_id": user_id,
        "stream_id": stream["id"],
        "kind": kind,
        "calls": calls,
        "tokens": tokens,
        "micro_usdc": micro_usdc,
        "cost_usd": cost_usd,
        "ts": ts,
        "upstream": stream["upstream"],
        "agent_name": stream.get("agent_name") or "",
        "agent_pubkey": stream["agent_pubkey"],
    }


# ─── stub vs real on-chain seam ──────────────────────────────────────────────


def _is_artifact_replay(error: str) -> bool:
    """True when the chain already consumed this fulfillment root."""
    text = error.lower()
    return "noncereused" in text or "0x17d5" in text or "custom program error: 6101" in text


def _is_sequence_replay(error: str) -> bool:
    """True when the chain rejected `settlement_seq` because `seq <= last_settled_seq`."""
    text = error.lower()
    return "settlementreplay" in text or "0x17df" in text or "custom program error: 6111" in text


_INDETERMINATE_PREFIX = "indeterminate:"
_INDETERMINATE_MARKERS = (
    "timeout",
    "timed out",
    "did not finish",
    "temporarily unavailable",
    "connection reset",
    "429",
    "503",
    "504",
)


def _is_indeterminate_submit(error: str) -> bool:
    """True when the RPC outcome is unknown — do not cache as a hard fail."""
    text = (error or "").lower()
    return text.startswith(_INDETERMINATE_PREFIX) or any(
        marker in text for marker in _INDETERMINATE_MARKERS
    )


def _stub_ledger() -> bool:
    """The DB is the settlement ledger when no chain settler is configured."""
    return not (
        os.environ.get("KS_MPP_SETTLER_KEY", "").strip()
        and os.environ.get("KS_PLATFORM_USDC_ATA", "").strip()
        and os.environ.get("KS_KEYSHIELD_PROGRAM_ID", "").strip()
    )


def _root_already_submitted(stream_id: int, root_hex: str) -> bool:
    conn = _db()
    try:
        row = conn.execute(
            """
            SELECT 1 FROM mpp_settle_attempts
             WHERE stream_id = ? AND artifact_root = ? AND success = 1
             LIMIT 1
            """,
            (int(stream_id), root_hex),
        ).fetchone()
    finally:
        conn.close()
    return row is not None


def settle_on_chain(
    stream_id: int,
    micro_usdc: int,
    artifact_root_bytes: bytes,
    settlement_seq: int = 1,
    capture_signature: bytes | None = None,
    request_hash: bytes | None = None,
    db_conn: sqlite3.Connection | None = None,
) -> SettleOutcome:
    """Submit a real `mpp_settle` ix (#26) to Solana.

    `artifact_root_bytes` is the 32-byte fulfillment commitment for
    this batch. A missing or zero root raises FulfillmentRejected and
    does not touch the chain — invoiced units alone are not enough.
    `capture_signature` is the 32-byte consumer MAC. A missing or
    all-zero signature raises FulfillmentRejected after the root
    check, so a zero root still reports that error first.
    `request_hash` is the 32-byte fulfillment hash of this receipt.
    It is checked after the root, the sequence, and the signature.

    Stub-fallback (`mode="stub"`) runs whenever:
      - any required env var (KS_MPP_SETTLER_KEY, KS_PLATFORM_USDC_ATA,
        KS_KEYSHIELD_PROGRAM_ID) is unset
      - the stream's PaymentStream PDA isn't yet opened on-chain

    A submission error returns `mode="failed"` so the caller keeps
    the pending balance for the next interval. Replaying a root the
    chain already consumed is treated as success so the DB can catch
    up after a crash between confirm and commit.

    Idempotency: each attempt is logged in `mpp_settle_attempts`. A
    second call with the same (stream_id, requested_micro_usdc,
    ts-bucket) within `_PENDING_RECENCY_SECS` returns the prior
    result instead of re-submitting.
    """
    if not isinstance(artifact_root_bytes, (bytes, bytearray)) or len(artifact_root_bytes) != 32:
        raise FulfillmentRejected("settlement requires a 32-byte fulfillment artifact root")
    if bytes(artifact_root_bytes) == bytes(32):
        raise FulfillmentRejected("settlement requires a non-zero fulfillment artifact root")
    if (
        isinstance(settlement_seq, bool)
        or not isinstance(settlement_seq, int)
        or settlement_seq < 1
    ):
        raise ReplayRejected("SettlementReplay")
    if (
        not isinstance(capture_signature, (bytes, bytearray))
        or len(capture_signature) != 32
        or bytes(capture_signature) == bytes(32)
    ):
        raise FulfillmentRejected("capture signature required")
    if (
        not isinstance(request_hash, (bytes, bytearray))
        or len(request_hash) != 32
        or bytes(request_hash) == bytes(32)
    ):
        raise FulfillmentRejected("request_hash required")
    capture_signature = bytes(capture_signature)
    artifact_root_bytes = bytes(artifact_root_bytes)
    request_hash = bytes(request_hash)
    root_hex = artifact_root_bytes.hex()

    if micro_usdc <= 0:
        return SettleOutcome(0, "failed")

    # Lazy import — avoids circular import / fails-soft if module not
    # importable (e.g. solders missing). The import itself can't fail
    # for stub-fallback because mpp_onchain.py imports softly.
    try:
        from . import mpp_onchain
    except ImportError:
        try:
            import mpp_onchain  # type: ignore[no-redef]
        except ImportError as e:
            logger.warning("mpp_onchain import failed: %s — stub-fallback", e)
            return SettleOutcome(0, "stub")

    config = mpp_onchain.load_mpp_config()
    if config is None:
        # load_mpp_config() already logged the warning once; just
        # fall through to stub.
        return SettleOutcome(0, "stub")

    # Env `KS_VAULT_PDA` is the settler vault from setup. Settle must
    # use the stream owner's UniversalVault or ix 26 hits 6010.
    conn = _db()
    try:
        owner_row = conn.execute(
            "SELECT user_id FROM mpp_streams WHERE id = ?",
            (stream_id,),
        ).fetchone()
    finally:
        conn.close()
    owner_id = None if owner_row is None else owner_row[0]
    if owner_id:
        try:
            owner_vault, _bump = mpp_onchain.derive_universal_vault_pda(
                owner_id,
                config.keyshield_program_id,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "mpp_settle stream %s: cannot derive owner vault from %s: %s",
                stream_id,
                owner_id,
                exc,
            )
        else:
            config = replace(config, vault_pda=owner_vault)

    # PDA + ATA are not stored in the mpp_streams schema today
    # (open_stream is still DB-only). Without them we can't build
    # the ix — return 0 with a one-line warning so operators see why
    # real settle isn't happening.
    pda, ata = _get_stream_pda_ata(stream_id)
    if not (pda and ata):
        if not _PDA_MISSING_WARNED.get(stream_id):
            logger.warning(
                "mpp_settle stream %s: PDA/ATA not opened on-chain "
                "(wallet must sign open_payment_stream and POST the sig). "
                "Configured settler → failed; no settler → stub ledger.",
                stream_id,
            )
            _PDA_MISSING_WARNED[stream_id] = True
        # HVC: a loaded settler is not a stub ledger. Debiting
        # `settled` here was a receipt without a chain tx.
        if _stub_ledger():
            return SettleOutcome(0, "stub")
        return SettleOutcome(0, "failed")

    # Idempotency check. A confirmed success is a cache hit. A timeout
    # or other indeterminate error is not — the first submit may still
    # land, so a retry must be allowed to reconcile (replay = success).
    now_ts = int(time.time())
    prior = _find_recent_attempt(stream_id, micro_usdc, now_ts)
    if prior is not None:
        if prior.get("success"):
            return SettleOutcome(int(prior.get("debited_micro_usdc") or 0), "submitted")
        if _is_indeterminate_submit(str(prior.get("error") or "")):
            prior = None
        else:
            return SettleOutcome(0, "failed")

    try:
        ix = mpp_onchain.build_mpp_settle_ix(
            config,
            pda,
            ata,
            micro_usdc,
            artifact_root_bytes,
            settlement_seq,
            capture_signature,
            request_hash,
        )
    except Exception as e:  # noqa: BLE001
        # build_mpp_settle_ix raises if vault_pda is missing — same
        # stub-fallback behavior as PDA missing.
        logger.warning("mpp_settle build_ix failed for stream %s: %s", stream_id, e)
        _record_settle_attempt(
            stream_id,
            micro_usdc,
            now_ts,
            success=False,
            debited=0,
            error=str(e),
            artifact_root=root_hex,
            conn=db_conn,
        )
        return SettleOutcome(0, "failed")

    # Pick the right way to run an async coroutine. If we're inside a
    # running event loop (FastAPI request handler called settle_on_chain
    # directly without a thread executor), asyncio.run() raises — fall
    # back to a fresh worker-thread loop. If we're at module top-level
    # (CLI scripts, tests), asyncio.run() is the simpler path.
    try:
        running_loop = asyncio.get_running_loop()
    except RuntimeError:
        running_loop = None

    try:
        if running_loop is not None:
            debited, tx_sig = _run_async_in_thread(
                mpp_onchain.submit_mpp_settle(config, ix),
            )
        else:
            debited, tx_sig = asyncio.run(mpp_onchain.submit_mpp_settle(config, ix))
    except Exception as e:  # noqa: BLE001
        logger.warning("mpp_settle submit failed for stream %s: %s", stream_id, e)
        replayed = _is_artifact_replay(str(e)) or (
            _is_sequence_replay(str(e)) and _root_already_submitted(stream_id, root_hex)
        )
        indeterminate = not replayed and _is_indeterminate_submit(str(e))
        _record_settle_attempt(
            stream_id,
            micro_usdc,
            now_ts,
            success=replayed,
            debited=int(micro_usdc) if replayed else 0,
            error=(_INDETERMINATE_PREFIX + str(e)) if indeterminate else str(e),
            artifact_root=root_hex,
            conn=db_conn,
        )
        if replayed:
            return SettleOutcome(int(micro_usdc), "submitted")
        if indeterminate:
            return SettleOutcome(0, "indeterminate")
        return SettleOutcome(0, "failed")

    _record_settle_attempt(
        stream_id,
        micro_usdc,
        now_ts,
        success=True,
        debited=int(debited),
        error=None,
        tx_signature=tx_sig,
        artifact_root=root_hex,
        conn=db_conn,
    )
    return SettleOutcome(int(debited), "submitted")


# Per-stream "we've already complained about missing PDA" cache so
# the warning doesn't spam every settle interval.
_PDA_MISSING_WARNED: dict[int, bool] = {}


def _get_stream_pda_ata(stream_id: int) -> tuple[str | None, str | None]:
    """Look up the on-chain PDA + USDC ATA for a stream.

    Both values are written by `open_stream()` when the caller passes
    them in (the wallet adapter signs `open_payment_stream` on-chain
    and posts back the addresses via /mpp/streams). Returns (None, None)
    for legacy DB-only streams opened before this column existed.
    """
    conn = _db()
    try:
        row = conn.execute(
            "SELECT stream_pda, stream_usdc_ata FROM mpp_streams WHERE id = ?",
            (int(stream_id),),
        ).fetchone()
    finally:
        conn.close()
    if not row:
        return (None, None)
    return (row[0] or None, row[1] or None)


def _find_recent_attempt(
    stream_id: int,
    micro_usdc: int,
    now_ts: int,
) -> dict | None:
    """Return the most recent attempt row for this (stream, amount)
    within the recency window, or None."""
    cutoff = now_ts - _PENDING_RECENCY_SECS
    conn = _db()
    try:
        row = conn.execute(
            """
            SELECT id, tx_signature, debited_micro_usdc, success, error, ts
              FROM mpp_settle_attempts
             WHERE stream_id = ? AND requested_micro_usdc = ? AND ts >= ?
             ORDER BY ts DESC, id DESC
             LIMIT 1
            """,
            (int(stream_id), int(micro_usdc), cutoff),
        ).fetchone()
        if row is None:
            return None
        return {
            "id": row[0],
            "tx_signature": row[1],
            "debited_micro_usdc": row[2],
            "success": bool(row[3]),
            "error": row[4],
            "ts": row[5],
        }
    finally:
        conn.close()


def _record_settle_attempt(
    stream_id: int,
    requested_micro_usdc: int,
    ts: int,
    *,
    success: bool,
    debited: int,
    error: str | None = None,
    tx_signature: str | None = None,
    artifact_root: str | None = None,
    conn: sqlite3.Connection | None = None,
) -> None:
    """Insert a row in `mpp_settle_attempts`. UNIQUE constraint on
    (stream_id, requested_micro_usdc, ts) means duplicate inserts at
    the same exact second are silently absorbed."""
    own = conn is None
    if conn is None:
        conn = _db()
    try:
        try:
            conn.execute(
                """
                INSERT INTO mpp_settle_attempts
                  (stream_id, requested_micro_usdc, tx_signature,
                   debited_micro_usdc, success, error, ts, artifact_root)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    int(stream_id),
                    int(requested_micro_usdc),
                    tx_signature,
                    int(debited),
                    1 if success else 0,
                    error,
                    int(ts),
                    artifact_root,
                ),
            )
            if own:
                conn.commit()
        except sqlite3.IntegrityError:
            # Duplicate (same stream/amount/ts) — fine, the prior
            # row is the source of truth.
            pass
        except sqlite3.OperationalError as exc:
            if "locked" in str(exc).lower():
                logger.warning("mpp_settle_attempts locked: %s", exc)
                return
            raise
    finally:
        if own:
            conn.close()


def _run_async_in_thread(coro):
    """Run an async coroutine on a fresh event loop in a worker
    thread and return the result. Used when settle_on_chain is
    invoked from inside a running event loop (FastAPI request
    handler) where asyncio.run() would raise."""
    import threading

    result: dict[str, object] = {}

    def runner() -> None:
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            result["v"] = loop.run_until_complete(coro)
        except Exception as e:  # noqa: BLE001
            result["e"] = e
        finally:
            loop.close()

    t = threading.Thread(target=runner, daemon=True)
    t.start()
    t.join(timeout=20.0)
    if "e" in result:
        raise result["e"]  # type: ignore[misc]
    if "v" not in result:
        raise TimeoutError("submit_mpp_settle did not finish in 20s")
    return result["v"]


# ─── public API ──────────────────────────────────────────────────────────────


def open_stream(
    user_id: str,
    agent_pubkey: str,
    agent_name: str,
    upstream: str,
    rate_per_token: int,
    rate_per_call: int,
    settlement_interval: int,
    stream_pda: str | None = None,
    stream_usdc_ata: str | None = None,
    max_total_micro_usdc: int | None = None,
) -> dict:
    """Open a new MPP stream for `user_id`. Returns the stream row +
    emits an 'open' event.

    `max_total_micro_usdc` is the hard budget cap. `None` leaves the
    stream uncapped. A provided cap must be at least 1.
    """
    if not agent_pubkey:
        raise ValueError("agent_pubkey is required")
    if rate_per_token < 0 or rate_per_call < 0:
        raise ValueError("rates must be non-negative")
    if rate_per_token == 0 and rate_per_call == 0:
        raise ValueError("at least one of rate_per_token / rate_per_call must be > 0")
    if settlement_interval < 5 or settlement_interval > 3600:
        raise ValueError("settlement_interval must be in [5, 3600] seconds")
    if max_total_micro_usdc is not None:
        max_total_micro_usdc = int(max_total_micro_usdc)
        if max_total_micro_usdc < 1:
            raise ValueError("max_total_micro_usdc must be >= 1")

    now = int(time.time())
    conn = _db()
    try:
        cur = conn.execute(
            """
            INSERT INTO mpp_streams
              (user_id, agent_pubkey, agent_name, upstream,
               rate_per_call_micro_usdc, rate_per_token_micro_usdc,
               settlement_interval_secs, status, opened_at, last_settled_at,
               stream_pda, stream_usdc_ata, max_total_micro_usdc)
            VALUES (?,?,?,?,?,?,?, 'open', ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                agent_pubkey,
                agent_name or "",
                upstream,
                int(rate_per_call),
                int(rate_per_token),
                int(settlement_interval),
                now,
                now,
                stream_pda or None,
                stream_usdc_ata or None,
                max_total_micro_usdc,
            ),
        )
        stream_id = cur.lastrowid
        stream = _get_owned_stream(conn, user_id, stream_id)
        _emit_event(conn, user_id=user_id, stream=stream, kind="open", ts=now)
        conn.commit()
        return stream
    finally:
        conn.close()


def _unsettled_artifacts(conn: sqlite3.Connection, stream_id: int) -> list[dict]:
    rows = conn.execute(
        """
        SELECT id, artifact_hash, calls, tokens, micro_usdc
          FROM mpp_artifacts
         WHERE stream_id = ? AND settled = 0
         ORDER BY id ASC
        """,
        (int(stream_id),),
    ).fetchall()
    return [
        {
            "id": row[0],
            "artifact_hash": row[1],
            "calls": row[2],
            "tokens": row[3],
            "micro_usdc": row[4],
        }
        for row in rows
    ]


def _idempotent_replay(stream: dict, artifact_hash: str) -> dict:
    stream = dict(stream)
    stream["idempotent_replay"] = True
    stream["just_settled_micro_usdc"] = 0
    stream["artifact_hash"] = artifact_hash
    return stream


def _hold_ttl_secs() -> int:
    """How long an estimate stays locked before it returns to available."""
    raw = os.environ.get("KS_MPP_HOLD_TTL_SECS", "").strip()
    if not raw:
        return 120
    try:
        ttl = int(raw)
    except ValueError:
        return 120
    return ttl if ttl > 0 else 120


def _commit(conn: sqlite3.Connection) -> None:
    try:
        conn.execute("COMMIT")
    except sqlite3.OperationalError:
        pass


def _release_hold_row(
    conn: sqlite3.Connection,
    hold_id: int,
    new_status: str,
    stream_id: int | None = None,
) -> bool:
    """Move one `held` row back to available balance.

    A hold with no artifact hash only decreases `held_micro_usdc`.
    A bound hold also decreases `pending_micro_usdc`. Settled balance
    stays put. A row that is not `held`, or that belongs to another
    stream, is left alone.
    """
    row = conn.execute(
        """
        SELECT stream_id, artifact_hash, micro_usdc, status
          FROM mpp_holds WHERE id = ?
        """,
        (int(hold_id),),
    ).fetchone()
    if row is None or row[3] != "held":
        return False
    owner_stream, artifact_hash, micro, _status = row
    if stream_id is not None and int(owner_stream) != int(stream_id):
        return False
    micro = int(micro)
    if micro < 0:
        return False
    if artifact_hash:
        updated = conn.execute(
            """
            UPDATE mpp_streams
               SET held_micro_usdc = held_micro_usdc - ?,
                   pending_micro_usdc = pending_micro_usdc - ?
             WHERE id = ?
               AND held_micro_usdc >= ?
               AND pending_micro_usdc >= ?
            """,
            (micro, micro, int(owner_stream), micro, micro),
        )
    else:
        updated = conn.execute(
            """
            UPDATE mpp_streams
               SET held_micro_usdc = held_micro_usdc - ?
             WHERE id = ? AND held_micro_usdc >= ?
            """,
            (micro, int(owner_stream), micro),
        )
    if updated.rowcount != 1:
        return False
    marked = conn.execute(
        "UPDATE mpp_holds SET status = ? WHERE id = ? AND status = 'held'",
        (new_status, int(hold_id)),
    )
    return marked.rowcount == 1


def _expire_stream_holds(conn: sqlite3.Connection, stream_id: int, now: int) -> None:
    rows = conn.execute(
        """
        SELECT id FROM mpp_holds
         WHERE stream_id = ? AND status = 'held' AND expires_at <= ?
        """,
        (int(stream_id), int(now)),
    ).fetchall()
    for (hold_id,) in rows:
        _release_hold_row(conn, int(hold_id), "expired", int(stream_id))


def _release_open_holds(conn: sqlite3.Connection, stream_id: int) -> None:
    rows = conn.execute(
        "SELECT id FROM mpp_holds WHERE stream_id = ? AND status = 'held'",
        (int(stream_id),),
    ).fetchall()
    for (hold_id,) in rows:
        _release_hold_row(conn, int(hold_id), "released", int(stream_id))


def _expire_committed(stream_id: int, now: int) -> None:
    """Release expired holds and commit that write on its own connection."""
    conn = _db()
    try:
        _begin_immediate(conn)
        try:
            _expire_stream_holds(conn, stream_id, now)
            _commit(conn)
        except Exception:
            _rollback(conn)
            raise
    finally:
        conn.close()


def _parse_estimate(estimate, stream: dict) -> int:
    if estimate is None or estimate == "":
        estimate = int(stream["rate_per_call_micro_usdc"] or 0)
        if estimate <= 0:
            estimate = int(stream["rate_per_token_micro_usdc"] or 0)
    if isinstance(estimate, bool):
        raise ValueError("estimate must be a positive integer")
    try:
        amount = int(estimate)
    except (TypeError, ValueError) as exc:
        raise ValueError("estimate must be a positive integer") from exc
    if amount <= 0:
        raise ValueError("estimate must be a positive integer")
    return amount


def _cap_lock_update(
    conn: sqlite3.Connection,
    user_id: str,
    stream_id: int,
    *,
    calls: int,
    tokens: int,
    pending_delta: int,
    held_delta: int,
) -> bool:
    """Apply usage counters and a hold delta when the cap still allows it."""
    cur = conn.execute(
        """
        UPDATE mpp_streams
           SET total_calls = total_calls + ?,
               total_tokens = total_tokens + ?,
               pending_micro_usdc = pending_micro_usdc + ?,
               held_micro_usdc = held_micro_usdc + ?
         WHERE id = ? AND user_id = ? AND status = 'open'
           AND held_micro_usdc + ? >= 0
           AND pending_micro_usdc + ? >= 0
           AND (max_total_micro_usdc IS NULL
                OR settled_micro_usdc + held_micro_usdc + ? <= max_total_micro_usdc)
        """,
        (
            int(calls),
            int(tokens),
            int(pending_delta),
            int(held_delta),
            int(stream_id),
            user_id,
            int(held_delta),
            int(pending_delta),
            int(held_delta),
        ),
    )
    return cur.rowcount == 1


def _insert_hold(
    conn: sqlite3.Connection,
    stream_id: int,
    micro: int,
    artifact_hash: str | None,
    now: int,
) -> int:
    cur = conn.execute(
        """
        INSERT INTO mpp_holds
          (stream_id, artifact_hash, micro_usdc, status, expires_at, created_at)
        VALUES (?, ?, ?, 'held', ?, ?)
        """,
        (
            int(stream_id),
            artifact_hash,
            int(micro),
            int(now) + _hold_ttl_secs(),
            int(now),
        ),
    )
    return int(cur.lastrowid)


def hold_estimate(
    user_id: str,
    stream_id: int,
    upstream: str,
    estimate_micro_usdc: int | None = None,
) -> dict:
    """Phase 1. Lock `estimate_micro_usdc` inside the escrow balance.

    Increases `held_micro_usdc` only. Pending and settled stay put.
    Available escrow is `cap - settled - held`. A lock that would pass
    the cap raises BudgetExceeded and writes nothing.
    """
    now = int(time.time())
    _expire_committed(int(stream_id), now)
    conn = _db()
    try:
        _begin_immediate(conn)
        try:
            stream = _get_owned_stream(conn, user_id, stream_id)
            if stream["status"] != "open":
                raise StreamClosed("StreamAlreadyClosed")
            if stream["upstream"] != upstream:
                raise FulfillmentRejected("provider outside stream scope")
            estimate = _parse_estimate(estimate_micro_usdc, stream)
            locked = _cap_lock_update(
                conn,
                user_id,
                stream_id,
                calls=0,
                tokens=0,
                pending_delta=0,
                held_delta=estimate,
            )
            if not locked:
                fresh = _get_owned_stream(conn, user_id, stream_id)
                if fresh["status"] != "open":
                    raise StreamClosed("StreamAlreadyClosed")
                raise BudgetExceeded("BudgetExceeded")
            hold_id = _insert_hold(conn, stream_id, estimate, None, now)
            stream = _get_owned_stream(conn, user_id, stream_id)
            _emit_event(
                conn,
                user_id=user_id,
                stream=stream,
                kind="hold",
                micro_usdc=estimate,
                ts=now,
            )
            _commit(conn)
        except Exception:
            _rollback(conn)
            raise
        stream["hold_id"] = hold_id
        stream["just_settled_micro_usdc"] = 0
        return stream
    finally:
        conn.close()


def release_hold(user_id: str, stream_id: int, hold_id: int) -> dict:
    """Return one hold to the available balance. Already-finished holds no-op."""
    conn = _db()
    try:
        _begin_immediate(conn)
        try:
            _get_owned_stream(conn, user_id, stream_id)
            _release_hold_row(conn, int(hold_id), "released", int(stream_id))
            stream = _get_owned_stream(conn, user_id, stream_id)
            _commit(conn)
        except Exception:
            _rollback(conn)
            raise
        return stream
    finally:
        conn.close()


def _persist_release_and_raise(
    conn: sqlite3.Connection,
    hold_id: int | None,
    stream_id: int,
    exc: Exception,
    cause: BaseException | None = None,
) -> None:
    """Roll the usage writes back, keep a release of `hold_id`, then raise."""
    _rollback(conn)
    if hold_id:
        _begin_immediate(conn)
        _release_hold_row(conn, int(hold_id), "released", int(stream_id))
        _commit(conn)
    if cause is not None:
        raise exc from cause
    raise exc


def record_usage(
    user_id: str,
    stream_id: int,
    calls: int,
    tokens: int,
    *,
    status_code: int,
    body: bytes | str | dict | list,
    content_type: str | None = None,
    observed: bool = False,
    request_id: str | None = None,
    truncated: bool = False,
    hold_id: int | None = None,
) -> dict:
    """Phase 2. Hash the upstream body and bind it to a hold.

    Empty, error, and garbage responses raise FulfillmentRejected.
    The estimate hold, when `hold_id` is set, is released and the
    pending balance does not move. A priced artifact increases pending
    and keeps the same number of micro-USDC in `held_micro_usdc`.

    This does not settle. `just_settled_micro_usdc` stays 0 until a
    capture signature verifies.
    """
    now = int(time.time())
    request_key = (request_id or "").strip() or None
    bound_hold = int(hold_id) if hold_id else None
    _expire_committed(int(stream_id), now)
    conn = _db()
    try:
        _begin_immediate(conn)
        try:
            stream = _record_usage_locked(
                conn,
                user_id=user_id,
                stream_id=stream_id,
                calls=calls,
                tokens=tokens,
                status_code=status_code,
                body=body,
                content_type=content_type,
                observed=observed,
                request_key=request_key,
                truncated=truncated,
                hold_id=bound_hold,
                now=now,
            )
            _commit(conn)
            return stream
        except Exception:
            _rollback(conn)
            raise
    finally:
        conn.close()


def _record_usage_locked(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    stream_id: int,
    calls: int,
    tokens: int,
    status_code: int,
    body: bytes | str | dict | list,
    content_type: str | None,
    observed: bool,
    request_key: str | None,
    truncated: bool,
    hold_id: int | None,
    now: int,
) -> dict:
    stream = _get_owned_stream(conn, user_id, stream_id)
    if stream["status"] != "open":
        _persist_release_and_raise(conn, hold_id, stream_id, StreamClosed("StreamAlreadyClosed"))

    try:
        artifact = verify_fulfillment(
            stream_id=stream_id,
            upstream=stream["upstream"],
            status_code=status_code,
            body=body,
            content_type=content_type,
            claimed_calls=int(calls),
            claimed_tokens=int(tokens),
            observed=observed,
            truncated=truncated,
        )
    except FulfillmentRejected as exc:
        _persist_release_and_raise(conn, hold_id, stream_id, exc)

    prior = None
    if request_key:
        prior = conn.execute(
            """
            SELECT calls, tokens, micro_usdc, artifact_hash
              FROM mpp_request_keys
             WHERE stream_id = ? AND request_id = ?
            """,
            (int(stream_id), request_key),
        ).fetchone()
        if prior is not None and artifact.tokens <= int(prior[1]):
            if hold_id:
                _release_hold_row(conn, int(hold_id), "released", int(stream_id))
            fresh = _get_owned_stream(conn, user_id, stream_id)
            return _idempotent_replay(fresh, str(prior[3]))

    if prior is not None:
        calls_billed = 0
        tokens_billed = artifact.tokens - int(prior[1])
    else:
        calls_billed = artifact.calls
        tokens_billed = artifact.tokens
    added = tokens_billed * int(stream["rate_per_token_micro_usdc"]) + calls_billed * int(
        stream["rate_per_call_micro_usdc"]
    )
    if added <= 0:
        if prior is not None:
            if hold_id:
                _release_hold_row(conn, int(hold_id), "released", int(stream_id))
            fresh = _get_owned_stream(conn, user_id, stream_id)
            return _idempotent_replay(fresh, str(prior[3]))
        _persist_release_and_raise(
            conn,
            hold_id,
            stream_id,
            FulfillmentRejected("stream rates price this artifact at zero"),
        )

    if calls_billed == artifact.calls and tokens_billed == artifact.tokens:
        digest = artifact.artifact_hash.hex()
        body_sha = artifact.body_sha256.hex()
    else:
        raw = coerce_body(body)
        preimage = canonical_preimage(
            stream_id=stream_id,
            upstream=stream["upstream"],
            status_code=int(status_code),
            body=bytes(raw),
            calls=calls_billed,
            tokens=tokens_billed,
        )
        digest = sha256(preimage).hex()
        body_sha = sha256(bytes(raw)).hex()

    active_hold = _active_hold(conn, hold_id, stream_id)
    if active_hold is not None and int(active_hold[2]) <= now:
        _release_hold_row(conn, int(active_hold[0]), "expired", int(stream_id))
        active_hold = None

    if active_hold is not None:
        locked = int(active_hold[1])
        delta = int(added) - locked
        placed = _cap_lock_update(
            conn,
            user_id,
            stream_id,
            calls=calls_billed,
            tokens=tokens_billed,
            pending_delta=int(added),
            held_delta=delta,
        )
        if not placed:
            fresh = _get_owned_stream(conn, user_id, stream_id)
            if fresh["status"] != "open":
                _persist_release_and_raise(
                    conn, hold_id, stream_id, StreamClosed("StreamAlreadyClosed")
                )
            _persist_release_and_raise(conn, hold_id, stream_id, BudgetExceeded("BudgetExceeded"))
        marked = conn.execute(
            """
            UPDATE mpp_holds
               SET micro_usdc = ?, artifact_hash = ?
             WHERE id = ? AND stream_id = ? AND status = 'held'
            """,
            (int(added), digest, int(active_hold[0]), int(stream_id)),
        )
        if marked.rowcount != 1:
            _persist_release_and_raise(conn, hold_id, stream_id, BudgetExceeded("BudgetExceeded"))
        bound_id = int(active_hold[0])
    else:
        placed = _cap_lock_update(
            conn,
            user_id,
            stream_id,
            calls=calls_billed,
            tokens=tokens_billed,
            pending_delta=int(added),
            held_delta=int(added),
        )
        if not placed:
            fresh = _get_owned_stream(conn, user_id, stream_id)
            if fresh["status"] != "open":
                _persist_release_and_raise(
                    conn, hold_id, stream_id, StreamClosed("StreamAlreadyClosed")
                )
            _persist_release_and_raise(conn, hold_id, stream_id, BudgetExceeded("BudgetExceeded"))
        bound_id = _insert_hold(conn, stream_id, int(added), digest, now)

    try:
        conn.execute(
            """
            INSERT INTO mpp_artifacts
              (stream_id, artifact_hash, body_sha256, calls, tokens,
               micro_usdc, settled, ts)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?)
            """,
            (
                stream_id,
                digest,
                body_sha,
                calls_billed,
                tokens_billed,
                int(added),
                now,
            ),
        )
    except sqlite3.IntegrityError:
        # The fulfillment hash is the request signature. A retry of the
        # same body, with or without X-Idempotency-Key, hits the unique
        # (stream_id, artifact_hash) row. Roll the new increment back
        # and return the already-metered receipt. The session token is
        # not an idempotency key by itself.
        _rollback(conn)
        if hold_id:
            _begin_immediate(conn)
            _release_hold_row(conn, int(hold_id), "released", int(stream_id))
            fresh = _get_owned_stream(conn, user_id, stream_id)
            _commit(conn)
        else:
            fresh = _get_owned_stream(conn, user_id, stream_id)
        return _idempotent_replay(fresh, digest)

    if request_key:
        if prior is None:
            try:
                conn.execute(
                    """
                    INSERT INTO mpp_request_keys
                      (stream_id, request_id, calls, tokens, micro_usdc, artifact_hash)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        int(stream_id),
                        request_key,
                        int(artifact.calls),
                        int(artifact.tokens),
                        int(added),
                        digest,
                    ),
                )
            except sqlite3.IntegrityError as exc:
                _persist_release_and_raise(
                    conn, hold_id, stream_id, ReplayRejected("NonceReused"), exc
                )
        else:
            updated = conn.execute(
                """
                UPDATE mpp_request_keys
                   SET calls = ?,
                       tokens = ?,
                       micro_usdc = micro_usdc + ?,
                       artifact_hash = ?
                 WHERE stream_id = ? AND request_id = ? AND tokens = ?
                """,
                (
                    int(artifact.calls),
                    int(artifact.tokens),
                    int(added),
                    digest,
                    int(stream_id),
                    request_key,
                    int(prior[1]),
                ),
            )
            if updated.rowcount != 1:
                _persist_release_and_raise(conn, hold_id, stream_id, ReplayRejected("NonceReused"))

    stream = _get_owned_stream(conn, user_id, stream_id)
    _emit_event(
        conn,
        user_id=user_id,
        stream=stream,
        kind="record",
        calls=calls_billed,
        tokens=tokens_billed,
        micro_usdc=int(added),
        ts=now,
    )
    stream["just_settled_micro_usdc"] = 0
    stream["artifact_hash"] = digest
    stream["idempotent_replay"] = False
    stream["calls_billed"] = calls_billed
    stream["tokens_billed"] = tokens_billed
    stream["hold_id"] = bound_id
    return stream


def _active_hold(
    conn: sqlite3.Connection,
    hold_id: int | None,
    stream_id: int,
):
    if not hold_id:
        return None
    row = conn.execute(
        """
        SELECT id, micro_usdc, expires_at, status, stream_id
          FROM mpp_holds WHERE id = ?
        """,
        (int(hold_id),),
    ).fetchone()
    if row is None or int(row[4]) != int(stream_id) or row[3] != "held":
        return None
    return row


def meter_proxy_response(
    user_id: str,
    stream_id: int,
    upstream: str,
    status_code: int,
    body: bytes | str | dict | list,
    content_type: str | None = None,
    request_id: str | None = None,
    truncated: bool = False,
    hold_id: int | None = None,
) -> dict:
    """Bill a response the proxy itself observed.

    The stream's `upstream` is the provider scope. A call to a
    different provider does not debit this stream. `hold_id` is the
    phase-1 estimate lock; a rejected body releases it.
    """
    conn = _db()
    try:
        stream = _get_owned_stream(conn, user_id, stream_id)
    finally:
        conn.close()
    if stream["upstream"] != upstream:
        if hold_id:
            release_hold(user_id, stream_id, int(hold_id))
        raise FulfillmentRejected("provider outside stream scope")
    return record_usage(
        user_id,
        stream_id,
        1,
        0,
        status_code=status_code,
        body=body,
        content_type=content_type,
        observed=True,
        request_id=request_id,
        truncated=truncated,
        hold_id=hold_id,
    )


def _drop_unverified_pending(
    conn: sqlite3.Connection,
    user_id: str,
    stream: dict,
) -> dict:
    """Pending with no artifact row is not capturable. Drop it.

    Does not move settled balance and does not submit `mpp_settle`.
    """
    artifacts = _unsettled_artifacts(conn, stream["id"])
    verified = sum(int(row["micro_usdc"]) for row in artifacts)
    if int(stream["pending_micro_usdc"]) != verified:
        conn.execute(
            """
            UPDATE mpp_streams
               SET pending_micro_usdc = ?
             WHERE id = ? AND user_id = ?
            """,
            (verified, stream["id"], user_id),
        )
        stream = _get_owned_stream(conn, user_id, stream["id"])
    return stream


def settle_stream(user_id: str, stream_id: int) -> dict:
    """Reconcile unverified pending. Does not capture.

    A closed stream raises StreamClosed. Expired holds return to the
    available balance before the pending check. `just_settled_micro_usdc`
    is 0: only `settle_receipt` with a capture signature debits.
    """
    now = int(time.time())
    _expire_committed(int(stream_id), now)
    conn = _db()
    try:
        _begin_immediate(conn)
        try:
            stream = _get_owned_stream(conn, user_id, stream_id)
            if stream["status"] != "open":
                raise StreamClosed("StreamAlreadyClosed")
            stream = _drop_unverified_pending(conn, user_id, stream)
            _commit(conn)
        except Exception:
            _rollback(conn)
            raise
        stream["just_settled_micro_usdc"] = 0
        return stream
    finally:
        conn.close()


def _hold_for_artifact(conn: sqlite3.Connection, stream_id: int, digest: str):
    return conn.execute(
        """
        SELECT id, micro_usdc, status, expires_at
          FROM mpp_holds
         WHERE stream_id = ? AND artifact_hash = ?
         ORDER BY id DESC
         LIMIT 1
        """,
        (int(stream_id), digest),
    ).fetchone()


def settle_receipt(
    user_id: str,
    stream_id: int,
    artifact_hash: str,
    session_key: str | None = None,
    signature: bytes | str | None = None,
) -> dict:
    """Phase 3. Capture one artifact after the consumer MAC verifies.

    Unknown hashes raise FulfillmentRejected before the signature is
    checked. A closed stream raises StreamAlreadyClosed before that.
    An already-settled hash raises ReplayRejected and does not release
    the capture. An expired hold returns the lock, then raises
    HoldExpired. A bad signature releases the hold (pending and held
    both decrease) and raises CaptureRejected. A later valid signature
    can lock the cost again and capture it when the cap still allows.

    The on-chain debit runs only on this path. Stub mode, with no
    chain settler configured, still moves the ledger and advances
    `last_settled_seq`. The returned receipt carries `sequence_number`
    and `request_hash`. `sequence_number` is the stored sequence when
    this capture advanced it, and the previous sequence when the chain
    settler is configured but the submission did not land.
    """
    from .capture import coerce_signature

    digest = str(artifact_hash).strip().lower()
    if len(digest) != 64:
        raise FulfillmentRejected("unverified artifact")
    try:
        bytes.fromhex(digest)
    except ValueError as exc:
        raise FulfillmentRejected("unverified artifact") from exc

    now = int(time.time())
    _expire_committed(int(stream_id), now)
    conn = _db()
    try:
        _begin_immediate(conn)
        try:
            stream = _capture_locked(
                conn,
                user_id=user_id,
                stream_id=stream_id,
                digest=digest,
                session_key=session_key,
                signature=signature,
                now=now,
                coerce_signature=coerce_signature,
            )
            _commit(conn)
            return stream
        except Exception:
            _rollback(conn)
            raise
    finally:
        conn.close()


def _capture_locked(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    stream_id: int,
    digest: str,
    session_key: str | None,
    signature: bytes | str | None,
    now: int,
    coerce_signature,
) -> dict:
    stream = _get_owned_stream(conn, user_id, stream_id)
    if stream["status"] != "open":
        raise StreamClosed("StreamAlreadyClosed")

    row = conn.execute(
        """
        SELECT id, micro_usdc, settled
          FROM mpp_artifacts
         WHERE stream_id = ? AND artifact_hash = ?
        """,
        (int(stream_id), digest),
    ).fetchone()
    if row is None:
        raise FulfillmentRejected("unverified artifact")
    art_id, cost, already = int(row[0]), int(row[1]), int(row[2])
    if already:
        raise ReplayRejected("NonceReused")
    if cost <= 0:
        raise FulfillmentRejected("unverified artifact")

    hold = _hold_for_artifact(conn, stream_id, digest)
    if hold is None:
        raise FulfillmentRejected("unverified artifact")
    hold_id, _hold_micro, hold_status, hold_exp = int(hold[0]), int(hold[1]), hold[2], int(hold[3])
    if hold_status == "expired" or (hold_status == "held" and hold_exp <= now):
        if hold_status == "held":
            _release_hold_row(conn, hold_id, "expired", int(stream_id))
        _commit(conn)
        raise HoldExpired("hold expired")
    if hold_status == "captured":
        raise ReplayRejected("NonceReused")

    if not verify_artifact_signature(session_key or "", digest, signature):
        if hold_status == "held":
            _release_hold_row(conn, hold_id, "released", int(stream_id))
            _commit(conn)
        raise CaptureRejected("invalid capture signature")

    try:
        sig = coerce_signature(signature)
    except ValueError as exc:
        raise CaptureRejected("invalid capture signature") from exc

    if hold_status == "released":
        relocked = _cap_lock_update(
            conn,
            user_id,
            stream_id,
            calls=0,
            tokens=0,
            pending_delta=cost,
            held_delta=cost,
        )
        if not relocked:
            raise BudgetExceeded("BudgetExceeded")
        conn.execute(
            """
            UPDATE mpp_holds
               SET status = 'held', micro_usdc = ?, expires_at = ?
             WHERE id = ? AND status = 'released'
            """,
            (cost, now + _hold_ttl_secs(), hold_id),
        )

    _race_window()
    request_hash = bytes.fromhex(digest)
    root = artifact_root([request_hash])
    last_seq = int(stream.get("last_settled_seq") or 0)
    if last_seq < 0 or last_seq >= 0xFFFFFFFFFFFFFFFF:
        raise ReplayRejected("SettlementReplay")
    next_seq = last_seq + 1
    if next_seq <= last_seq:
        raise ReplayRejected("SettlementReplay")
    outcome = settle_on_chain(
        int(stream_id),
        cost,
        root,
        next_seq,
        sig,
        request_hash,
        db_conn=conn,
    )
    if outcome.mode == "indeterminate":
        _rollback(conn)
        raise CaptureRejected("settlement indeterminate")
    if outcome.mode == "failed" or (
        outcome.mode == "submitted" and outcome.debited_micro_usdc <= 0
    ):
        _rollback(conn)
        raise CaptureRejected("settlement failed")
    if outcome.mode == "stub" and not _stub_ledger():
        _rollback(conn)
        raise CaptureRejected("settlement stub while chain settler configured")
    advance_seq = outcome.mode == "submitted" or (outcome.mode == "stub" and _stub_ledger())

    if advance_seq:
        cur = conn.execute(
            """
            UPDATE mpp_streams
               SET pending_micro_usdc = pending_micro_usdc - ?,
                   held_micro_usdc = held_micro_usdc - ?,
                   settled_micro_usdc = settled_micro_usdc + ?,
                   last_settled_at = ?,
                   last_settled_seq = ?
             WHERE id = ? AND user_id = ?
               AND status = 'open'
               AND pending_micro_usdc >= ?
               AND held_micro_usdc >= ?
               AND last_settled_seq = ?
               AND (max_total_micro_usdc IS NULL
                    OR settled_micro_usdc + ? <= max_total_micro_usdc)
            """,
            (
                cost,
                cost,
                cost,
                now,
                next_seq,
                int(stream_id),
                user_id,
                cost,
                cost,
                last_seq,
                cost,
            ),
        )
    else:
        cur = conn.execute(
            """
            UPDATE mpp_streams
               SET pending_micro_usdc = pending_micro_usdc - ?,
                   held_micro_usdc = held_micro_usdc - ?,
                   settled_micro_usdc = settled_micro_usdc + ?,
                   last_settled_at = ?
             WHERE id = ? AND user_id = ?
               AND status = 'open'
               AND pending_micro_usdc >= ?
               AND held_micro_usdc >= ?
               AND (max_total_micro_usdc IS NULL
                    OR settled_micro_usdc + ? <= max_total_micro_usdc)
            """,
            (cost, cost, cost, now, int(stream_id), user_id, cost, cost, cost),
        )
    if cur.rowcount != 1:
        fresh = _get_owned_stream(conn, user_id, stream_id)
        if fresh["status"] != "open":
            raise StreamClosed("StreamAlreadyClosed")
        if advance_seq and int(fresh.get("last_settled_seq") or 0) != last_seq:
            raise ReplayRejected("SettlementReplay")
        raise BudgetExceeded("BudgetExceeded")

    marked = conn.execute(
        "UPDATE mpp_artifacts SET settled = 1 WHERE id = ? AND settled = 0",
        (art_id,),
    )
    if marked.rowcount != 1:
        raise ReplayRejected("NonceReused")
    conn.execute(
        "UPDATE mpp_holds SET status = 'captured' WHERE id = ?",
        (hold_id,),
    )
    stream = _get_owned_stream(conn, user_id, stream_id)
    _emit_event(
        conn,
        user_id=user_id,
        stream=stream,
        kind="settle",
        micro_usdc=cost,
        ts=now,
    )
    stream["just_settled_micro_usdc"] = cost
    stream["artifact_hash"] = digest
    stream["request_hash"] = digest
    stream["sequence_number"] = (
        next_seq if advance_seq else int(stream.get("last_settled_seq") or 0)
    )
    stream["settle_mode"] = outcome.mode
    return stream


def close_stream(user_id: str, stream_id: int) -> dict:
    """Release open holds back to available balance, then mark closed.

    Does not capture. Closing an already-closed stream returns the row
    with `just_settled_micro_usdc=0`.
    """
    now = int(time.time())
    conn = _db()
    try:
        _begin_immediate(conn)
        try:
            stream = _get_owned_stream(conn, user_id, stream_id)
            if stream["status"] == "closed":
                _commit(conn)
                stream["just_settled_micro_usdc"] = 0
                return stream
            _release_open_holds(conn, stream_id)
            conn.execute(
                """
                UPDATE mpp_streams
                   SET pending_micro_usdc = 0,
                       held_micro_usdc = 0,
                       status = 'closed',
                       closed_at = ?
                 WHERE id = ? AND user_id = ? AND status = 'open'
                """,
                (now, stream_id, user_id),
            )
            stream = _get_owned_stream(conn, user_id, stream_id)
            _emit_event(
                conn,
                user_id=user_id,
                stream=stream,
                kind="close",
                ts=now,
            )
            _commit(conn)
        except Exception:
            _rollback(conn)
            raise
        stream["just_settled_micro_usdc"] = 0
        return stream
    finally:
        conn.close()


def record_tx_signature(
    user_id: str,
    stream_id: int,
    tx_signature: str,
    stream_pda: str | None = None,
    stream_usdc_ata: str | None = None,
) -> dict:
    """Persist the on-chain tx signature returned by the frontend wallet
    adapter after it signed+sent the `open_payment_stream` ix (or, later,
    `withdraw_agent_wallet`). Returns the updated stream row.

    Spec 10 Phase 10.5 wallet sign-off. The signature is opaque to us —
    we don't verify it against Solana RPC here (that's what
    /mpp/streams/{id}/settle does for settle ix's, and what x402
    payment-proof verification does for payments). The frontend already
    awaited `confirmTransaction(..., 'confirmed')` before calling this
    endpoint, so failing to land = failing to ever reach here.

    Idempotency: re-posting the same signature is a no-op. Posting a
    new signature for a stream that already has one OVERWRITES — see
    `_row_to_stream` docstring; withdraw is terminal so the open-sig
    is preserved in mpp_events anyway.

    Raises StreamNotFound if the stream id doesn't belong to user_id.
    """
    if not tx_signature or not tx_signature.strip():
        raise ValueError("tx_signature is required")
    sig = tx_signature.strip()
    conn = _db()
    try:
        # Owner check via _get_owned_stream — raises if foreign user_id.
        _get_owned_stream(conn, user_id, stream_id)
        # Build a dynamic UPDATE so callers who already wrote stream_pda /
        # stream_usdc_ata via open_stream don't clobber them with NULL.
        sets = ["tx_signature = ?"]
        vals: list = [sig]
        if stream_pda:
            sets.append("stream_pda = ?")
            vals.append(stream_pda.strip())
        if stream_usdc_ata:
            sets.append("stream_usdc_ata = ?")
            vals.append(stream_usdc_ata.strip())
        vals.extend([stream_id, user_id])
        conn.execute(
            f"UPDATE mpp_streams SET {', '.join(sets)} WHERE id = ? AND user_id = ?",
            tuple(vals),
        )
        stream = _get_owned_stream(conn, user_id, stream_id)
        conn.commit()
        return stream
    finally:
        conn.close()


def list_streams(user_id: str) -> dict:
    """Return all streams for a user, newest first, plus a summary
    block matching the frontend's MppSummary shape.

    Expired holds are released before the rows are read, so available
    escrow includes locks whose TTL has passed.
    """
    now = int(time.time())
    conn = _db()
    try:
        _begin_immediate(conn)
        try:
            ids = conn.execute(
                "SELECT id FROM mpp_streams WHERE user_id = ?",
                (user_id,),
            ).fetchall()
            for (stream_id,) in ids:
                _expire_stream_holds(conn, int(stream_id), now)
            _commit(conn)
        except Exception:
            _rollback(conn)
            raise
        rows = conn.execute(
            f"SELECT {_STREAM_COLS} FROM mpp_streams WHERE user_id = ? ORDER BY opened_at DESC",
            (user_id,),
        ).fetchall()
        streams = [_row_to_stream(r) for r in rows]

        streams_total = len(streams)
        streams_open = sum(1 for s in streams if s["status"] == "open")
        calls_total = sum(s["total_calls"] for s in streams)
        tokens_total = sum(s["total_tokens"] for s in streams)
        settled_micro = sum(s["settled_micro_usdc"] for s in streams)
        pending_micro = sum(s["pending_micro_usdc"] for s in streams)

        # The frontend prints these via `.toFixed(6)` — so usd, not micro.
        summary = {
            "streams_total": streams_total,
            "streams_open": streams_open,
            "calls_total": calls_total,
            "tokens_total": tokens_total,
            "settled_usd": round(settled_micro / 1_000_000, 6),
            "pending_usd": round(pending_micro / 1_000_000, 6),
        }
        return {"streams": streams, "summary": summary}
    finally:
        conn.close()


def last_receipt(user_id: str) -> dict | None:
    """Newest hold/capture for the status strip. Hash prefix + settle_mode."""
    conn = _db()
    try:
        row = conn.execute(
            """
            SELECT h.artifact_hash, h.status, h.micro_usdc, s.id, s.tx_signature,
                   s.settled_micro_usdc
              FROM mpp_holds h
              JOIN mpp_streams s ON s.id = h.stream_id
             WHERE s.user_id = ? AND h.artifact_hash IS NOT NULL
             ORDER BY h.id DESC
             LIMIT 1
            """,
            (user_id,),
        ).fetchone()
        if row is None:
            return None
        digest, hold_status, micro, stream_id, open_sig, settled = row
        attempt = conn.execute(
            """
            SELECT tx_signature, success, error
              FROM mpp_settle_attempts
             WHERE stream_id = ?
             ORDER BY ts DESC, id DESC
             LIMIT 1
            """,
            (int(stream_id),),
        ).fetchone()
        mode = "stub"
        sig = open_sig
        if hold_status == "held":
            mode = "held"
        elif hold_status == "captured" and attempt and int(attempt[1]) == 1:
            mode = "submitted"
            sig = attempt[0] or open_sig
        elif hold_status == "captured" and attempt and int(attempt[1]) == 0:
            mode = "failed"
            sig = attempt[0] or open_sig
        elif hold_status == "captured" and int(settled or 0) > 0:
            mode = "stub"
        elif hold_status in ("released", "expired"):
            mode = "failed"
        digest = str(digest)
        return {
            "hash": digest,
            "hash8": digest[:8],
            "mode": mode,
            "signature": sig,
            "stream_id": int(stream_id),
            "micro_usdc": int(micro or 0),
        }
    finally:
        conn.close()


def status_strip(user_id: str) -> dict:
    """Coinbase-style top bar: stream remaining + last receipt."""
    listed = list_streams(user_id)
    open_streams = [s for s in listed["streams"] if s.get("status") == "open"]
    remaining = None
    if open_streams:
        remaining = sum(
            int(s["escrow_micro_usdc"])
            for s in open_streams
            if s.get("escrow_micro_usdc") is not None
        )
    return {
        "stream_remaining_micro_usdc": remaining,
        "streams_open": listed["summary"]["streams_open"],
        "last_receipt": last_receipt(user_id),
    }


def list_events(user_id: str, limit: int = 20) -> dict:
    """Return the user's recent stream events, newest first."""
    limit = max(1, min(int(limit), 100))
    conn = _db()
    try:
        rows = conn.execute(
            f"SELECT {_EVENT_COLS} FROM mpp_events "
            f"WHERE user_id = ? ORDER BY ts DESC, id DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
        return {"events": [_row_to_event(r) for r in rows]}
    finally:
        conn.close()
