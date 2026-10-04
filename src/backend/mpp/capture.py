"""Consumer capture signatures for MPP settlement.

The proxy hashes the upstream artifact (SHA-256). The consumer session
key signs that 32-byte hash:

    HMAC-SHA256(session_token_utf8, artifact_hash)

The ledger checks the MAC with ``compare_digest`` before it builds
``mpp_settle``. The Solana program only rejects a missing or all-zero
signature; it does not know the session secret, so it cannot recompute
this MAC.
"""

from __future__ import annotations

import hashlib
import hmac


def _artifact_bytes(artifact_hash: bytes | str) -> bytes:
    if isinstance(artifact_hash, str):
        text = artifact_hash.strip().lower()
        if text.startswith("0x"):
            text = text[2:]
        digest = bytes.fromhex(text)
    else:
        digest = bytes(artifact_hash)
    if len(digest) != 32:
        raise ValueError("artifact hash must be 32 bytes")
    return digest


def coerce_signature(signature: bytes | str) -> bytes:
    """32-byte capture MAC. Accepts raw bytes or hex."""
    raw = _signature_bytes(signature)
    if len(raw) != 32:
        raise ValueError("capture signature must be 32 bytes")
    return raw


def _signature_bytes(signature: bytes | str) -> bytes:
    if isinstance(signature, str):
        text = signature.strip().lower()
        if text.startswith("0x"):
            text = text[2:]
        return bytes.fromhex(text)
    return bytes(signature)


def sign_artifact_hash(session_key: str, artifact_hash: bytes | str) -> bytes:
    """HMAC-SHA256 of the artifact hash under the consumer session key."""
    if not session_key:
        raise ValueError("session key required")
    digest = _artifact_bytes(artifact_hash)
    return hmac.new(session_key.encode("utf-8"), digest, hashlib.sha256).digest()


def verify_artifact_signature(
    session_key: str,
    artifact_hash: bytes | str,
    signature: bytes | str | None,
) -> bool:
    """True when ``signature`` is the session key's MAC over ``artifact_hash``."""
    if not session_key or signature is None:
        return False
    try:
        digest = _artifact_bytes(artifact_hash)
        presented = _signature_bytes(signature)
    except ValueError:
        return False
    if len(presented) != 32 or presented == bytes(32):
        return False
    expected = hmac.new(session_key.encode("utf-8"), digest, hashlib.sha256).digest()
    return hmac.compare_digest(expected, presented)
