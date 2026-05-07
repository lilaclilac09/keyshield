"""
Unit tests for `mpp_onchain.py` and the on-chain seam in
`mpp_streams.settle_on_chain`.

Spec 10 Phase 10.4-real. All tests are stub-side: the byte-layout test
asserts the exact ix data wire format, the env tests verify
stub-fallback, and the idempotency test exercises the
`mpp_settle_attempts` table without any real RPC. Real Solana RPC
integration is a follow-up task and not covered here.
"""

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


# ─── Spec 10 Phase 10.5: open_stream / withdraw builders ──────────────────
#
# These ixs are owner-signed (frontend wallet adapter), so the server's
# only job is byte-perfect ix construction. Tests below verify the wire
# layout against the Rust handler's `data[i..j]` slicing.


class TestOpenStreamIxBytes:
    """Byte-layout contract for build_open_payment_stream_ix_data.

    Mirrors the slicing in open_stream.rs:89-101 once the dispatcher
    has stripped byte 0:
        bump      = data[0]
        max_total = data[1..9]   (u64 LE)
        cost      = data[9..17]  (u64 LE)
        rate_bits = data[17..25] (u64 LE)
        interval  = data[25..29] (u32 LE)
    """

    def test_data_byte_layout(self):
        from src import mpp_onchain

        data = mpp_onchain.build_open_payment_stream_ix_data(
            bump=254,
            max_total_micro_usdc=1_000_000,        # 1 USDC
            cost_per_unit_micro_usdc=10,           # $0.00001 per unit
            max_rate_usd_per_min_bits=0xDEADBEEF,  # arbitrary bit pattern
            settlement_interval_secs=60,
        )

        # 30 bytes total: 1 disc + 1 bump + 3×8 + 4
        assert len(data) == 30
        assert data[0] == 0x18  # discriminator = 24
        assert data[1] == 254
        assert data[2:10] == (1_000_000).to_bytes(8, "little")
        assert data[10:18] == (10).to_bytes(8, "little")
        assert data[18:26] == (0xDEADBEEF).to_bytes(8, "little")
        assert data[26:30] == (60).to_bytes(4, "little")

    def test_zero_max_total_rejected(self):
        """Matches the on-chain check at open_stream.rs:103."""
        from src import mpp_onchain

        with pytest.raises(ValueError, match="max_total_micro_usdc must be positive"):
            mpp_onchain.build_open_payment_stream_ix_data(
                bump=255, max_total_micro_usdc=0,
                cost_per_unit_micro_usdc=1,
                max_rate_usd_per_min_bits=0,
                settlement_interval_secs=1,
            )

    def test_bump_out_of_range_rejected(self):
        from src import mpp_onchain

        with pytest.raises(ValueError, match="bump must fit u8"):
            mpp_onchain.build_open_payment_stream_ix_data(
                bump=256, max_total_micro_usdc=1,
                cost_per_unit_micro_usdc=1,
                max_rate_usd_per_min_bits=0,
                settlement_interval_secs=1,
            )

    def test_settlement_interval_overflow_rejected(self):
        from src import mpp_onchain

        with pytest.raises(ValueError, match="settlement_interval_secs"):
            mpp_onchain.build_open_payment_stream_ix_data(
                bump=255, max_total_micro_usdc=1,
                cost_per_unit_micro_usdc=1,
                max_rate_usd_per_min_bits=0,
                settlement_interval_secs=0xFFFFFFFF + 1,
            )


