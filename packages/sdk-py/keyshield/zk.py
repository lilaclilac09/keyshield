"""ZK mode (zk-v1) client: decrypt provider keys on this machine.

The KeyShield server stores only ciphertext plus a per-item share S. This
module combines S with your root R (derived from your passkey, never sent
to the server) to decrypt a key locally. Spec: docs/zk/ZK-MODE.md.

Needs `cryptography` (pip install "keyshield[zk]").
"""

from __future__ import annotations

import base64
import hashlib
import os
import secrets
import stat
import threading
import time
from pathlib import Path
from typing import Any

import httpx

DEFAULT_BASE = "https://keyshield-production.up.railway.app"
UNLOCK_PREFIX = "ksz1."
ROOT_FILE = Path(os.environ.get("KS_ZK_ROOT_FILE", "~/.keyshield/zk-root")).expanduser()
MAX_SHARE_CACHE = 60  # seconds; matches the server's max_cache_seconds


class ZkError(Exception):
    pass


class Revoked(ZkError):
    """The token can no longer fetch shares (revoked or expired)."""


def _crypto():
    try:
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    except ImportError as exc:  # pragma: no cover
        raise ZkError(
            'ZK mode needs cryptography: pip install "keyshield[zk]"'
        ) from exc
    return hashes, AESGCM, HKDF


def b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def unb64u(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _hkdf(ikm: bytes, salt: bytes, info: bytes) -> bytes:
    hashes, _, HKDF = _crypto()
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=salt, info=info).derive(ikm)


def root_from_prf(prf_output: bytes) -> bytes:
    return _hkdf(prf_output, b"", b"keyshield/zk/v1/root")


def root_id(root: bytes) -> str:
    return b64u(hashlib.sha256(b"keyshield/zk/v1/root-id" + root).digest()[:18])


def item_key(root: bytes, share: bytes, item_id: str, upstream: str) -> bytes:
    return _hkdf(root, share, f"keyshield/zk/v1/item:{item_id}:{upstream}".encode())


def _aad(item_id: str, upstream: str) -> bytes:
    return f"{item_id}|{upstream}".encode()


def open_item(root: bytes, share: bytes, item: dict) -> str:
    _, AESGCM, _ = _crypto()
    k = item_key(root, share, item["id"], item["upstream"])
    try:
        pt = AESGCM(k).decrypt(
            unb64u(item["iv"]),
            unb64u(item["cipher"]),
            _aad(item["id"], item["upstream"]),
        )
    except Exception as exc:
        raise ZkError(
            f"can't decrypt {item['id']}: wrong root or corrupted row"
        ) from exc
    return pt.decode()


def seal_item(
    root: bytes, upstream: str, key: str, *, hint: str = "", name: str = ""
) -> dict:
    """Build a cipher_v=2 /manage/store body. The share goes to the server only."""
    _, AESGCM, _ = _crypto()
    item_id = "ks_" + secrets.token_hex(6)
    share, iv = os.urandom(32), os.urandom(12)
    k = item_key(root, share, item_id, upstream)
    cipher = AESGCM(k).encrypt(iv, key.encode(), _aad(item_id, upstream))
    body = {
        "id": item_id,
        "upstream": upstream,
        "cipher": b64u(cipher),
        "iv": b64u(iv),
        "share": b64u(share),
        "cipher_v": 2,
        "hint": hint,
    }
    if name:
        body["name"] = name
    return body


def parse_unlock_code(code: str) -> bytes:
    code = code.strip()
    if not code.startswith(UNLOCK_PREFIX):
        raise ZkError("unlock code must start with ksz1.")
    raw = unb64u(code[len(UNLOCK_PREFIX) :])
    if len(raw) != 32:
        raise ZkError("unlock code is not a 32-byte root")
    return raw


def save_root(root: bytes, path: Path = ROOT_FILE) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    os.chmod(path.parent, 0o700)
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as fh:
        fh.write(UNLOCK_PREFIX + b64u(root) + "\n")
    os.chmod(path, 0o600)
    return path


def load_root(path: Path = ROOT_FILE) -> bytes:
    env = os.environ.get("KS_ZK_ROOT", "").strip()
    if env:
        return parse_unlock_code(env)
    if not path.is_file():
        raise ZkError(f"no ZK root at {path}; run `keyshield-proxy enroll` first")
    mode = stat.S_IMODE(path.stat().st_mode)
    if mode & 0o077:
        raise ZkError(
            f"{path} is readable by other users (mode {oct(mode)}); chmod 600 it"
        )
    return parse_unlock_code(path.read_text())


class ZkClient:
    """Talks to the KeyShield server with a (proxy-scope) token."""

    def __init__(
        self,
        token: str,
        root: bytes,
        base_url: str = DEFAULT_BASE,
        *,
        share_ttl: float = 30.0,
        items_ttl: float = 60.0,
        http: httpx.Client | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self._token = token
        self._root = root
        self.share_ttl = max(0.0, min(float(share_ttl), MAX_SHARE_CACHE))
        self.items_ttl = items_ttl
        self._http = http or httpx.Client(base_url=self.base_url, timeout=20)
        self._lock = threading.Lock()
        self._items: tuple[float, list[dict]] | None = None
        self._shares: dict[str, tuple[float, bytes]] = {}

    def _get(self, path: str) -> Any:
        r = self._http.get(path, headers={"Authorization": f"Bearer {self._token}"})
        if r.status_code == 401:
            with self._lock:
                self._shares.clear()
                self._items = None
            raise Revoked("token rejected by KeyShield (revoked or expired)")
        if r.status_code >= 400:
            raise ZkError(f"GET {path} -> {r.status_code}: {r.text[:200]}")
        return r.json()

    def status(self) -> dict:
        return self._get("/zk/status")

    def check_root(self) -> dict:
        st = self.status()
        if not st.get("enabled"):
            raise ZkError(
                "ZK mode is off for this account; turn it on in the dashboard"
            )
        if st.get("root_id") != root_id(self._root):
            raise ZkError("this unlock code belongs to a different passkey root")
        return st

    def items(self) -> list[dict]:
        now = time.monotonic()
        with self._lock:
            if self._items and now - self._items[0] < self.items_ttl:
                return self._items[1]
        items = self._get("/zk/items")["items"]
        with self._lock:
            self._items = (now, items)
        return items

    def _share(self, item_id: str) -> bytes:
        now = time.monotonic()
        with self._lock:
            hit = self._shares.get(item_id)
            if hit and now - hit[0] < self.share_ttl:
                return hit[1]
        body = self._get(f"/zk/share/{item_id}")
        share = unb64u(body["share"])
        ttl_cap = float(body.get("max_cache_seconds") or MAX_SHARE_CACHE)
        self.share_ttl = min(self.share_ttl, ttl_cap)
        with self._lock:
            self._shares[item_id] = (now, share)
        return share

    def key_for(self, upstream: str) -> str:
        """Newest ZK key for an upstream, decrypted here. Never cached."""
        matches = [i for i in self.items() if i.get("upstream") == upstream]
        if not matches:
            with self._lock:
                self._items = None  # maybe it was just saved
            matches = [i for i in self.items() if i.get("upstream") == upstream]
        if not matches:
            raise ZkError(f"no zero-knowledge {upstream} key in your vault")
        item = matches[0]
        return open_item(self._root, self._share(item["id"]), item)
