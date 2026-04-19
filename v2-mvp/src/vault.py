"""
Layer 1: AES-256-GCM vault — 每个用户的 key 用他们自己的密码加密。
服务器不保存用户密码，也不保存明文 key。
"""

import os
import stat
import hashlib
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

VAULT_DIR = Path(__file__).parent.parent / "vault"
SALT_LEN = 16
NONCE_LEN = 12
KDF_ITERS = 100_000


def _derive_key(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, KDF_ITERS, dklen=32)


def store(user_id: str, upstream: str, api_key: str, password: str) -> None:
    user_dir = VAULT_DIR / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    os.chmod(user_dir, stat.S_IRWXU)  # chmod 700

    salt = os.urandom(SALT_LEN)
    nonce = os.urandom(NONCE_LEN)
    aes = AESGCM(_derive_key(password, salt))
    ciphertext = aes.encrypt(nonce, api_key.encode(), None)  # includes GCM tag

    payload = salt + nonce + ciphertext
    file_path = user_dir / f"{upstream}.enc"
    file_path.write_bytes(payload)
    os.chmod(file_path, stat.S_IRUSR | stat.S_IWUSR)  # chmod 600


def load(user_id: str, upstream: str, password: str) -> str:
    file_path = VAULT_DIR / user_id / f"{upstream}.enc"
    try:
        payload = file_path.read_bytes()
    except FileNotFoundError:
        raise PermissionError("unauthorized")

    salt = payload[:SALT_LEN]
    nonce = payload[SALT_LEN : SALT_LEN + NONCE_LEN]
    ciphertext = payload[SALT_LEN + NONCE_LEN :]

    try:
        aes = AESGCM(_derive_key(password, salt))
        return aes.decrypt(nonce, ciphertext, None).decode()
    except Exception:
        raise PermissionError("unauthorized")
