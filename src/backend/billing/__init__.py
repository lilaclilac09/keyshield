"""Billing domain — usage logging, balance tracking, and Solana topup."""

from __future__ import annotations

from . import usage
from .billing_solana import (
    PaymentVerificationError,
    SolUsdPrice,
    fetch_sol_usd_price,
)
from .usage import (
    log_call,
    spent_usd,
    get_stats,
    get_history,
    get_balance,
    topup,
    credit_solana_topup,
    purge_user,
    list_topups,
    extract_token_usage,
)
from .usage import (
    DB_PATH,
    COST_PER_1K,
    FLAT_COST_PER_CALL,
    FREE_CREDIT_USD,
)

__all__ = [
    "usage",
    "PaymentVerificationError",
    "SolUsdPrice",
    "fetch_sol_usd_price",
    "log_call",
    "spent_usd",
    "get_stats",
    "get_history",
    "get_balance",
    "topup",
    "credit_solana_topup",
    "purge_user",
    "list_topups",
    "extract_token_usage",
    "DB_PATH",
    "COST_PER_1K",
    "FLAT_COST_PER_CALL",
    "FREE_CREDIT_USD",
]
