"""Reference zk-v1 client crypto, used only by tests.

The server never runs this. It mirrors docs/zk/ZK-MODE.md so tests can
prove the server stores data it can't read, and pins the test vectors
in docs/zk/vectors.json that the SDK and extension also check.
"""

from __future__ import annotations

import base64
import hashlib

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


def b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def unb64u(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _hkdf(ikm: bytes, salt: bytes, info: bytes) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=salt, info=info).derive(ikm)


def root_from_prf(prf: bytes) -> bytes:
    return _hkdf(prf, b"", b"keyshield/zk/v1/root")


def root_id(root: bytes) -> str:
    return b64u(hashlib.sha256(b"keyshield/zk/v1/root-id" + root).digest()[:18])


def item_key(root: bytes, share: bytes, item_id: str, upstream: str) -> bytes:
    return _hkdf(root, share, f"keyshield/zk/v1/item:{item_id}:{upstream}".encode())


def seal(root: bytes, share: bytes, iv: bytes, item_id: str, upstream: str, key: str) -> str:
    k = item_key(root, share, item_id, upstream)
    return b64u(AESGCM(k).encrypt(iv, key.encode(), f"{item_id}|{upstream}".encode()))


def open_(root: bytes, share: bytes, iv: bytes, item_id: str, upstream: str, cipher: str) -> str:
    k = item_key(root, share, item_id, upstream)
    return AESGCM(k).decrypt(iv, unb64u(cipher), f"{item_id}|{upstream}".encode()).decode()
