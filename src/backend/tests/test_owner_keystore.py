"""Encrypted owner keystore — seal / unseal / settlement binding."""

from __future__ import annotations

import json

from nacl.signing import SigningKey

from src.backend.mpp import mpp_onchain, owner_keystore


def test_seal_roundtrip_and_pubkey_only(tmp_path, monkeypatch):
    wrap = tmp_path / "owner.wrap"
    enc = tmp_path / "user.enc"
    monkeypatch.setenv("KS_MPP_OWNER_WRAP_FILE", str(wrap))
    monkeypatch.setenv("KS_MPP_OWNER_KEY_FILE", str(enc))
    monkeypatch.delenv("KS_MPP_OWNER_WRAP_KEY", raising=False)
    owner_keystore.ensure_wrap_key(wrap)

    sk = SigningKey(bytes([9]) * 32)
    secret = list(bytes(sk) + bytes(sk.verify_key))
    src = tmp_path / "user.json"
    src.write_text(json.dumps(secret))

    pubkey = owner_keystore.import_solana_keypair_file(src, dest=enc)
    assert pubkey == owner_keystore._b58encode(bytes(sk.verify_key))
    assert enc.is_file()
    blob = enc.read_bytes()
    assert blob.startswith(owner_keystore.MAGIC)
    assert bytes(sk) not in blob

    loaded = owner_keystore.load_owner()
    assert loaded is not None
    assert loaded.pubkey_b58 == pubkey
    assert loaded.seed == bytes(sk)

    status = owner_keystore.owner_status()
    assert status == {"loaded": True, "pubkey": pubkey}


def test_try_sign_settlement_binding_matches_nacl(tmp_path, monkeypatch):
    wrap = tmp_path / "owner.wrap"
    enc = tmp_path / "user.enc"
    monkeypatch.setenv("KS_MPP_OWNER_WRAP_FILE", str(wrap))
    monkeypatch.setenv("KS_MPP_OWNER_KEY_FILE", str(enc))
    monkeypatch.delenv("KS_MPP_OWNER_WRAP_KEY", raising=False)
    owner_keystore.ensure_wrap_key(wrap)
    sk = SigningKey(bytes([3]) * 32)
    src = tmp_path / "user.json"
    src.write_text(json.dumps(list(bytes(sk) + bytes(sk.verify_key))))
    owner_keystore.import_solana_keypair_file(src, dest=enc)

    stream = bytes([0x11]) * 32
    artifact = bytes(range(32))
    auto = owner_keystore.try_sign_settlement_binding(stream, 1, 1000, artifact)
    assert auto is not None
    pub, sig = auto
    message = mpp_onchain.settlement_binding_hash(stream, 1, 1000, artifact)
    assert bytes(sk.sign(message).signature) == sig
    assert pub == owner_keystore._b58encode(bytes(sk.verify_key))


def test_load_owner_none_when_file_missing(tmp_path, monkeypatch):
    monkeypatch.setenv("KS_MPP_OWNER_KEY_FILE", str(tmp_path / "missing.enc"))
    monkeypatch.setenv("KS_MPP_OWNER_WRAP_FILE", str(tmp_path / "missing.wrap"))
    monkeypatch.delenv("KS_MPP_OWNER_WRAP_KEY", raising=False)
    assert owner_keystore.load_owner() is None
    assert (
        owner_keystore.try_sign_settlement_binding(bytes([1]) * 32, 1, 1, bytes(range(32))) is None
    )
