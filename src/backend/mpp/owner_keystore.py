"""Encrypted at-rest owner keypair for MPP auto-sign.

The stream owner signs vault / grant / open / withdraw and the
Ed25519 settlement binding. The 32-byte seed is AES-256-GCM sealed
on disk. The wrap key lives in a 0600 file (or KS_MPP_OWNER_WRAP_KEY)
that is gitignored with `.keyshield-devnet/`. Callers only ever see
the base58 pubkey and 64-byte signatures — never the seed.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from nacl.signing import SigningKey

logger = logging.getLogger(__name__)

MAGIC = b"ksown1"
_NONCE_LEN = 12
_DEFAULT_ENC = Path("/workspace/.keyshield-devnet/user-devnet.enc")
_DEFAULT_WRAP = Path("/workspace/.keyshield-devnet/owner.wrap")
_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


class OwnerKeystoreError(Exception):
    """Owner keystore is missing, wrapped with the wrong key, or corrupt."""


@dataclass(frozen=True)
class OwnerKey:
    """In-memory owner key. Do not log `seed` or `secret_64`."""

    pubkey_b58: str
    seed: bytes
    secret_64: bytes


def _b58encode(data: bytes) -> str:
    n = int.from_bytes(data, "big")
    res = ""
    while n:
        n, r = divmod(n, 58)
        res = _B58[r] + res
    pad = len(data) - len(data.lstrip(b"\x00"))
    return "1" * pad + res


def _enc_path() -> Path:
    raw = os.environ.get("KS_MPP_OWNER_KEY_FILE", "").strip()
    return Path(raw) if raw else _DEFAULT_ENC


def _wrap_path() -> Path:
    raw = os.environ.get("KS_MPP_OWNER_WRAP_FILE", "").strip()
    return Path(raw) if raw else _DEFAULT_WRAP


def _decode_wrap_material(raw: str) -> bytes:
    text = raw.strip()
    if not text:
        raise OwnerKeystoreError("empty wrap key")
    if text.startswith("base64:"):
        import base64

        return base64.b64decode(text[7:])
    if len(text) == 64 and all(c in "0123456789abcdefABCDEF" for c in text):
        return bytes.fromhex(text)
    import base64

    try:
        decoded = base64.b64decode(text, validate=True)
        if len(decoded) == 32:
            return decoded
    except Exception:
        pass
    return hashlib.sha256(text.encode("utf-8")).digest()


def load_wrap_key() -> bytes:
    """32-byte AES key. Env wins, then the wrap file."""
    env = os.environ.get("KS_MPP_OWNER_WRAP_KEY", "").strip()
    if env:
        material = _decode_wrap_material(env)
        return material if len(material) == 32 else hashlib.sha256(material).digest()
    path = _wrap_path()
    if not path.is_file():
        raise OwnerKeystoreError("owner wrap key is not configured")
    blob = path.read_bytes()
    if len(blob) == 32:
        return blob
    return hashlib.sha256(blob).digest()


def ensure_wrap_key(path: Path | None = None) -> Path:
    """Create a random 32-byte wrap file at 0600 if it does not exist."""
    dest = path or _wrap_path()
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.is_file() and dest.stat().st_size > 0:
        dest.chmod(0o600)
        return dest
    dest.write_bytes(os.urandom(32))
    dest.chmod(0o600)
    return dest


def seal_seed(seed: bytes, wrap_key: bytes | None = None) -> bytes:
    if not isinstance(seed, (bytes, bytearray)) or len(seed) != 32:
        raise OwnerKeystoreError("seed must be 32 bytes")
    key = wrap_key or load_wrap_key()
    nonce = os.urandom(_NONCE_LEN)
    ct = AESGCM(key).encrypt(nonce, bytes(seed), MAGIC)
    return MAGIC + nonce + ct


def unseal_seed(blob: bytes, wrap_key: bytes | None = None) -> bytes:
    if not blob.startswith(MAGIC):
        raise OwnerKeystoreError("owner keystore magic mismatch")
    nonce = blob[len(MAGIC) : len(MAGIC) + _NONCE_LEN]
    ct = blob[len(MAGIC) + _NONCE_LEN :]
    key = wrap_key or load_wrap_key()
    seed = AESGCM(key).decrypt(nonce, ct, MAGIC)
    if len(seed) != 32:
        raise OwnerKeystoreError("unsealed seed has the wrong length")
    return seed


def _owner_from_seed(seed: bytes) -> OwnerKey:
    sk = SigningKey(bytes(seed))
    pub = bytes(sk.verify_key)
    return OwnerKey(
        pubkey_b58=_b58encode(pub),
        seed=bytes(seed),
        secret_64=bytes(sk) + pub,
    )


def import_solana_keypair_file(
    src: Path,
    dest: Path | None = None,
    wrap_key: bytes | None = None,
) -> str:
    """Seal a Solana JSON keypair. Returns the base58 pubkey only."""
    raw = json.loads(Path(src).read_text())
    if isinstance(raw, list):
        secret = bytes(raw)
    elif isinstance(raw, dict) and isinstance(raw.get("secretKey"), list):
        secret = bytes(raw["secretKey"])
    else:
        raise OwnerKeystoreError("keypair file is not a Solana secret array")
    if len(secret) == 64:
        seed = secret[:32]
        pub = secret[32:]
    elif len(secret) == 32:
        seed = secret
        pub = bytes(SigningKey(seed).verify_key)
    else:
        raise OwnerKeystoreError("keypair secret must be 32 or 64 bytes")
    owner = _owner_from_seed(seed)
    if pub and pub != bytes(SigningKey(seed).verify_key):
        raise OwnerKeystoreError("keypair seed and pubkey do not match")
    out = dest or _enc_path()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(seal_seed(seed, wrap_key=wrap_key))
    out.chmod(0o600)
    pub_path = out.with_suffix(".pub")
    pub_path.write_text(owner.pubkey_b58 + "\n")
    pub_path.chmod(0o644)
    logger.info("owner keystore sealed for pubkey %s", owner.pubkey_b58)
    return owner.pubkey_b58


def load_owner() -> OwnerKey | None:
    """Decrypt the owner seed. Returns None when the enc file is absent."""
    path = _enc_path()
    if not path.is_file():
        return None
    try:
        seed = unseal_seed(path.read_bytes())
    except Exception as exc:
        logger.warning("owner keystore unseal failed")
        raise OwnerKeystoreError("owner keystore unseal failed") from exc
    return _owner_from_seed(seed)


def owner_status() -> dict:
    """Public health shape — pubkey only."""
    try:
        owner = load_owner()
    except OwnerKeystoreError:
        return {"loaded": False, "pubkey": None}
    if owner is None:
        return {"loaded": False, "pubkey": None}
    return {"loaded": True, "pubkey": owner.pubkey_b58}


def try_sign_settlement_binding(
    stream_pubkey: bytes | str,
    seq: int,
    amount: int,
    artifact_hash: bytes | str,
) -> tuple[str, bytes] | None:
    """Sign sha256(stream || seq_le || debit_le || artifact). None if unset."""
    try:
        owner = load_owner()
    except OwnerKeystoreError:
        return None
    if owner is None:
        return None
    from .mpp_onchain import coerce_pubkey32, settlement_binding_hash

    stream = coerce_pubkey32(stream_pubkey)
    if isinstance(artifact_hash, str):
        text = artifact_hash.strip()
        if text.startswith(("0x", "0X")):
            text = text[2:]
        artifact = bytes.fromhex(text)
    else:
        artifact = bytes(artifact_hash)
    message = settlement_binding_hash(stream, seq, amount, artifact)
    signature = bytes(SigningKey(owner.seed).sign(message).signature)
    return owner.pubkey_b58, signature
