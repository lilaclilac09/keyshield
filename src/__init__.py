# src/__init__.py — re-exports for direct test imports
#
# Note: vault store/load/delete/list_keys (and the legacy `src.vault` module)
# were removed when vault storage moved to the Path A architecture
# (Cloudflare Worker + client-side AES-GCM, see src/backend/__init__.py
# header). Tests that exercise those wrappers are now legacy and skip
# at runtime (see src/backend/tests/test_security_fixes.py::TestVault).
from .backend.routes.vault import (
    router as vault_router,
    vault_list,
    vault_store,
    vault_delete,
    vault_decrypt,
)
from .backend.auth.session import (
    create_token,
    get as get_session,
    verify_token,
    delete_all_for_user,
)
from .backend.agents.agents import register, lookup_owner, revoke_agent, list_agents
from .backend.proxy.x402_verify import _verify_transfer_log as verify_on_chain


__all__ = [
    "vault_router",
    "vault_list",
    "vault_store",
    "vault_delete",
    "vault_decrypt",
    "create_token",
    "get_session",
    "verify_token",
    "delete_all_for_user",
    "register",
    "lookup_owner",
    "revoke_agent",
    "list_agents",
    "verify_on_chain",
]
