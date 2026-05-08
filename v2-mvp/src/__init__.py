"""KeyShield v2-MVP — Zero-trust API key vault.

Public API (import from src):
    from src import KeyShield, AsyncKeyShield, AgentKeyShield
    from src import get_settings, AppSettings
    from src import KeyShieldError, VaultError

Core modules:
    from src.vault import vault  # AES-256-GCM encryption
    from src.auth import session, passkey
    from src.billing import usage
    from src.agents import agents
    from src.proxy import api_router
    from src.sharing import sharing
    from src.mpp import mpp_onchain, MppConfig
    from src.trading import TradingOrchestrator

SDK:
    from src.sdk import KeyShield, AsyncKeyShield, AgentKeyShield
"""
from __future__ import annotations

# ─── SDK ──────────────────────────────────────────────────────────────
try:
    from keyshield_sdk import KeyShield, AsyncKeyShield, AgentKeyShield
except ImportError:
    from src.keyshield_sdk import KeyShield, AsyncKeyShield, AgentKeyShield

# ─── Config ───────────────────────────────────────────────────────────
from src.config import AppSettings, get_settings, reset_settings

# ─── Errors ───────────────────────────────────────────────────────────
from src.errors import (
    KeyShieldError,
    VaultError,
    SessionError,
    AuthError,
    ProxyError,
    BillingError,
    AgentError,
    SharingError,
)

# ─── Trading (new domain) ─────────────────────────────────────────────
from src.trading import (
    TradingOrchestrator,
    MarketDataAgent,
    RiskAgent,
    AnalysisAgent,
    ExecutionAgent,
    ModelRouter,
    TaskType,
)

# ─── Vault ────────────────────────────────────────────────────────────
from src.vault import store, load, delete, list_keys, migrate_all_to_argon2

# ─── Auth ─────────────────────────────────────────────────────────────
from src.auth import create_token, get as get_session, verify_token
from src.auth import passkey as passkey_mod

# ─── Agents ───────────────────────────────────────────────────────────
from src.agents import register as register_agent, lookup_owner, revoke_agent, list_agents

# ─── Billing ──────────────────────────────────────────────────────────
from src.billing import get_balance, topup, get_stats, get_history

# ─── Proxy ────────────────────────────────────────────────────────────
from src.proxy import call_helius, call_rest, batch_helius, batch_rest, cache_stats

# ─── Sharing ──────────────────────────────────────────────────────────
from src.sharing import grant, revoke as revoke_share, list_outgoing, list_incoming

# ─── MPP ──────────────────────────────────────────────────────────────
from src.mpp import MppConfig, build_mpp_settle_ix_data, submit_mpp_settle

__all__ = [
    # SDK
    "KeyShield", "AsyncKeyShield", "AgentKeyShield",
    # Config
    "AppSettings", "get_settings", "reset_settings",
    # Errors
    "KeyShieldError", "VaultError", "SessionError", "AuthError",
    "ProxyError", "BillingError", "AgentError", "SharingError",
    # Trading
    "TradingOrchestrator", "MarketDataAgent", "RiskAgent",
    "AnalysisAgent", "ExecutionAgent", "ModelRouter", "TaskType",
    # Vault
    "store", "load", "delete", "list_keys", "migrate_all_to_argon2",
    # Auth
    "create_token", "get_session", "verify_token",
    "passkey_mod",
    # Agents
    "register_agent", "lookup_owner", "revoke_agent", "list_agents",
    # Billing
    "get_balance", "topup", "get_stats", "get_history",
    # Proxy
    "call_helius", "call_rest", "batch_helius", "batch_rest", "cache_stats",
    # Sharing
    "grant", "revoke_share", "list_outgoing", "list_incoming",
    # MPP
    "MppConfig", "build_mpp_settle_ix_data", "submit_mpp_settle",
]
