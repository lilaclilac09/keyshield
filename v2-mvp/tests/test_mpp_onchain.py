"""
Unit tests for `mpp_onchain.py` and the on-chain seam in
`mpp_streams.settle_on_chain`.

Spec 10 Phase 10.4-real. All tests are stub-side: the byte-layout test
asserts the exact ix data wire format, the env tests verify
stub-fallback, and the idempotency test exercises the
`mpp_settle_attempts` table without any real RPC. Real Solana RPC
integration is a follow-up task and not covered here.
"""

import time
from pathlib import Path

import pytest


# ─── fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def isolate_db(tmp_path, monkeypatch):
    """Per-test SQLite path so the idempotency table doesn't leak
    across tests (mirrors test_mpp_routes.py)."""
    from src import mpp_streams as mpp_mod

    monkeypatch.setattr(mpp_mod, "DB_PATH", Path(tmp_path / "data" / "mpp.db"))
    # Clear the in-memory PDA-warned cache so each test starts fresh.
    mpp_mod._PDA_MISSING_WARNED.clear()
    yield


@pytest.fixture(autouse=True)
def reset_warning_flag():
    """Reset the module-level once-per-process "we warned about
    missing env" flag so each test sees a fresh warning state."""
    from src import mpp_onchain
    mpp_onchain._WARNED_ENV_MISSING = False
    yield


@pytest.fixture
def clean_env(monkeypatch):
    """Strip any KS_* env vars that could leak between tests."""
    for var in (
        "KS_MPP_SETTLER_KEY",
        "KS_PLATFORM_USDC_ATA",
        "KS_KEYSHIELD_PROGRAM_ID",
        "KS_USDC_MINT",
        "KS_VAULT_PDA",
        "KS_SOLANA_RPC_URL",
    ):
        monkeypatch.delenv(var, raising=False)
    yield


# ─── env / config loading ─────────────────────────────────────────────────


class TestLoadConfig:
    def test_load_config_returns_none_when_env_missing(self, clean_env):
        """If any required env var is missing, load_mpp_config()
        returns None — caller falls back to stub."""
        from src import mpp_onchain

        assert mpp_onchain.load_mpp_config() is None

    def test_load_config_succeeds_when_all_env_set(self, clean_env, monkeypatch):
        """All three required vars set → load_mpp_config() returns a
        valid MppConfig.

        Uses a deterministic test keypair (32 zero bytes for the seed,
        derived pubkey via cryptography). The base58 fields are
        on-chain-shape (32 decoded bytes) but don't have to be real.
        """
        from cryptography.hazmat.primitives.asymmetric.ed25519 import (
            Ed25519PrivateKey,
        )
        from cryptography.hazmat.primitives import serialization

        # Build a deterministic 64-byte secret_key (seed + pubkey) the
        # same way Solana keypairs are stored.
        seed = bytes(range(32))  # deterministic
        priv = Ed25519PrivateKey.from_private_bytes(seed)
        pub_bytes = priv.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        secret_key = seed + pub_bytes

        # Use the module's own base58 encoder so we don't have to
        # pull in `base58` for tests.
        from src import mpp_onchain
        b58 = (
            mpp_onchain._base58.b58encode(secret_key).decode()  # type: ignore[union-attr]
            if mpp_onchain._HAS_BASE58
            else mpp_onchain._b58encode_pure(secret_key)
        )

        # Two dummy 32-byte pubkeys (b58 of bytes(32) and 31×0+\x01).
        dummy_pk_a = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x01")
        dummy_pk_b = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x02")

        monkeypatch.setenv("KS_MPP_SETTLER_KEY", b58)
        monkeypatch.setenv("KS_PLATFORM_USDC_ATA", dummy_pk_a)
        monkeypatch.setenv("KS_KEYSHIELD_PROGRAM_ID", dummy_pk_b)

        cfg = mpp_onchain.load_mpp_config()
        assert cfg is not None
        assert cfg.platform_usdc_ata == dummy_pk_a
        assert cfg.keyshield_program_id == dummy_pk_b
        assert len(cfg.secret_key) == 64
        # Settler pubkey must be the public half of the keypair.
        derived = mpp_onchain._b58decode(cfg.settler_pubkey)
        assert derived == pub_bytes
        # USDC mint default kicks in when KS_USDC_MINT unset.
        assert cfg.usdc_mint == mpp_onchain.USDC_MINT_MAINNET


# ─── byte layout (the load-bearing test) ──────────────────────────────────


class TestIxBytes:
    def test_build_settle_ix_data_byte_layout(self):
        """The ix data wire format MUST be exactly:
            byte 0     : discriminator = 26 (0x1a)
            bytes 1..9 : amount as u64 little-endian

        This is the contract with the on-chain handler in
        `programs/keyshield/src/instructions/mpp_settle.rs`.
        """
        from src import mpp_onchain

        # Spec calls out 10000 µUSDC as the canonical sanity check.
        amount = 10_000
        data = mpp_onchain.build_mpp_settle_ix_data(amount)
        assert data == b"\x1a" + amount.to_bytes(8, "little")
        # Sanity: 9 bytes total.
        assert len(data) == 9

        # Boundary: zero amount still encodes (caller filters > 0).
        assert mpp_onchain.build_mpp_settle_ix_data(0) == b"\x1a" + b"\x00" * 8

        # Boundary: max u64.
        max_u64 = 0xFFFFFFFFFFFFFFFF
        assert (
            mpp_onchain.build_mpp_settle_ix_data(max_u64)
            == b"\x1a" + b"\xff" * 8
        )

        # Negative amount → ValueError.
        with pytest.raises(ValueError):
            mpp_onchain.build_mpp_settle_ix_data(-1)

        # Over-u64 → ValueError.
        with pytest.raises(ValueError):
            mpp_onchain.build_mpp_settle_ix_data(max_u64 + 1)


