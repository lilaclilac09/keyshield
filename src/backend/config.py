"""Configuration for KeyShield — Pydantic Settings model."""

from __future__ import annotations

import os


# Handle pydantic v2 where BaseSettings moved to pydantic_settings
try:
    from pydantic_settings import BaseSettings as _BaseSettings
except (ImportError, Exception):
    # Fallback: use BaseModel with env support
    from pydantic import BaseModel

    class _BaseSettings(BaseModel):
        model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


BaseSettings = _BaseSettings

_CI_SECRETS = {
    "CI-SMOKE-TEST-SECRET-32-BYTES-MIN",
    "UAT-CHANGE-ME-32-BYTES-MIN",
    "CHANGE-ME-IN-PROD-32-BYTES-MIN!!",
}


class AppSettings(BaseSettings):
    """Application settings loaded from environment variables + .env file."""

    # ─── Server ──────────────────────────────────────────────
    server_host: str = "0.0.0.0"
    server_port: int = 8001
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001"]
    internal_secret: str = ""

    # ─── Vault ───────────────────────────────────────────────
    vault_dir: str = "vault"  # relative to working directory

    # ─── Session ─────────────────────────────────────────────
    session_ttl: int = 86400  # 24 hours in seconds
    server_secret: str = ""

    # ─── Auth ────────────────────────────────────────────────
    challenge_ttl: int = 300  # 5 minutes for challenges
    passkey_rp_id: str = "localhost"
    passkey_rp_name: str = "KeyShield"
    passkey_origin: str = "http://localhost:3000,http://localhost:3001"

    # ─── Database paths ──────────────────────────────────────
    data_dir: str = "data"  # relative to working directory
    sessions_db: str = "sessions.db"
    agents_db: str = "agents/agents.db"
    usage_db: str = "data/usage.db"
    sharing_db: str = "data/sharing.db"

    # ─── Proxy ───────────────────────────────────────────────
    upstream_override_base: str = ""  # override all upstream base URLs (for testing)
    proxy_timeout: int = 30

    # ─── TLS ─────────────────────────────────────────────────
    tls_mode: str = "off"  # "off", "self-signed", "acme"
    tls_cert_dir: str = "tls"

    # ─── Logging ─────────────────────────────────────────────
    log_level: str = "INFO"

    model_config = {"env_prefix": "", "env_file": ".env"}


def _validate_secret(value: str, name: str) -> str:
    """Refuse to start if a required secret is missing or uses a known placeholder."""
    in_ci = os.getenv("CI") == "true"
    if not value:
        if in_ci:
            return value
        raise ValueError(
            f"{name} is not set. "
            f"Add it to your .env file or set the environment variable."
        )
    if value in _CI_SECRETS and not in_ci:
        raise ValueError(
            f"{name} is using a placeholder value. "
            f"Set a real secret (≥32 random characters) before running in production."
        )
    if len(value) < 32:
        raise ValueError(f"{name} must be at least 32 characters.")
    return value


# Module-level singleton
_settings: AppSettings | None = None


def get_settings() -> AppSettings:
    """Get or create the global settings instance (singleton)."""
    global _settings
    if _settings is None:
        s = AppSettings()
        _validate_secret(s.server_secret, "SERVER_SECRET")
        _settings = s
    return _settings


def reset_settings() -> AppSettings:
    """Reset settings (for testing)."""
    global _settings
    _settings = None
    return get_settings()
