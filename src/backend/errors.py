"""Error classes for KeyShield domains.

Each domain has its own exception hierarchy for precise error handling.
All errors inherit from the top-level KeyShieldError.
"""

from __future__ import annotations


class KeyShieldError(Exception):
    """Base exception for all KeyShield errors."""


# ─── Vault errors ──────────────────────────────────────────────────────


class VaultError(KeyShieldError):
    """Base error for vault operations."""


class KeyNotFound(VaultError):
    """Requested key does not exist in the vault."""


class KeyStoreError(VaultError):
    """Failed to store a key (e.g., encryption error)."""


class VaultCorrupt(VaultError):
    """Vault data is corrupt or in unexpected format."""


# ─── Session errors ────────────────────────────────────────────────────


class SessionError(KeyShieldError):
    """Base error for session operations."""


class SessionExpired(SessionError):
    """Session token has expired."""


class SessionNotFound(SessionError):
    """Session token not found in store."""


class SessionInvalid(SessionError):
    """Session token is invalid (bad signature or malformed)."""


class UserDeleted(SessionError):
    """User was soft-deleted via /auth/delete-account."""


# ─── Auth errors ───────────────────────────────────────────────────────


class AuthError(KeyShieldError):
    """Base error for authentication."""


class InvalidSignature(AuthError):
    """Wallet/agent signature verification failed."""


class ChallengeExpired(AuthError):
    """Authentication challenge has expired."""


class ChallengeUsed(AuthError):
    """Challenge nonce was already consumed."""


# ─── Proxy errors ──────────────────────────────────────────────────────


class ProxyError(KeyShieldError):
    """Base error for proxy operations."""


class UpstreamNotFound(ProxyError):
    """Upstream provider not found or key not configured."""


class ProxyRequestFailed(ProxyError):
    """Failed to forward request to upstream provider."""


class BatchError(ProxyError):
    """Error in batch request processing."""


# ─── Billing errors ────────────────────────────────────────────────────


class BillingError(KeyShieldError):
    """Base error for billing operations."""


class InsufficientFunds(BillingError):
    """User balance is below required amount."""


class TopupFailed(BillingError):
    """Topup transaction failed or not credited."""


# ─── Agent errors ──────────────────────────────────────────────────────


class AgentError(KeyShieldError):
    """Base error for agent operations."""


class AgentNotFound(AgentError):
    """Agent not found in registry."""


class AgentAlreadyExists(AgentError):
    """Agent pubkey already registered for this owner."""


class AgentRevoked(AgentError):
    """Agent is revoked (CRL check failed)."""


# ─── Sharing errors ────────────────────────────────────────────────────


class SharingError(KeyShieldError):
    """Base error for sharing operations."""


class ShareNotFound(SharingError):
    """Share not found."""


class ShareAlreadyGranted(SharingError):
    """Share already exists (duplicate grant)."""


# ─── MPP errors ────────────────────────────────────────────────────────


class MppError(KeyShieldError):
    """Base error for MPP operations."""


class StreamNotFound(MppError):
    """MPP stream not found."""


class PaymentFailed(MppError):
    """On-chain payment failed."""


class SettlementError(MppError):
    """Stream settlement failed."""


class MppSubmitError(MppError):
    """Failed to submit MPP instruction on-chain."""


# ─── Configuration errors ──────────────────────────────────────────────


class ConfigError(KeyShieldError):
    """Base error for configuration issues."""


class MissingEnvVar(ConfigError):
    """Required environment variable is missing."""


class InvalidConfig(ConfigError):
    """Configuration value is invalid."""


# ─── Convenience exports ───────────────────────────────────────────────

__all__ = [
    # Base
    "KeyShieldError",
    # Vault
    "VaultError",
    "KeyNotFound",
    "KeyStoreError",
    "VaultCorrupt",
    # Session
    "SessionError",
    "SessionExpired",
    "SessionNotFound",
    "SessionInvalid",
    "UserDeleted",
    # Auth
    "AuthError",
    "InvalidSignature",
    "ChallengeExpired",
    "ChallengeUsed",
    # Proxy
    "ProxyError",
    "UpstreamNotFound",
    "ProxyRequestFailed",
    "BatchError",
    # Billing
    "BillingError",
    "InsufficientFunds",
    "TopupFailed",
    # Agents
    "AgentError",
    "AgentNotFound",
    "AgentAlreadyExists",
    "AgentRevoked",
    # Sharing
    "SharingError",
    "ShareNotFound",
    "ShareAlreadyGranted",
    # MPP
    "MppError",
    "StreamNotFound",
    "PaymentFailed",
    "SettlementError",
    "MppSubmitError",
    # Config
    "ConfigError",
    "MissingEnvVar",
    "InvalidConfig",
]
