"""Routes package — domain-specific route modules.

Each module defines its own APIRouter with routes.
Use register_routes(app) to attach all routes to a FastAPI app.
"""
from __future__ import annotations

from fastapi import FastAPI


def register_routes(app: FastAPI) -> None:
    """Register all domain routes on the app.

    Vault routes (shim): local-dev fallback for /manage/* endpoints.
    Production Path A uses Cloudflare Worker + client-side AES-GCM, but
    the dashboard still calls /manage/* for local development without
    requiring the CF Worker to be running.
    """
    from . import health
    from . import auth
    from . import agents
    from . import proxy
    from . import sharing
    from . import billing
    from . import mpp
    from . import vault  # local-dev shim
    from . import sessions  # session management

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(agents.router)
    app.include_router(proxy.router)
    app.include_router(sharing.router)
    app.include_router(billing.router)
    app.include_router(mpp.router)
    app.include_router(vault.router)
    app.include_router(sessions.router)
