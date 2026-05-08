# src/__init__.py — re-exports for direct test imports
from .backend.routes.vault import router as vault_router, vault_list, vault_store, vault_delete, vault_decrypt
from .backend.auth.session import create_token, get as get_session, verify_token, delete_all_for_user
from .backend.agents.agents import register, lookup_owner, revoke_agent, list_agents
from .backend.proxy.x402_verify import _verify_transfer_log as verify_on_chain

# Vault convenience functions (matching routes/vault.py interface)
from .backend import store, load, list_keys, delete


__all__ = [
    "store",
    "load",
    "list_keys",
    "delete",
    "vault_router",
    "create_token",
    "get_session",
    "verify_token",
    "delete_all_for_user",
    "register",
    "lookup_owner",
    "revoke_agent",
    "verify_on_chain",
]
