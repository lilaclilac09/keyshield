"""Register a passkey, then sign in with that same passkey (soft authenticator)."""

from __future__ import annotations

import base64
import hashlib
import json
import os

import cbor2
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from src.backend.app import app
from src.backend.auth import passkey as pk_mod
from src.backend.auth import session as sess_mod
from src.backend.billing import plans as plans_mod

ORIGIN = "https://app.ks.aileena.xyz"
RP_ID = "app.ks.aileena.xyz"


def _b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64u(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


class SoftAuthenticator:
    def __init__(self):
        self.key = ec.generate_private_key(ec.SECP256R1())
        # Use bytes that produce '-' / '_' in base64url to catch encoding bugs.
        self.cred_id = bytes([0xFB, 0xFF, 0xBF] * 11)
        self.count = 0

    def _cose(self) -> bytes:
        n = self.key.public_key().public_numbers()
        return cbor2.dumps({1: 2, 3: -7, -1: 1,
                            -2: n.x.to_bytes(32, "big"), -3: n.y.to_bytes(32, "big")})

    def _cdj(self, typ: str, challenge: str) -> bytes:
        return json.dumps({"type": typ, "challenge": challenge, "origin": ORIGIN,
                           "crossOrigin": False}).encode()

    def create(self, opts: dict) -> dict:
        rp_hash = hashlib.sha256(opts["rp"]["id"].encode()).digest()
        cred_data = (b"\x00" * 16 + len(self.cred_id).to_bytes(2, "big")
                     + self.cred_id + self._cose())
        auth_data = rp_hash + bytes([0x45]) + self.count.to_bytes(4, "big") + cred_data
        att = cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": auth_data})
        return {"id": _b64u(self.cred_id), "rawId": _b64u(self.cred_id), "type": "public-key",
                "response": {"attestationObject": _b64u(att),
                             "clientDataJSON": _b64u(self._cdj("webauthn.create", opts["challenge"]))}}

    def get(self, opts: dict) -> dict:
        allowed = [c["id"] for c in opts.get("allowCredentials", [])]
        assert _b64u(self.cred_id) in allowed, (allowed, _b64u(self.cred_id))
        self.count += 1
        rp_hash = hashlib.sha256(opts["rpId"].encode()).digest()
        auth_data = rp_hash + bytes([0x05]) + self.count.to_bytes(4, "big")
        cdj = self._cdj("webauthn.get", opts["challenge"])
        sig = self.key.sign(auth_data + hashlib.sha256(cdj).digest(), ec.ECDSA(hashes.SHA256()))
        return {"id": _b64u(self.cred_id), "rawId": _b64u(self.cred_id), "type": "public-key",
                "response": {"authenticatorData": _b64u(auth_data), "clientDataJSON": _b64u(cdj),
                             "signature": _b64u(sig), "userHandle": None}}


def test_register_then_login_with_same_passkey(tmp_path, monkeypatch):
    monkeypatch.setattr(pk_mod, "DB_PATH", tmp_path / "keyshield.db")
    pk_mod._PENDING_AUTHS.clear()
    pk_mod._PENDING_REGS.clear()
    pk_mod._init_db()
    monkeypatch.setattr(plans_mod, "DB_PATH", tmp_path / "usage.db")
    client = TestClient(app)
    user = "F6AHWalletJ52R"
    token = sess_mod.create_token(user, "")
    hdr = {"Origin": ORIGIN, "Authorization": f"Bearer {token}"}
    auth = SoftAuthenticator()

    r = client.get("/auth/passkey/register-options", headers=hdr)
    assert r.status_code == 200, r.text
    r = client.post("/auth/passkey/register-verify", headers=hdr,
                    json={"credential": auth.create(r.json()), "name": "Mac"})
    assert r.status_code == 200, r.text

    r = client.get("/auth/passkey/auth-options", params={"user_id": user},
                   headers={"Origin": ORIGIN})
    assert r.status_code == 200, r.text
    r = client.post("/auth/passkey/auth-verify", params={"user_id": user},
                    headers={"Origin": ORIGIN},
                    json={"credential": auth.get(r.json()), "passphrase": ""})
    assert r.status_code == 200, r.text
    assert r.json()["userId"] == user and r.json()["token"]