# ─── settle_on_chain integration (stub fallbacks) ─────────────────────────


class TestSettleOnChain:
    def test_settle_on_chain_returns_zero_when_config_missing(
        self, clean_env,
    ):
        """The original stub behavior must be preserved: with no env,
        settle_on_chain returns 0 (no exception, no DB row)."""
        from src import mpp_streams

        out = mpp_streams.settle_on_chain(stream_id=42, micro_usdc=1500)
        assert out == 0

    def test_settle_on_chain_returns_zero_when_pda_missing(
        self, clean_env, monkeypatch,
    ):
        """With env set but the PDA still DB-only (open_stream not
        yet on-chain), settle_on_chain logs a warning and returns 0
        without trying to submit."""
        from src import mpp_onchain, mpp_streams

        # Set env so load_mpp_config returns a config.
        seed = bytes(range(32))
        from cryptography.hazmat.primitives.asymmetric.ed25519 import (
            Ed25519PrivateKey,
        )
        from cryptography.hazmat.primitives import serialization
        priv = Ed25519PrivateKey.from_private_bytes(seed)
        pub_bytes = priv.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        secret_key = seed + pub_bytes
        b58 = (
            mpp_onchain._base58.b58encode(secret_key).decode()  # type: ignore[union-attr]
            if mpp_onchain._HAS_BASE58
            else mpp_onchain._b58encode_pure(secret_key)
        )
        dummy_pk_a = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x01")
        dummy_pk_b = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x02")

        monkeypatch.setenv("KS_MPP_SETTLER_KEY", b58)
        monkeypatch.setenv("KS_PLATFORM_USDC_ATA", dummy_pk_a)
        monkeypatch.setenv("KS_KEYSHIELD_PROGRAM_ID", dummy_pk_b)

        # Default _get_stream_pda_ata returns (None, None) — that's
        # the stub-DB state today. Verify settle_on_chain returns 0
        # without trying to submit.
        out = mpp_streams.settle_on_chain(stream_id=99, micro_usdc=1500)
        assert out == 0

        # And no settle attempt was recorded (we never got far
        # enough to need the idempotency log).
        conn = mpp_streams._db()
        try:
            count = conn.execute(
                "SELECT COUNT(*) FROM mpp_settle_attempts WHERE stream_id = ?",
                (99,),
            ).fetchone()[0]
        finally:
            conn.close()
        assert count == 0

    def test_idempotency_table_prevents_double_submit(
        self, clean_env, monkeypatch,
    ):
        """Two calls to settle_on_chain with identical (stream_id,
        amount) within the recency window should NOT both submit;
        the second returns the prior recorded result.

        We mock _get_stream_pda_ata to return real-looking PDA/ATA
        and submit_mpp_settle to record how many times it ran.
        """
        from src import mpp_onchain, mpp_streams

        # Env set.
        seed = bytes(range(32))
        from cryptography.hazmat.primitives.asymmetric.ed25519 import (
            Ed25519PrivateKey,
        )
        from cryptography.hazmat.primitives import serialization
        priv = Ed25519PrivateKey.from_private_bytes(seed)
        pub_bytes = priv.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        secret_key = seed + pub_bytes
        b58 = (
            mpp_onchain._base58.b58encode(secret_key).decode()  # type: ignore[union-attr]
            if mpp_onchain._HAS_BASE58
            else mpp_onchain._b58encode_pure(secret_key)
        )
        dummy_pk_a = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x01")
        dummy_pk_b = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x02")
        dummy_pk_v = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x03")

        monkeypatch.setenv("KS_MPP_SETTLER_KEY", b58)
        monkeypatch.setenv("KS_PLATFORM_USDC_ATA", dummy_pk_a)
        monkeypatch.setenv("KS_KEYSHIELD_PROGRAM_ID", dummy_pk_b)
        monkeypatch.setenv("KS_VAULT_PDA", dummy_pk_v)

        # Pretend the stream was opened on-chain.
        fake_pda = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x04")
        fake_ata = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x05")
        monkeypatch.setattr(
            mpp_streams,
            "_get_stream_pda_ata",
            lambda sid: (fake_pda, fake_ata),
        )

        # Mock submit to count calls + return the requested amount.
        call_count = {"n": 0}

        async def fake_submit(config, ix):
            call_count["n"] += 1
            # Read amount from the ix data (bytes 1..9).
            return int.from_bytes(ix.data[1:9], "little")

        monkeypatch.setattr(mpp_onchain, "submit_mpp_settle", fake_submit)

        # First call: real submission path.
        out1 = mpp_streams.settle_on_chain(stream_id=7, micro_usdc=2500)
        assert out1 == 2500
        assert call_count["n"] == 1

        # Second call within recency window with same (stream, amount):
        # idempotency log returns the prior result without re-submitting.
        out2 = mpp_streams.settle_on_chain(stream_id=7, micro_usdc=2500)
        assert out2 == 2500
        assert call_count["n"] == 1, "second call must not re-submit"

        # Different amount → fresh attempt, even within the window.
        out3 = mpp_streams.settle_on_chain(stream_id=7, micro_usdc=3000)
        assert out3 == 3000
        assert call_count["n"] == 2

        # Verify the idempotency table has 2 rows total.
        conn = mpp_streams._db()
        try:
            rows = conn.execute(
                "SELECT requested_micro_usdc, debited_micro_usdc, success "
                "FROM mpp_settle_attempts WHERE stream_id = ? ORDER BY id",
                (7,),
            ).fetchall()
        finally:
            conn.close()
        assert len(rows) == 2
        assert rows[0] == (2500, 2500, 1)
        assert rows[1] == (3000, 3000, 1)
