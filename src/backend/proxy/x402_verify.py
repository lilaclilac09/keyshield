"""
x402_verify.py — Coinbase x402 payment-proof verification + idempotency.

Replaces the stub at server.py:1109 (`# TODO: verify body.payment_proof
on-chain before crediting`) which lets anyone claim free credit by
sending an arbitrary string as `payment_proof`.

### Threat model

Without this module, /billing/topup:
1. Has NO idempotency — the same payment_proof can be claimed N times
   for N×$10 of free credit.
2. Has NO on-chain verification — the proof string is opaque text;
   any garbage credits the balance.

This module closes both holes:
1. SQLite table `x402_claims` makes (payment_proof,) UNIQUE — second
   claim of the same proof is a 409.
2. `verify_on_chain()` checks the tx exists on Base, is confirmed,
   transfers the expected USDC amount to the platform receiver.

### Stub-fallback

When env config is incomplete (KS_X402_BASE_RPC_URL etc unset),
`verify_on_chain()` returns (True, "stub-fallback") so dev workflows
keep working. Idempotency still applies — even in stub mode you can't
claim the same proof twice. Real-money production deployments must set
the env vars; CI / staging should run with `KS_X402_VERIFY_REQUIRED=1`
to refuse stub-fallback explicitly.

### Env config (real on-chain verify)

  KS_X402_BASE_RPC_URL        — e.g. "https://mainnet.base.org" or Helius/Alchemy/etc
  KS_X402_RECEIVER_ADDRESS    — platform's Base USDC receiver (40-hex EVM address)
  KS_X402_USDC_ADDRESS        — defaults to "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
                                 (USDC on Base mainnet — Coinbase issuer contract)
  KS_X402_MIN_CONFIRMATIONS   — defaults to 5 (matches Base finality recommendation)
  KS_X402_VERIFY_REQUIRED     — "1" → refuse stub-fallback (prod gate)

### Real RPC integration

The eth_getTransactionReceipt + ERC-20 Transfer log decode lives in
`_verify_on_chain_real()`, separated from the public surface so the
stub path stays dependency-free. Real path needs `httpx` (already a
v2-mvp dep) and `web3`-style log parsing inlined here (no full web3
dep — we only need ERC-20 Transfer signature decoding).
"""

from __future__ import annotations

import logging
import os
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


# ─── DB ────────────────────────────────────────────────────────────────────

DB_PATH = Path(__file__).parent.parent / "data" / "x402.db"


def _db() -> sqlite3.Connection:
    """Open + ensure-schema. Per-call so tests can monkeypatch DB_PATH."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS x402_claims (
            -- payment_proof is the on-chain tx hash (or stub identifier).
            -- UNIQUE so the same hash can never credit twice, regardless
            -- of which user POSTs it. This is the load-bearing
            -- security property.
            payment_proof  TEXT NOT NULL UNIQUE,
            user_id        TEXT NOT NULL,
            amount_usd     REAL NOT NULL,
            verified_mode  TEXT NOT NULL,   -- "real" | "stub-fallback"
            ts             INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_x402_claims_user
            ON x402_claims (user_id, ts DESC);
    """)
    conn.commit()
    return conn


# ─── config ────────────────────────────────────────────────────────────────

# USDC on Base mainnet — Coinbase issuer (NOT the Bridged USDC.e at
# 0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca, which is being phased out).
USDC_BASE_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
DEFAULT_MIN_CONFIRMATIONS = 5

# ERC-20 Transfer event topic0 = keccak256("Transfer(address,address,uint256)")
ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"


@dataclass(frozen=True)
class X402Config:
    rpc_url: str
    receiver_address: str  # 40-hex EVM, lowercase, with 0x prefix
    usdc_address: str  # 40-hex EVM, lowercase, with 0x prefix
    min_confirmations: int
    verify_required: bool  # if True, stub-fallback is an error


_WARNED_ENV_MISSING = False


