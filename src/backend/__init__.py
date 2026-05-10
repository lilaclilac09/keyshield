"""KeyShield Backend — Zero-trust API key vault and proxy.

Public API:
    from keyshield_sdk import KeyShield, AsyncKeyShield, AgentKeyShield
    from src.backend.config import get_settings
    from src.backend.errors import KeyShieldError
    from src.backend.trading.orchestrator import TradingOrchestrator

Path A: vault storage now lives outside Python (Cloudflare Worker +
client-side AES-GCM). Module-level vault wrappers (store/load/delete/
list_keys) and the legacy `_ks_instance = KeyShield()` self-calling SDK
loop have been removed.
"""

from __future__ import annotations

# ─── SDK ──────────────────────────────────────────────────────────────
# Kept for external callers; no longer used internally for storage.
from .keyshield_sdk import KeyShield, AsyncKeyShield, AgentKeyShield

# ─── Config ───────────────────────────────────────────────────────────
from .config import AppSettings, get_settings, reset_settings

# ─── Errors ───────────────────────────────────────────────────────────
from .errors import (
    KeyShieldError,
    VaultError,
    KeyNotFound,
    KeyStoreError,
    VaultCorrupt,
    SessionError,
    SessionExpired,
    SessionNotFound,
    SessionInvalid,
    AuthError,
    InvalidSignature,
    ProxyError,
    UpstreamNotFound,
    BillingError,
    InsufficientFunds,
    AgentError,
    AgentNotFound,
    SharingError,
    ShareNotFound,
    MppError,
)

# ─── Trading ──────────────────────────────────────────────────────────
from .trading.orchestrator import TradingOrchestrator
from .trading.market_data import MarketDataAgent, PriceFeed, PriceSignal
from .trading.risk import RiskAgent
from .trading.analysis import AnalysisAgent, ModelRouter, TaskType
from .trading.execution import ExecutionAgent, ZeroXRouter, TitanExecutor
from .trading.models import TradingState, RiskPolicy
from .trading.market_data import PriceFeedConfig

# ─── Auth ─────────────────────────────────────────────────────────────
from .auth.session import create_token, get as get_session, verify_token
from .auth import passkey as passkey_mod

# ─── Agents ───────────────────────────────────────────────────────────
from .agents.agents import (
    register as register_agent,
    lookup_owner,
    revoke_agent,
    list_agents,
)
from .agents.agent_wallet import build_create_ephemeral_signer_ix

# ─── Billing ──────────────────────────────────────────────────────────
from .billing.usage import get_balance, topup, get_stats, get_history
from .billing import billing_solana

# ─── Proxy ────────────────────────────────────────────────────────────
from .proxy.api_router import (
    call_helius,
    call_rest,
    batch_helius,
    batch_rest,
    cache_stats,
)
from .proxy.x402_verify import _verify_transfer_log as verify_payment_proof, has_claim

# ─── Sharing ──────────────────────────────────────────────────────────
from .sharing.sharing import grant, revoke as revoke_share, list_outgoing, list_incoming

# ─── MPP ──────────────────────────────────────────────────────────────
from .mpp.mpp_onchain import MppConfig, build_mpp_settle_ix_data, submit_mpp_settle
from .mpp.mpp_streams import (
    open_stream,
    record_usage,
    settle_stream,
    close_stream,
    list_streams,
    list_events as mpp_list_events,
)

# ─── Skills ───────────────────────────────────────────────────────────
from .skills.helius_skill import TOOLS as HELIUS_TOOLS, run_tool

# ─── Middleware ───────────────────────────────────────────────────────
from .middleware.auth import require_auth, get_session_from_request


__all__ = [
    # SDK
    "KeyShield",
    "AsyncKeyShield",
    "AgentKeyShield",
    # Config
    "AppSettings",
    "get_settings",
    "reset_settings",
    # Errors
    "KeyShieldError",
    "VaultError",
    "SessionError",
    "AuthError",
    "ProxyError",
    "BillingError",
    "AgentError",
    "SharingError",
    "MppError",
    # Trading
    "TradingOrchestrator",
    "MarketDataAgent",
    "RiskAgent",
    "AnalysisAgent",
    "ExecutionAgent",
    "ModelRouter",
    "TaskType",
    "TradingState",
    "RiskPolicy",
    "PriceFeedConfig",
    # Auth
    "create_token",
    "get_session",
    "verify_token",
    "passkey_mod",
    # Agents
    "register_agent",
    "lookup_owner",
    "revoke_agent",
    "list_agents",
    # Billing
    "get_balance",
    "topup",
    "get_stats",
    "get_history",
    # Proxy
    "call_helius",
    "call_rest",
    "batch_helius",
    "batch_rest",
    "cache_stats",
    # Sharing
    "grant",
    "revoke_share",
    "list_outgoing",
    "list_incoming",
    # MPP
    "MppConfig",
    "open_stream",
    "record_usage",
    "settle_stream",
    "close_stream",
    "list_streams",
    "mpp_list_events",
    "build_mpp_settle_ix_data",
    "submit_mpp_settle",
    # Skills
    "HELIUS_TOOLS",
    "run_tool",
    # Middleware
    "require_auth",
    "get_session_from_request",
]