class TestOpenStreamIxAccounts:
    """Account ordering / signer / writable flags must match
    open_stream.rs:42-56 exactly. A wrong flag silently corrupts:
    Solana doesn't reject mis-flagged metas at submit time, the on-chain
    handler just sees wrong account permissions and fails opaquely."""

    def _config(self, monkeypatch):
        """Build a real-looking MppConfig + extra vault PDA."""
        from src import mpp_onchain

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
        platform_ata = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x01")
        program_id = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x02")
        vault_pda = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x03")

        monkeypatch.setenv("KS_MPP_SETTLER_KEY", b58)
        monkeypatch.setenv("KS_PLATFORM_USDC_ATA", platform_ata)
        monkeypatch.setenv("KS_KEYSHIELD_PROGRAM_ID", program_id)
        monkeypatch.setenv("KS_VAULT_PDA", vault_pda)

        cfg = mpp_onchain.load_mpp_config()
        assert cfg is not None and cfg.vault_pda is not None
        return cfg

    def test_account_order_signer_writable(self, clean_env, monkeypatch):
        from src import mpp_onchain

        cfg = self._config(monkeypatch)
        owner = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x10")
        agent = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x11")
        stream_pda = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x12")
        usdc_ata = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x13")

        ix = mpp_onchain.build_open_payment_stream_ix(
            config=cfg,
            owner_pubkey=owner,
            agent_pubkey=agent,
            stream_pda=stream_pda,
            usdc_ata=usdc_ata,
            bump=255,
            max_total_micro_usdc=10_000_000,
            cost_per_unit_micro_usdc=1,
            max_rate_usd_per_min_bits=0,
            settlement_interval_secs=60,
        )

        # 8 accounts in spec order.
        assert len(ix.accounts) == 8
        # 0: owner (signer, NOT writable per open_stream.rs:43 — open
        #    doesn't mutate owner; CreateAccount uses `from = owner`
        #    but the system_program transfer is the writable mutation).
        #    Actually open_stream.rs:43 says "[signer]" not "[signer, writable]"
        #    so owner only signs.
        assert ix.accounts[0].pubkey == owner
        assert ix.accounts[0].is_signer is True
        assert ix.accounts[0].is_writable is False
        # 1: vault (read-only)
        assert ix.accounts[1].pubkey == cfg.vault_pda
        assert ix.accounts[1].is_signer is False
        assert ix.accounts[1].is_writable is False
        # 2: stream PDA (writable, allocated in this ix)
        assert ix.accounts[2].pubkey == stream_pda
        assert ix.accounts[2].is_writable is True
        # 3: USDC mint (read)
        assert ix.accounts[3].pubkey == cfg.usdc_mint
        # 4: USDC ATA (read — the SPL ATA ix in the same tx writes it)
        assert ix.accounts[4].pubkey == usdc_ata
        # 5: agent grant pubkey (read)
        assert ix.accounts[5].pubkey == agent
        # 6: mpp_settler (read)
        assert ix.accounts[6].pubkey == cfg.settler_pubkey
        # 7: System Program
        assert ix.accounts[7].pubkey == mpp_onchain.SYSTEM_PROGRAM_ID

        # No account other than the owner is a signer.
        assert sum(1 for a in ix.accounts if a.is_signer) == 1

        # Program ID = keyshield deploy.
        assert ix.program_id == cfg.keyshield_program_id

        # Data length 30 (full wire) — matches the 29-byte body check
        # at open_stream.rs:71 after dispatcher strips byte 0.
        assert len(ix.data) == 30

    def test_missing_vault_pda_raises(self, clean_env, monkeypatch):
        """build_open_payment_stream_ix needs vault_pda to assemble the
        account list. Without it we raise rather than silently produce
        a malformed ix."""
        from src import mpp_onchain

        # Set everything EXCEPT vault PDA.
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
        monkeypatch.setenv("KS_MPP_SETTLER_KEY", b58)
        monkeypatch.setenv(
            "KS_PLATFORM_USDC_ATA",
            mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x01"),
        )
        monkeypatch.setenv(
            "KS_KEYSHIELD_PROGRAM_ID",
            mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x02"),
        )
        # No KS_VAULT_PDA — cfg.vault_pda will be None.
        cfg = mpp_onchain.load_mpp_config()
        assert cfg is not None and cfg.vault_pda is None

        with pytest.raises(ValueError, match="vault_pda is required"):
            mpp_onchain.build_open_payment_stream_ix(
                config=cfg,
                owner_pubkey="11111111111111111111111111111111",
                agent_pubkey="11111111111111111111111111111111",
                stream_pda="11111111111111111111111111111111",
                usdc_ata="11111111111111111111111111111111",
                bump=255,
                max_total_micro_usdc=1,
                cost_per_unit_micro_usdc=1,
                max_rate_usd_per_min_bits=0,
                settlement_interval_secs=60,
            )


class TestWithdrawIxBytes:
    """Wire layout for build_withdraw_agent_wallet_ix_data — matches
    withdraw.rs:76-80 (u64 LE at data[0..8] post-strip)."""

    def test_data_byte_layout(self):
        from src import mpp_onchain

        amount = 750_000  # 0.75 USDC
        data = mpp_onchain.build_withdraw_agent_wallet_ix_data(amount)
        assert len(data) == 9
        assert data[0] == 0x1B  # discriminator = 27
        assert data[1:9] == amount.to_bytes(8, "little")

        # Zero is allowed at the bytes level (on-chain rejects via SPL
        # transfer if the source ATA can't cover it).
        assert mpp_onchain.build_withdraw_agent_wallet_ix_data(0) == (
            b"\x1b" + b"\x00" * 8
        )

        # Max u64 boundary.
        assert mpp_onchain.build_withdraw_agent_wallet_ix_data(
            0xFFFFFFFFFFFFFFFF
        ) == b"\x1b" + b"\xff" * 8

        # Negative → ValueError.
        with pytest.raises(ValueError):
            mpp_onchain.build_withdraw_agent_wallet_ix_data(-1)

        # Over u64 → ValueError.
        with pytest.raises(ValueError):
            mpp_onchain.build_withdraw_agent_wallet_ix_data(2**64)