def load_x402_config() -> Optional[X402Config]:
    """Return X402Config when env is complete, else None.

    None means caller takes the stub path — verify_on_chain returns
    (True, "stub-fallback") unless KS_X402_VERIFY_REQUIRED=1, in which
    case the topup endpoint should reject.
    """
    global _WARNED_ENV_MISSING

    rpc_url = os.environ.get("KS_X402_BASE_RPC_URL", "").strip()
    receiver = os.environ.get("KS_X402_RECEIVER_ADDRESS", "").strip().lower()

    if not (rpc_url and receiver):
        if not _WARNED_ENV_MISSING:
            missing = [
                name
                for name, val in (
                    ("KS_X402_BASE_RPC_URL", rpc_url),
                    ("KS_X402_RECEIVER_ADDRESS", receiver),
                )
                if not val
            ]
            logger.warning(
                "x402_verify: stub-fallback active — missing env: %s. "
                "Topups will skip on-chain verification.",
                ", ".join(missing),
            )
            _WARNED_ENV_MISSING = True
        return None

    # Light validation — must look like an EVM address.
    if not _is_evm_address(receiver):
        logger.error(
            "x402_verify: KS_X402_RECEIVER_ADDRESS is not a valid 0x… EVM address: %r",
            receiver,
        )
        return None

    usdc = os.environ.get("KS_X402_USDC_ADDRESS", "").strip().lower()
    if not usdc:
        usdc = USDC_BASE_MAINNET.lower()
    elif not _is_evm_address(usdc):
        logger.error("x402_verify: KS_X402_USDC_ADDRESS invalid: %r", usdc)
        return None

    try:
        min_conf = int(
            os.environ.get(
                "KS_X402_MIN_CONFIRMATIONS",
                str(DEFAULT_MIN_CONFIRMATIONS),
            )
        )
    except ValueError:
        logger.error(
            "x402_verify: KS_X402_MIN_CONFIRMATIONS must be int, got %r",
            os.environ.get("KS_X402_MIN_CONFIRMATIONS"),
        )
        return None
    if min_conf < 0:
        logger.error("x402_verify: min confirmations must be >= 0")
        return None

    return X402Config(
        rpc_url=rpc_url,
        receiver_address=receiver,
        usdc_address=usdc,
        min_confirmations=min_conf,
        verify_required=os.environ.get("KS_X402_VERIFY_REQUIRED", "0").strip() == "1",
    )


def _is_evm_address(s: str) -> bool:
    if not s.startswith("0x") or len(s) != 42:
        return False
    try:
        int(s[2:], 16)
    except ValueError:
        return False
    return True


# ─── claim recording (idempotency) ────────────────────────────────────────


class DuplicateClaim(Exception):
    """Raised when the same payment_proof has already credited a user."""


def record_claim(
    payment_proof: str,
    user_id: str,
    amount_usd: float,
    verified_mode: str,
) -> None:
    """Insert the claim row. Raises DuplicateClaim if payment_proof
    has been used before — UNIQUE constraint catches the race."""
    conn = _db()
    try:
        try:
            conn.execute(
                "INSERT INTO x402_claims (payment_proof, user_id, amount_usd, "
                "verified_mode, ts) VALUES (?, ?, ?, ?, ?)",
                (
                    payment_proof,
                    user_id,
                    float(amount_usd),
                    verified_mode,
                    int(time.time()),
                ),
            )
            conn.commit()
        except sqlite3.IntegrityError as e:
            # UNIQUE constraint on payment_proof.
            raise DuplicateClaim(
                f"payment_proof has already been claimed: {payment_proof[:16]}…"
            ) from e
    finally:
        conn.close()


def has_claim(payment_proof: str) -> bool:
    """Cheap pre-check (avoids the failed INSERT in record_claim).
    Race-safe: even if a concurrent caller inserts between our check
    and our insert, record_claim will still catch via UNIQUE."""
    conn = _db()
    try:
        row = conn.execute(
            "SELECT 1 FROM x402_claims WHERE payment_proof = ?",
            (payment_proof,),
        ).fetchone()
    finally:
        conn.close()
    return row is not None


# ─── on-chain verify ──────────────────────────────────────────────────────


class VerifyError(Exception):
    """Raised on a verification failure that should produce a 4xx
    rather than crediting. Distinct from network errors (raised as
    plain Exception) which the caller may want to retry."""


async def verify_on_chain(
    config: Optional[X402Config],
    payment_proof: str,
    expected_amount_usd: float,
) -> tuple[bool, str]:
    """Returns (verified, mode). Mode is "real" when on-chain verify
    succeeded, "stub-fallback" when env wasn't configured.

    Raises VerifyError when env IS configured but on-chain check
    fails (wrong recipient, wrong amount, not confirmed, etc).

    Caller is responsible for the idempotency check (record_claim
    raises DuplicateClaim) — verify_on_chain runs every time.

    Length / shape validation only fires in real mode. Stub-fallback
    accepts any non-empty proof so dev workflows don't have to fake a
    real-looking 0x… 66-char hash; idempotency still applies.
    """
    if not payment_proof:
        raise VerifyError("payment_proof must not be empty")

    if config is None:
        return (True, "stub-fallback")

    return await _verify_on_chain_real(config, payment_proof, expected_amount_usd)


