"""
Tests for agent_wallet (Ephemeral Signer / Agent Embedded Wallet).

Covers byte layout for ix #23 CreateEphemeralSigner. The on-chain
handler (programs/keyshield/src/instructions/agent_access.rs) checks
data.len() < 9 after dispatcher strips byte 0 → wire payload is 10 bytes.
"""

import pytest
from pathlib import Path


@pytest.fixture(autouse=True)
def isolate_dbs(tmp_path, monkeypatch):
    from src import vault as vault_mod
    from src import session as session_mod
    from src import agents as agents_mod
    from src import mpp_onchain
    monkeypatch.setattr(vault_mod, "VAULT_DIR", Path(tmp_path / "vault"))
    monkeypatch.setattr(session_mod, "DB_PATH", Path(tmp_path / "sessions.db"))
    monkeypatch.setattr(agents_mod, "DB_PATH", Path(tmp_path / "data" / "agents.db"))
    mpp_onchain._WARNED_ENV_MISSING = False
    yield


class TestIxBytes:
    """Wire format for create_ephemeral_signer (ix #23).

    Layout post-dispatcher-strip:
      [0]:    discriminator = 23 (0x17)
      [1]:    allowed_actions (u8)
      [2..10]: expiry_seconds (u64 LE; 0 = no expiry)
    """

    def test_byte_layout_full_delegation(self):
        from src import agent_wallet

        data = agent_wallet.build_create_ephemeral_signer_ix_data(
            allowed_actions=agent_wallet.AllowedActions.ALL,
            expiry_seconds=86_400,
        )
        assert len(data) == 10
        assert data[0] == 0x17
        assert data[1] == 0x0F
        assert int.from_bytes(data[2:10], "little") == 86_400

    def test_byte_layout_pay_and_proxy_default(self):
        from src import agent_wallet
        data = agent_wallet.build_create_ephemeral_signer_ix_data(
            allowed_actions=agent_wallet.AllowedActions.PAY_AND_PROXY,
            expiry_seconds=0,
        )
        assert data[1] == 0x05
        assert data[2:10] == b"\x00" * 8

    def test_zero_expiry_means_no_expiry(self):
        from src import agent_wallet
        data = agent_wallet.build_create_ephemeral_signer_ix_data(
            allowed_actions=0x01, expiry_seconds=0,
        )
        assert int.from_bytes(data[2:10], "little") == 0

    def test_max_u64_expiry(self):
        from src import agent_wallet
        data = agent_wallet.build_create_ephemeral_signer_ix_data(
            allowed_actions=0xFF, expiry_seconds=0xFFFFFFFFFFFFFFFF,
        )
        assert data[2:10] == b"\xff" * 8

    def test_negative_expiry_rejected(self):
        from src import agent_wallet
        with pytest.raises(ValueError):
            agent_wallet.build_create_ephemeral_signer_ix_data(
                allowed_actions=0, expiry_seconds=-1,
            )

    def test_allowed_actions_out_of_range(self):
        from src import agent_wallet
        with pytest.raises(ValueError):
            agent_wallet.build_create_ephemeral_signer_ix_data(
                allowed_actions=256, expiry_seconds=60,
            )


class TestIxAccounts:
    """Account ordering matches agent_access.rs:
      0. owner (signer)
      1. UniversalVault
      2. EphemeralSigner PDA (writable — allocated)
      3. AgentGrant pubkey
      4. System Program"""

    def test_account_order(self, monkeypatch):
        from src import agent_wallet, mpp_onchain
        from cryptography.hazmat.primitives.asymmetric.ed25519 import (
            Ed25519PrivateKey,
        )
        from cryptography.hazmat.primitives import serialization

        seed = bytes(range(32))
        priv = Ed25519PrivateKey.from_private_bytes(seed)
        pub = priv.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        secret = seed + pub
        b58 = (
            mpp_onchain._base58.b58encode(secret).decode()  # type: ignore[union-attr]
            if mpp_onchain._HAS_BASE58
            else mpp_onchain._b58encode_pure(secret)
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

        owner = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x10")
        agent = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x11")
        eph_pda = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x12")

        ix = agent_wallet.build_create_ephemeral_signer_ix(
            config=cfg,
            owner_pubkey=owner,
            agent_pubkey=agent,
            ephemeral_signer_pda=eph_pda,
            allowed_actions=agent_wallet.AllowedActions.PAY_AND_PROXY,
            expiry_seconds=3600,
        )

        assert len(ix.accounts) == 5
        # 0: owner is signer (NOT writable)
        assert ix.accounts[0].pubkey == owner
        assert ix.accounts[0].is_signer is True
        assert ix.accounts[0].is_writable is False
        # 1: vault read
        assert ix.accounts[1].pubkey == cfg.vault_pda
        assert ix.accounts[1].is_signer is False
        # 2: ephemeral signer PDA writable
        assert ix.accounts[2].pubkey == eph_pda
        assert ix.accounts[2].is_writable is True
        # 3: agent grant pubkey read
        assert ix.accounts[3].pubkey == agent
        # 4: System Program
        assert ix.accounts[4].pubkey == mpp_onchain.SYSTEM_PROGRAM_ID

        # Single signer.
        assert sum(1 for a in ix.accounts if a.is_signer) == 1
        # Program id = keyshield deploy.
        assert ix.program_id == cfg.keyshield_program_id
        # Data: 10 bytes total
        assert len(ix.data) == 10
        assert ix.data[0] == 0x17

    def test_no_vault_pda_raises(self, monkeypatch):
        from src import agent_wallet, mpp_onchain
        # Strip vault PDA env even though others set
        for var in ("KS_MPP_SETTLER_KEY", "KS_PLATFORM_USDC_ATA",
                    "KS_KEYSHIELD_PROGRAM_ID", "KS_VAULT_PDA"):
            monkeypatch.delenv(var, raising=False)
        cfg = mpp_onchain.MppConfig(
            secret_key=b"\x00" * 64,
            settler_pubkey="11111111111111111111111111111111",
            platform_usdc_ata="11111111111111111111111111111111",
            keyshield_program_id="11111111111111111111111111111111",
            usdc_mint="11111111111111111111111111111111",
            vault_pda=None,
            rpc_url="https://api.devnet.solana.com",
        )
        with pytest.raises(ValueError, match="vault_pda is required"):
            agent_wallet.build_create_ephemeral_signer_ix(
                config=cfg,
                owner_pubkey="11111111111111111111111111111111",
                agent_pubkey="11111111111111111111111111111111",
                ephemeral_signer_pda="11111111111111111111111111111111",
                allowed_actions=0x05,
                expiry_seconds=60,
            )


class TestAllowedActionsConstants:
    def test_bitmap_independence(self):
        from src import agent_wallet as aw
        assert aw.AllowedActions.PAY_X402 == 0x01
        assert aw.AllowedActions.MPP_RECORD == 0x02
        assert aw.AllowedActions.PROXY_CALL == 0x04
        assert aw.AllowedActions.READ_VAULT == 0x08
        assert aw.AllowedActions.ALL == 0x0F
        assert aw.AllowedActions.PAY_AND_PROXY == 0x05
