"""402 preview — details then pay, capped by --max-amount.

Matches the extension toast and `pay.sh --details`. This does not invent
an on-chain receipt. Pay either refuses (over cap) or records a preview
row / optional MPP hold for the caller to capture with the session MAC.
"""

from __future__ import annotations

import os

CIRCLE_DEVNET_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
DEFAULT_PAY_TO = "Fx3db1bLEgMqEPQmroXj4VBA1mhCpNtJEKTmbbhiSyHR"


def canonical_micro(raw) -> int:
    text = str(raw if raw is not None else "").strip()
    if not text:
        return 0
    if not text.isdigit():
        raise ValueError("amount must be a canonical integer (micro-USDC)")
    value = int(text)
    if value < 0:
        raise ValueError("amount must be >= 0")
    return value


def build_preview(
    *,
    amount_micro_usdc: int = 1,
    max_amount_micro_usdc: int = 0,
    resource: str = "/demo",
    pay_to: str | None = None,
) -> dict:
    amount = int(amount_micro_usdc)
    cap = int(max_amount_micro_usdc or 0)
    over = cap > 0 and amount > cap
    payee = (pay_to or os.environ.get("KS_MPP_SETTLER_PUBKEY") or DEFAULT_PAY_TO).strip()
    return {
        "x402Version": 1,
        "error": "Payment required",
        "accepts": [
            {
                "scheme": "exact",
                "network": "solana-devnet",
                "maxAmountRequired": str(amount),
                "resource": resource or "/demo",
                "payTo": payee,
                "asset": os.environ.get("KS_USDC_MINT", CIRCLE_DEVNET_USDC).strip()
                or CIRCLE_DEVNET_USDC,
                "extra": {"settle_mode": "preview", "max_amount": cap},
            }
        ],
        "amount_micro_usdc": amount,
        "max_amount_micro_usdc": cap,
        "capped": cap > 0,
        "over_cap": over,
    }


def parse_preview_query(amount, max_amount, resource: str | None = None) -> dict:
    return build_preview(
        amount_micro_usdc=canonical_micro(amount if amount is not None else 1),
        max_amount_micro_usdc=canonical_micro(max_amount if max_amount is not None else 0),
        resource=str(resource or "/demo"),
    )


def assert_under_cap(amount_micro_usdc: int, max_amount_micro_usdc: int) -> None:
    if max_amount_micro_usdc > 0 and amount_micro_usdc > max_amount_micro_usdc:
        raise ValueError(
            f"amount {amount_micro_usdc} exceeds --max-amount {max_amount_micro_usdc}"
        )
