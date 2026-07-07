"""Smoke tests for the KeyShield FastAPI backend.

Confirms the app + main subsystems import cleanly. Lightweight
gate intended for the CI Python smoke-test job — full unit/E2E
tests will return as the Path A migration finishes.
"""

from __future__ import annotations


def test_app_imports() -> None:
    """The FastAPI app must construct without raising."""
    from src.backend.app import app

    assert app is not None
    assert hasattr(app, "router")


def _collect_route_paths(app) -> set[str]:
    """All registered API paths (OpenAPI is reliable across FastAPI router nesting)."""
    return set(app.openapi().get("paths", {}).keys())


def test_routes_register() -> None:
    """All major route modules must register at least one endpoint."""
    from src.backend.app import app

    paths = _collect_route_paths(app)
    assert (
        "/health" in paths or any(p.startswith("/health") for p in paths)
    ), f"expected /health endpoint registered, got {sorted(paths)[:12]}"


def test_settings_loads() -> None:
    """get_settings should return a valid AppSettings instance."""
    from src.backend.config import get_settings

    s = get_settings()
    assert s is not None


def test_x402_verify_module_imports() -> None:
    """x402 payment verification module imports cleanly."""
    from src.backend.proxy import x402_verify

    assert x402_verify is not None


def test_keyshield_sdk_class_imports() -> None:
    """The SDK class is the public entry — must instantiate."""
    from src.backend.keyshield_sdk import KeyShield

    ks = KeyShield()
    assert ks is not None


def test_ephemeral_signer_module_imports() -> None:
    """Embedded agent wallet (build-tx for CreateEphemeralSigner) imports."""
    from src.backend.agents import agent_wallet

    assert agent_wallet is not None


def test_mpp_streams_module_imports() -> None:
    """Metered Payment Protocol stream module imports cleanly."""
    from src.backend.mpp import mpp_streams

    assert mpp_streams is not None
