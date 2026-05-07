"""
Solana on-chain payment verification for /billing/topup-solana.

Two payment paths supported:
  - SOL native transfer (SystemProgram.transfer)
  - USDC SPL transfer (Token program transfer / transferChecked)

Verification uses Helius RPC `getTransaction` with `jsonParsed`
encoding so we don't have to decode raw base58 instruction data.

All `verify_*` helpers return the **on-chain amount** (lamports for
SOL, atomic USDC for SPL — 6 decimals) so the caller can convert to
USD with the Pyth quote and credit the user.

`fetch_sol_usd_price` hits Pyth Hermes (the public price oracle)
for the SOL/USD feed. No API key required.
"""

from __future__ import annotations
import time
from dataclasses import dataclass
from typing import Any

import httpx


# ─── constants ─────────────────────────────────────────────────────────────

SYSTEM_PROGRAM_ID = "11111111111111111111111111111111"
TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
MEMO_PROGRAM_V2 = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
MEMO_PROGRAM_V1 = "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo"

# USDC SPL mint addresses
USDC_MINT_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
USDC_MINT_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"

# Pyth Hermes feed IDs (network-agnostic; same id across testnet/mainnet)
PYTH_SOL_USD_FEED = (
    "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d"
)


# ─── exceptions ────────────────────────────────────────────────────────────


class PaymentVerificationError(Exception):
    """The supplied tx signature does not represent a valid payment."""


# ─── Pyth price ────────────────────────────────────────────────────────────


@dataclass
class SolUsdPrice:
    price_usd: float
    publish_time: int  # unix seconds
    confidence_usd: float


async def fetch_sol_usd_price(
    *,
    hermes_base: str = "https://hermes.pyth.network",
    fetch_impl: Any = None,
) -> SolUsdPrice:
    """Pull the latest SOL/USD price from Pyth Hermes."""
    client_ctx = (
        _ManualClient(fetch_impl) if fetch_impl else httpx.AsyncClient(timeout=8)
    )
    async with client_ctx as client:
        url = f"{hermes_base}/v2/updates/price/latest"
        params = {"ids[]": PYTH_SOL_USD_FEED, "parsed": "true"}
        resp = await client.get(url, params=params)
        if resp.status_code != 200:
            raise PaymentVerificationError(
                f"pyth hermes returned HTTP {resp.status_code}",
            )
        body = resp.json()

    parsed = body.get("parsed") or []
    if not parsed:
        raise PaymentVerificationError("pyth response missing `parsed` array")
    p = parsed[0].get("price") or {}
    raw = p.get("price")
    expo = p.get("expo")
    if raw is None or expo is None:
        raise PaymentVerificationError("pyth response missing price/expo")
    price = int(raw) * (10 ** int(expo))
    conf = int(p.get("conf") or 0) * (10 ** int(expo))
    return SolUsdPrice(
        price_usd=float(price),
        publish_time=int(p.get("publish_time") or time.time()),
        confidence_usd=float(conf),
    )


class _ManualClient:
    """Adapter for tests: wraps an injected fetch_impl as if it were an
    httpx AsyncClient. fetch_impl is a callable matching httpx's get/post."""

    def __init__(self, fetch_impl):
        self._fetch = fetch_impl

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        pass

    async def get(self, url: str, params: dict | None = None):
        return await self._fetch("GET", url, params=params, body=None)

    async def post(self, url: str, json: dict | None = None):
        return await self._fetch("POST", url, params=None, body=json)


# ─── Solana RPC ────────────────────────────────────────────────────────────


async def get_transaction(
    rpc_url: str,
    tx_signature: str,
    *,
    fetch_impl: Any = None,
    commitment: str = "confirmed",
) -> dict:
    """Call getTransaction(jsonParsed) and return the `result` object,
    or None if not found / not yet at the requested commitment.

    `commitment` is "confirmed" (default; ~13s, OK for ≤$10 demo
    payments) or "finalized" (32 confirmations; reorg-safe but
    slower). Pass through as-is to the RPC.
    """
    if commitment not in ("confirmed", "finalized"):
        raise PaymentVerificationError(
            f"unsupported commitment level: {commitment}",
        )
    body = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getTransaction",
        "params": [
            tx_signature,
            {
                "encoding": "jsonParsed",
                "commitment": commitment,
                "maxSupportedTransactionVersion": 0,
            },
        ],
    }
    client_ctx = (
        _ManualClient(fetch_impl) if fetch_impl else httpx.AsyncClient(timeout=10)
    )
    async with client_ctx as client:
        resp = await client.post(rpc_url, json=body)
        if resp.status_code != 200:
            raise PaymentVerificationError(
                f"solana rpc returned HTTP {resp.status_code}",
            )
        out = resp.json()
    if "error" in out:
        raise PaymentVerificationError(
            f"solana rpc error: {out['error'].get('message', out['error'])}",
        )
    return out.get("result")