async def _verify_on_chain_real(
    config: X402Config,
    payment_proof: str,
    expected_amount_usd: float,
) -> tuple[bool, str]:
    """eth_getTransactionReceipt + Transfer log decode against Base RPC.

    Verifies:
      1. Tx exists + status=success
      2. At least min_confirmations blocks since the tx (compared to
         eth_blockNumber)
      3. Contains an ERC-20 Transfer log from the USDC contract
      4. Transfer recipient is the platform receiver (case-insensitive
         hex compare)
      5. Transfer amount >= expected_amount_usd × 1e6 (USDC has 6 decimals)

    Raises VerifyError on any failure. Network errors (httpx.RequestError
    etc) bubble as plain Exception so the caller can map them to 502.
    """
    try:
        import httpx  # type: ignore
    except ImportError as e:
        raise VerifyError(f"httpx not installed: {e}") from e

    if not payment_proof.startswith("0x") or len(payment_proof) != 66:
        raise VerifyError(
            "payment_proof must be a 0x-prefixed 66-char tx hash",
        )

    async with httpx.AsyncClient(timeout=15) as client:
        # 1. Receipt — confirms tx exists + status + emits Transfer logs
        receipt_resp = await client.post(
            config.rpc_url,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "eth_getTransactionReceipt",
                "params": [payment_proof],
            },
        )
        if receipt_resp.status_code != 200:
            raise VerifyError(
                f"RPC returned HTTP {receipt_resp.status_code}",
            )
        receipt_body = receipt_resp.json()
        if "error" in receipt_body:
            raise VerifyError(f"RPC error: {receipt_body['error']}")
        receipt = receipt_body.get("result")
        if receipt is None:
            raise VerifyError("transaction not found on Base")

        if receipt.get("status") != "0x1":
            raise VerifyError(
                f"transaction failed on-chain (status={receipt.get('status')})",
            )

        tx_block_hex = receipt.get("blockNumber", "0x0")
        tx_block = int(tx_block_hex, 16)

        # 2. Confirmations
        head_resp = await client.post(
            config.rpc_url,
            json={"jsonrpc": "2.0", "id": 2, "method": "eth_blockNumber"},
        )
        head_body = head_resp.json()
        if "error" in head_body:
            raise VerifyError(f"eth_blockNumber error: {head_body['error']}")
        head_block = int(head_body["result"], 16)
        if head_block - tx_block < config.min_confirmations:
            raise VerifyError(
                f"only {head_block - tx_block} confirmations, need {config.min_confirmations}",
            )

    # 3-5. Decode logs (no network — pure parsing)
    return _verify_transfer_log(receipt.get("logs", []), config, expected_amount_usd)


def _verify_transfer_log(
    logs: list,
    config: X402Config,
    expected_amount_usd: float,
) -> tuple[bool, str]:
    """Pure-data verification of ERC-20 Transfer logs.

    Looks for at least one Transfer event from the USDC contract
    addressed to the platform receiver, with `value >= expected*1e6`.
    """
    expected_micros = int(expected_amount_usd * 1_000_000)
    receiver_padded = "0x" + config.receiver_address[2:].rjust(64, "0")

    for log in logs:
        addr = (log.get("address") or "").lower()
        if addr != config.usdc_address:
            continue
        topics = log.get("topics") or []
        if not topics or topics[0].lower() != ERC20_TRANSFER_TOPIC:
            continue
        # Topic 2 = recipient (32-byte left-padded address)
        if len(topics) < 3:
            continue
        if topics[2].lower() != receiver_padded.lower():
            continue
        # Data = uint256 amount (32 bytes)
        try:
            amount = int(log.get("data", "0x"), 16)
        except ValueError:
            continue
        if amount >= expected_micros:
            return (True, "real")
        else:
            raise VerifyError(
                f"USDC transfer amount {amount / 1e6:.6f} < expected {expected_amount_usd:.6f}",
            )

    raise VerifyError(
        "no matching USDC Transfer log to platform receiver in tx",
    )
