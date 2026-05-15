"""
x402_interceptor — Pluggable HTTP 402 retry for proxied upstream calls.

This is the **Python analog** of the `PaymentInterceptor` trait described in
spec 09 v2 ("Future extension point") and spec 10 §Q4. It closes Gap 2
(x402 auto-retry) without waiting for the full embedded-wallet implementation
in spec 10 Phases 10.1–10.7.

How it composes:
  - `api_router.call_helius` / `call_rest` get an optional `interceptor` arg
  - On a 402 response, the interceptor's `pay(envelope)` is awaited
  - The proof returned is attached as `X-Payment-Proof` header and the call
    is retried exactly once
  - If `interceptor is None` or the retry also 402s, the 402 surfaces as
    `PaymentRequired` raised to the caller (matches spec 09's `HeliusError::Unpaid`)

Two implementations shipped:
  - `ManualKeypairInterceptor`: signs a standard Coinbase-x402 USDC SPL
    Transfer with a caller-supplied keypair. Works TODAY; doesn't rely on
    the keyshield `pay_x402` on-chain ix. Proof = the USDC tx signature.
  - `EmbeddedWalletInterceptor`: stub. Will dispatch to the embedded wallet
    (`/agents/{id}/wallet/pay_x402`) once spec 10 Phase 10.7 lands.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Protocol, runtime_checkable

logger = logging.getLogger(__name__)


# ─── envelope / proof types ────────────────────────────────────────────────


@dataclass(frozen=True)
class X402Envelope:
    """
    Subset of the Coinbase x402 spec we actually use. Constructed from the
    server's 402 response body (`accepts[0]`). See spec 10 §Q2 for the
    full wire shape we adopt verbatim.
    """

    network: str
    amount_required: int  # integer micro-units of `asset`
    pay_to: str  # base58 pubkey (Solana) or hex (EVM)
    asset: str  # USDC mint or contract
    resource: str
    max_timeout_seconds: int = 300
    extra: dict[str, Any] | None = None

    @classmethod
    def from_response(cls, body: dict) -> "X402Envelope":
        accepts = body.get("accepts") or []
        if not accepts:
            raise ValueError("402 response missing `accepts`")
        a = accepts[0]
        return cls(
            network=a["network"],
            amount_required=int(a["maxAmountRequired"]),
            pay_to=a["payTo"],
            asset=a["asset"],
            resource=a.get("resource", ""),
            max_timeout_seconds=int(a.get("maxTimeoutSeconds", 300)),
            extra=a.get("extra"),
        )


@dataclass(frozen=True)
class PaymentProof:
    signature: str  # tx hash / signature (base58 for Solana)
    network: str  # "solana-mainnet" | "base-mainnet" | ...

    def as_headers(self) -> dict[str, str]:
        return {"X-Payment-Proof": self.signature, "X-Payment-Network": self.network}


class PaymentRequired(Exception):
    """Raised when no interceptor is configured or retry still 402s."""

    def __init__(self, envelope: X402Envelope, raw: dict):
        self.envelope = envelope
        self.raw = raw
        super().__init__(
            f"402 from {envelope.resource} requires {envelope.amount_required} of {envelope.asset}"
        )


# ─── interceptor protocol ──────────────────────────────────────────────────


@runtime_checkable
class PaymentInterceptor(Protocol):
    async def pay(self, envelope: X402Envelope) -> PaymentProof: ...


# ─── shipped implementations ───────────────────────────────────────────────


class CallableInterceptor:
    """Wraps any `async (envelope) -> PaymentProof` callable."""

    def __init__(self, fn: Callable[[X402Envelope], Awaitable[PaymentProof]]):
        self._fn = fn

    async def pay(self, envelope: X402Envelope) -> PaymentProof:
        return await self._fn(envelope)


class ManualKeypairInterceptor:
    """
    Signs a standard SPL USDC Transfer to `envelope.pay_to` from a
    Solana keypair the caller supplies. Works for ANY x402-aware server
    that follows Coinbase's spec — does NOT require the keyshield-specific
    `pay_x402` on-chain ix.

    Construct with `from_env()` to read `KS_X402_HOT_KEYPAIR_B58` (a
    base58-encoded 64-byte secret key). Submits via Helius RPC.

    Refuses to spend more than `max_micro_per_call` per single 402, and
    more than `max_total_micro` cumulatively across the process lifetime.
    Both are simple in-memory guardrails — for real budget enforcement
    use the spec 10 PaymentStream once it ships.
    """

    def __init__(
        self,
        keypair_b58: str,
        helius_api_key: str,
        *,
        max_micro_per_call: int = 100_000,  # 0.10 USDC default
        max_total_micro: int = 10_000_000,  # 10.00 USDC lifetime cap
        rpc_url: str | None = None,
    ):
        try:
            from solders.keypair import Keypair  # type: ignore
        except ImportError as exc:
            raise ImportError(
                "ManualKeypairInterceptor requires solders + solana-py: pip install solders solana"
            ) from exc

        self._kp = Keypair.from_base58_string(keypair_b58)
        self._helius_key = helius_api_key
        self._max_per_call = max_micro_per_call
        self._max_total = max_total_micro
        self._spent_total = 0
        self._lock = asyncio.Lock()
        self._rpc_url = rpc_url or f"https://mainnet.helius-rpc.com/?api-key={helius_api_key}"

    @classmethod
    def from_env(cls, helius_api_key: str | None = None) -> "ManualKeypairInterceptor":
        kp = os.getenv("KS_X402_HOT_KEYPAIR_B58")
        if not kp:
            raise RuntimeError("Set KS_X402_HOT_KEYPAIR_B58 (base58 64-byte secret key)")
        helius_api_key = helius_api_key or os.getenv("HELIUS_API_KEY")
        if not helius_api_key:
            raise RuntimeError("Set HELIUS_API_KEY for x402 retry submission")
        return cls(kp, helius_api_key)

    async def pay(self, envelope: X402Envelope) -> PaymentProof:
        if not envelope.network.startswith("solana"):
            raise PaymentRequired(
                envelope,
                {
                    "error": f"network {envelope.network!r} not supported by ManualKeypairInterceptor"
                },
            )
        if envelope.amount_required > self._max_per_call:
            raise PaymentRequired(
                envelope,
                {
                    "error": f"amount {envelope.amount_required} exceeds per-call cap {self._max_per_call}"
                },
            )

        async with self._lock:
            if self._spent_total + envelope.amount_required > self._max_total:
                raise PaymentRequired(
                    envelope, {"error": f"would exceed lifetime cap {self._max_total}"}
                )
            sig = await self._submit_usdc_transfer(
                envelope.pay_to, envelope.amount_required, envelope.asset
            )
            self._spent_total += envelope.amount_required

        logger.info(
            "x402 paid %d to %s, sig=%s, lifetime=%d",
            envelope.amount_required,
            envelope.pay_to,
            sig,
            self._spent_total,
        )
        return PaymentProof(signature=sig, network=envelope.network)

    async def _submit_usdc_transfer(self, recipient: str, micro_amount: int, mint: str) -> str:
        """Build + send SPL Token transfer_checked. Returns base58 tx signature."""
        from solders.pubkey import Pubkey  # type: ignore
        from solders.transaction import Transaction  # type: ignore
        from solders.message import Message  # type: ignore
        from solana.rpc.async_api import AsyncClient  # type: ignore
        from spl.token.constants import TOKEN_PROGRAM_ID  # type: ignore
        from spl.token.instructions import (  # type: ignore
            get_associated_token_address,
            transfer_checked,
            TransferCheckedParams,
        )

        mint_pk = Pubkey.from_string(mint)
        recipient_pk = Pubkey.from_string(recipient)
        sender_ata = get_associated_token_address(self._kp.pubkey(), mint_pk)
        recipient_ata = get_associated_token_address(recipient_pk, mint_pk)

        ix = transfer_checked(
            TransferCheckedParams(
                program_id=TOKEN_PROGRAM_ID,
                source=sender_ata,
                mint=mint_pk,
                dest=recipient_ata,
                owner=self._kp.pubkey(),
                amount=micro_amount,
                decimals=6,
                signers=[],
            )
        )

        async with AsyncClient(self._rpc_url) as rpc:
            blockhash = (await rpc.get_latest_blockhash()).value.blockhash
            msg = Message.new_with_blockhash([ix], self._kp.pubkey(), blockhash)
            tx = Transaction([self._kp], msg, blockhash)
            resp = await rpc.send_raw_transaction(bytes(tx))
            return str(resp.value)


class EmbeddedWalletInterceptor:
    """
    Calls the keyshield control plane to mint an x402 proof via the
    spec 10 `pay_x402` on-chain ix. Stub until spec 10 Phase 10.4 + 10.7
    land. Raises `PaymentRequired` so callers fall through cleanly today.
    """

    def __init__(self, agent_id: str, base_url: str, bearer: str):
        self._agent_id = agent_id
        self._base_url = base_url.rstrip("/")
        self._bearer = bearer

    async def pay(self, envelope: X402Envelope) -> PaymentProof:
        import httpx

        url = f"{self._base_url}/agents/{self._agent_id}/wallet/pay_x402"
        async with httpx.AsyncClient(timeout=envelope.max_timeout_seconds) as c:
            resp = await c.post(
                url,
                headers={"Authorization": f"Bearer {self._bearer}"},
                json={
                    "envelope": {
                        "network": envelope.network,
                        "amountRequired": envelope.amount_required,
                        "payTo": envelope.pay_to,
                        "asset": envelope.asset,
                        "resource": envelope.resource,
                        "extra": envelope.extra,
                    }
                },
            )
            if resp.status_code == 404:
                raise PaymentRequired(
                    envelope,
                    {
                        "error": "agent_wallet endpoint not yet deployed (spec 10 Phase 10.7 pending)"
                    },
                )
            resp.raise_for_status()
            body = resp.json()
            return PaymentProof(signature=body["signature"], network=envelope.network)


# ─── 402 detection helper ──────────────────────────────────────────────────


def parse_402(status_code: int, body: bytes | str | dict) -> X402Envelope | None:
    """Return an X402Envelope if the response is an x402 challenge, else None."""
    if status_code != 402:
        return None
    try:
        if isinstance(body, (bytes, bytearray)):
            body = body.decode("utf-8", errors="replace")
        if isinstance(body, str):
            body = json.loads(body)
        return X402Envelope.from_response(body)
    except Exception as exc:  # noqa: BLE001
        logger.debug("402 received but envelope unparseable: %s", exc)
        return None


# ─── retry-with-interceptor helper ─────────────────────────────────────────


async def with_x402_retry(
    do_call: Callable[[dict[str, str]], Awaitable[tuple[int, bytes, dict]]],
    *,
    interceptor: PaymentInterceptor | None,
    initial_headers: dict[str, str] | None = None,
) -> tuple[int, bytes, dict]:
    """
    Generic retry loop. `do_call(headers)` performs one HTTP call and returns
    `(status, body_bytes, response_headers)`. If status is 402 and an
    interceptor is configured, pay and retry exactly once.

    Raises `PaymentRequired` if no interceptor or retry still 402s.
    """
    headers = dict(initial_headers or {})
    status, body, resp_headers = await do_call(headers)
    if status != 402:
        return status, body, resp_headers

    envelope = parse_402(status, body)
    if envelope is None:
        return status, body, resp_headers  # malformed 402, surface as-is

    if interceptor is None:
        raise PaymentRequired(envelope, json.loads(body) if body else {})

    proof = await interceptor.pay(envelope)
    headers.update(proof.as_headers())
    status2, body2, resp_headers2 = await do_call(headers)

    if status2 == 402:
        raise PaymentRequired(envelope, json.loads(body2) if body2 else {})
    return status2, body2, resp_headers2