# ─── instruction-finders ───────────────────────────────────────────────────


def _instructions(tx_result: dict) -> list[dict]:
    """Yield top-level instructions from a jsonParsed tx result. Inner
    instructions (CPI children) are NOT scanned — keep the verifier
    surface narrow on purpose."""
    msg = (tx_result.get("transaction") or {}).get("message") or {}
    return list(msg.get("instructions") or [])


def _verify_tx_succeeded(tx_result: dict) -> None:
    if not tx_result:
        raise PaymentVerificationError("transaction not found or not confirmed")
    meta = tx_result.get("meta") or {}
    if meta.get("err") is not None:
        raise PaymentVerificationError(
            f"transaction reverted on-chain: {meta['err']}",
        )


def find_sol_transfer(
    tx_result: dict,
    expected_sender: str,
    expected_recipient: str,
) -> int:
    """Find a SystemProgram.transfer ix matching sender/recipient.
    Returns lamports. Raises if no match."""
    _verify_tx_succeeded(tx_result)
    for ix in _instructions(tx_result):
        if ix.get("programId") != SYSTEM_PROGRAM_ID:
            continue
        parsed = ix.get("parsed") or {}
        if parsed.get("type") != "transfer":
            continue
        info = parsed.get("info") or {}
        src = info.get("source")
        dst = info.get("destination")
        lam = info.get("lamports")
        if src == expected_sender and dst == expected_recipient and lam is not None:
            return int(lam)
    raise PaymentVerificationError(
        f"no SystemProgram.transfer from {expected_sender} to {expected_recipient}",
    )


def find_usdc_transfer(
    tx_result: dict,
    expected_sender_authority: str,
    expected_recipient_owner: str,
    *,
    usdc_mint: str = USDC_MINT_MAINNET,
) -> int:
    """Find an SPL token transfer (or transferChecked) of USDC from
    sender to recipient. Returns USDC atoms (6 decimals).

    Verification uses postTokenBalances to map ATA → owner.
    """
    _verify_tx_succeeded(tx_result)
    meta = tx_result.get("meta") or {}
    post_token_bals = meta.get("postTokenBalances") or []
    msg = (tx_result.get("transaction") or {}).get("message") or {}
    account_keys = msg.get("accountKeys") or []
    # accountKeys with jsonParsed is a list of dicts with {pubkey, signer, writable}.
    if account_keys and isinstance(account_keys[0], dict):
        keys = [k.get("pubkey") for k in account_keys]
    else:
        keys = list(account_keys)

    def ata_owner(ata_pubkey: str) -> tuple[str | None, str | None]:
        """Look up (owner, mint) for an ATA from postTokenBalances."""
        for tb in post_token_bals:
            idx = tb.get("accountIndex")
            if idx is not None and idx < len(keys) and keys[idx] == ata_pubkey:
                return tb.get("owner"), tb.get("mint")
        return None, None

    for ix in _instructions(tx_result):
        if ix.get("programId") not in (TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID):
            continue
        parsed = ix.get("parsed") or {}
        ix_type = parsed.get("type")
        info = parsed.get("info") or {}

        if ix_type == "transferChecked":
            mint = info.get("mint")
            if mint != usdc_mint:
                continue
            authority = info.get("authority") or info.get("tokenAuthority")
            dst = info.get("destination")
            amt = info.get("tokenAmount", {}).get("amount") or info.get("amount")
            dst_owner, _ = ata_owner(dst)
            if (
                authority == expected_sender_authority
                and dst_owner == expected_recipient_owner
                and amt is not None
            ):
                return int(amt)

        elif ix_type == "transfer":
            authority = info.get("authority") or info.get("multisigAuthority")
            dst = info.get("destination")
            amt = info.get("amount")
            dst_owner, dst_mint = ata_owner(dst)
            if (
                authority == expected_sender_authority
                and dst_owner == expected_recipient_owner
                and dst_mint == usdc_mint
                and amt is not None
            ):
                return int(amt)

    raise PaymentVerificationError(
        f"no USDC transfer from {expected_sender_authority} to "
        f"owner-of-ATA {expected_recipient_owner}",
    )


