"""Routes package — domain-specific route modules.

Each module defines its own APIRouter with routes.
Use register_routes(app) to attach all routes to a FastAPI app.
"""

from __future__ import annotations

from fastapi import FastAPI


def register_routes(app: FastAPI) -> None:
    """Register all domain routes on the app.

    Path A: vault routes are intentionally absent. Key storage moved out of
    Python (Cloudflare Worker + client-side AES-GCM). The proxy receives
    decrypted keys per-request via the X-Upstream-API-Key header.
    """
    from . import health
    from . import auth
    from . import agents
    from . import proxy
    from . import sharing
    from . import billing

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(agents.router)
    app.include_router(proxy.router)
    app.include_router(sharing.router)
    app.include_router(billing.router)
