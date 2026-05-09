"""Routes package — domain-specific route modules.

Each module defines its own APIRouter with routes.
Use register_routes(app) to attach all routes to a FastAPI app.
"""
from __future__ import annotations

from fastapi import FastAPI


def register_routes(app: FastAPI) -> None:
    """Register all domain routes on the app."""
    from . import health
    from . import auth
    from . import agents
    from . import vault
    from . import proxy
    from . import sharing
    from . import billing
    from . import mpp

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(agents.router)
    app.include_router(vault.router)
    app.include_router(proxy.router)
    app.include_router(sharing.router)
    app.include_router(billing.router)
    app.include_router(mpp.router)