# ─── memo: anti-replay across users ────────────────────────────────────────
#
# The frontend includes a `Memo` instruction in the same transaction with
# a server-issued reference string. The server records the (memo,
# user_id) mapping when issuing the quote, and verifies on credit that
# the tx contains the memo AND the memo was issued for THIS user.
#
# Why this matters: without a memo, a tx that legitimately transfers
# SOL to PAYMENT_ADDRESS_SOLANA (e.g. for some other reason) could be
# claimed as a topup by anyone who controls the source wallet.
# Memo binds the on-chain transfer to a specific KeyShield session.

import secrets


def find_memo(tx_result: dict) -> str | None:
    """Return the Memo program's payload text if present, else None.

    Handles two response shapes:
      - jsonParsed parsed memo:     {"parsed": "<text>", "program": "spl-memo", ...}
      - unparsed (raw) memo:        {"data": "<base58 bytes>", "programId": "Memo..."}
    """
    if not tx_result:
        return None
    for ix in _instructions(tx_result):
        prog = ix.get("programId")
        if prog not in (MEMO_PROGRAM_V2, MEMO_PROGRAM_V1):
            continue
        # jsonParsed: the memo text comes through as a string at parsed.
        parsed = ix.get("parsed")
        if isinstance(parsed, str):
            return parsed
        # Some wallets return parsed.info.memo
        if isinstance(parsed, dict):
            info = parsed.get("info")
            if isinstance(info, dict) and isinstance(info.get("memo"), str):
                return info["memo"]
            if isinstance(parsed.get("memo"), str):
                return parsed["memo"]
        # Fallback: raw data is base58 of utf-8 bytes.
        raw = ix.get("data")
        if isinstance(raw, str):
            try:
                # Lazy import — only needed for unparsed memos.
                import base58  # type: ignore
                return base58.b58decode(raw).decode("utf-8", errors="replace")
            except Exception:
                pass
    return None


# In-memory store: memo -> (expiry_monotonic, user_id). Lives only in
# this process; restarting uvicorn invalidates pending quotes, which
# is fine — clients re-quote.
_TOPUP_MEMOS: dict[str, tuple[float, str]] = {}


def _purge_expired_memos() -> None:
    import time as _t
    now = _t.monotonic()
    for k in [k for k, v in _TOPUP_MEMOS.items() if v[0] < now]:
        del _TOPUP_MEMOS[k]


def issue_topup_memo(user_id: str, *, ttl_secs: float = 300.0) -> str:
    """Generate a fresh memo for this user. The memo is unique per
    quote and expires after `ttl_secs` (default 5 minutes — ample for
    a Solana confirmation)."""
    import time as _t
    _purge_expired_memos()
    memo = f"ks-topup-{secrets.token_hex(8)}"
    _TOPUP_MEMOS[memo] = (_t.monotonic() + ttl_secs, user_id)
    return memo


def verify_topup_memo(memo: str, user_id: str) -> None:
    """Raise if the memo wasn't issued, expired, or was issued for a
    different user. Does NOT consume — caller is expected to consume
    only after the on-chain credit succeeds (so a 4xx during verify
    leaves the memo usable for retry)."""
    import time as _t
    entry = _TOPUP_MEMOS.get(memo)
    if entry is None:
        raise PaymentVerificationError("memo not recognized or already consumed")
    expiry, owner = entry
    if expiry < _t.monotonic():
        _TOPUP_MEMOS.pop(memo, None)
        raise PaymentVerificationError("memo expired — request a new quote")
    if owner != user_id:
        # Don't leak whose memo it is; just refuse.
        raise PaymentVerificationError("memo was issued for a different user")


def consume_topup_memo(memo: str) -> None:
    _TOPUP_MEMOS.pop(memo, None)
