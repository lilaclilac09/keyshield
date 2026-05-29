"""
app.py — KeyShield FastAPI application factory.

Extracted from server.py (86KB) into a clean, testable app factory.
Routes are organized in routes/ directory by domain.

Usage:
    from src.app import app
    # or
    uvicorn src.app:app --port 8001 --reload
"""

from __future__ import annotations

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger(__name__)


# ─── App factory ──────────────────────────────────────────────────────


@asynccontextmanager
async def _lifespan(app: FastAPI):
    """App lifecycle — startup and shutdown hooks."""
    logger.info("KeyShield app starting up")
    # Surface the effective CORS allow-list so a CORS-blocked prod dashboard is
    # diagnosable straight from the deploy logs (no shell access needed).
    logger.info("KeyShield CORS allow_origins (%d): %s", len(_origins), _origins)
    yield
    logger.info("KeyShield app shutting down")


app = FastAPI(title="KeyShield v2", version="2.0", lifespan=_lifespan)


# ─── Register routes ─────────────────────────────────────────────────

from .routes import register_routes

register_routes(app)


# ─── CORS middleware ─────────────────────────────────────────────────

# Defaults must include the live production dashboard origins (see DEPLOY.md):
# with allow_credentials=True the browser requires an exact Origin match, so a
# missing/reset KS_CORS_ORIGINS must not silently blank out prod CORS. Entries
# are stripped because `host, host` (space after comma) would otherwise store a
# leading-space origin that never matches the browser's Origin header.
_origins = [
    o.strip()
    for o in os.getenv(
        "KS_CORS_ORIGINS",
        "http://localhost:3000,http://localhost:3001,http://localhost:5173,"
        "http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:5173,"
        "https://app.ks.aileena.xyz,https://ks.aileena.xyz,"
        "https://keyshield.dev,https://app.keyshield.dev",
    ).split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_app() -> FastAPI:
    """Get the configured FastAPI app."""
    return app