class TestWithdrawIxAccounts:
    """Account ordering for withdraw_agent_wallet — matches withdraw.rs:38-45.

    Critical writability differences vs open_stream:
      - owner is BOTH signer AND writable here (rent reclaim destination)
      - stream_pda, stream_ata, owner_ata are all writable (drained / closed)
    """

    def test_account_order_signer_writable(self, clean_env, monkeypatch):
        from src import mpp_onchain

        # Reuse the open-stream config builder.
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
        monkeypatch.setenv("KS_MPP_SETTLER_KEY", b58)
        monkeypatch.setenv(
            "KS_PLATFORM_USDC_ATA",
            mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x01"),
        )
        monkeypatch.setenv(
            "KS_KEYSHIELD_PROGRAM_ID",
            mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x02"),
        )
        monkeypatch.setenv(
            "KS_VAULT_PDA",
            mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x03"),
        )
        cfg = mpp_onchain.load_mpp_config()
        assert cfg is not None and cfg.vault_pda is not None

        owner = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x20")
        stream_pda = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x21")
        stream_ata = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x22")
        owner_ata = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x23")

        ix = mpp_onchain.build_withdraw_agent_wallet_ix(
            config=cfg,
            owner_pubkey=owner,
            stream_pda=stream_pda,
            stream_ata=stream_ata,
            owner_ata=owner_ata,
            withdraw_amount_micro_usdc=500_000,
        )

        # 7 accounts in spec order.
        assert len(ix.accounts) == 7
        # 0: owner — signer + writable
        assert ix.accounts[0].pubkey == owner
        assert ix.accounts[0].is_signer is True
        assert ix.accounts[0].is_writable is True
        # 1: vault (read)
        assert ix.accounts[1].pubkey == cfg.vault_pda
        assert ix.accounts[1].is_writable is False
        # 2: stream PDA (writable — closed)
        assert ix.accounts[2].pubkey == stream_pda
        assert ix.accounts[2].is_writable is True
        # 3: stream ATA (writable — drained)
        assert ix.accounts[3].pubkey == stream_ata
        assert ix.accounts[3].is_writable is True
        # 4: owner ATA (writable — receives drain)
        assert ix.accounts[4].pubkey == owner_ata
        assert ix.accounts[4].is_writable is True
        # 5: USDC mint (read)
        assert ix.accounts[5].pubkey == cfg.usdc_mint
        # 6: SPL Token Program
        assert ix.accounts[6].pubkey == mpp_onchain.TOKEN_PROGRAM_ID

        # Single signer (owner only).
        assert sum(1 for a in ix.accounts if a.is_signer) == 1

        # Program ID = keyshield.
        assert ix.program_id == cfg.keyshield_program_id

        # Data: discriminator + u64 = 9 bytes (matches data.len() < 8
        # check at withdraw.rs:59 after dispatcher strip).
        assert len(ix.data) == 9
        assert ix.data[0] == 0x1B
        assert int.from_bytes(ix.data[1:9], "little") == 500_000


class TestPdaDerivation:
    """PDA derivation requires solders. Skipped in venvs without it,
    which is the default state today (stub-fallback path)."""

    @pytest.mark.skipif(
        True,  # Force-skip until solders is installed in v2-mvp/.venv
        reason="solders not installed in v2-mvp/.venv (stub-fallback path)",
    )
    def test_aps_seed_matches_rust(self):
        from src import mpp_onchain

        # The seed bytes MUST be exactly the literal in
        # programs/keyshield/src/instructions/open_stream.rs:38
        assert mpp_onchain.APS_SEED == b"agent_payment_stream"

    @pytest.mark.skipif(
        True,
        reason="solders not installed in v2-mvp/.venv (stub-fallback path)",
    )
    def test_derive_returns_valid_pda_and_bump(self):
        """When solders is available, deriving the PDA returns a
        base58 string + a bump in [0, 255]. Two calls with same inputs
        produce identical output."""
        from src import mpp_onchain

        agent = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x10")
        owner = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x11")
        program = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x12")

        pda1, bump1 = mpp_onchain.derive_agent_payment_stream_pda(
            agent, owner, program,
        )
        pda2, bump2 = mpp_onchain.derive_agent_payment_stream_pda(
            agent, owner, program,
        )
        assert pda1 == pda2
        assert bump1 == bump2
        assert 0 <= bump1 <= 255
        assert isinstance(pda1, str) and len(pda1) > 0


class TestSeedConstantSanity:
    """One assertion that runs without solders — guards against an
    accidental APS_SEED rename. The Rust counterpart is a `pub const`
    in open_stream.rs:38; bumping either side without the other breaks
    PDA derivation."""

    def test_aps_seed_constant_matches_rust(self):
        from src import mpp_onchain

        assert mpp_onchain.APS_SEED == b"agent_payment_stream"
