"""pay_x402 (ix #25) — byte layout + POST /agents/{id}/wallet/pay_x402.

Spec 10 Phase 10.7: the server-held agent wallet signs the on-chain
micropayment; the tx signature is the x402 payment proof. On-chain
submission is mocked here — devnet e2e lives in the scripts."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

USER = "pay-x402-user"
AGENT_ID = "trading-bot-v1"


# ─── byte layout ───────────────────────────────────────────────────────────


def test_ix_data_layout() -> None:
    from src.backend.agents import agent_wallet

    nonce = bytes(range(16))
    ehash = bytes(range(32))
    data = agent_wallet.build_pay_x402_ix_data(
        amount_micro_usdc=1234,
        nonce=nonce,
        expires_at=1_800_000_000,
        envelope_hash=ehash,
    )
    assert len(data) == 65
    assert data[0] == 25  # discriminator
    assert int.from_bytes(data[1:9], "little") == 1234
    assert data[9:25] == nonce
    assert int.from_bytes(data[25:33], "little", signed=True) == 1_800_000_000
    assert data[33:65] == ehash


def test_ix_data_validation() -> None:
    from src.backend.agents import agent_wallet

    with pytest.raises(ValueError):
        agent_wallet.build_pay_x402_ix_data(0, bytes(16), 0, bytes(32))
    with pytest.raises(ValueError):
        agent_wallet.build_pay_x402_ix_data(1, bytes(15), 0, bytes(32))
    with pytest.raises(ValueError):
        agent_wallet.build_pay_x402_ix_data(1, bytes(16), 0, bytes(31))


def test_envelope_hash_stable_and_key_order_independent() -> None:
    from src.backend.agents import agent_wallet

    a = {"network": "solana-devnet", "amountRequired": 5, "payTo": "abc", "asset": "m", "resource": "/r"}
    b = {"resource": "/r", "asset": "m", "payTo": "abc", "amountRequired": 5, "network": "solana-devnet"}
    assert agent_wallet.canonical_envelope_hash(a) == agent_wallet.canonical_envelope_hash(b)
    c = {**a, "amountRequired": 6}
    assert agent_wallet.canonical_envelope_hash(a) != agent_wallet.canonical_envelope_hash(c)


def test_ix_account_order() -> None:
    from src.backend.agents import agent_wallet
    from src.backend.mpp.mpp_onchain import TOKEN_PROGRAM_ID

    ix = agent_wallet.build_pay_x402_ix(
        program_id="prog",
        vault_pda="vault",
        stream_pda="stream",
        stream_usdc_ata="src-ata",
        recipient_usdc_ata="dst-ata",
        usdc_mint="mint",
        agent_pubkey="agent",
        amount_micro_usdc=1,
        nonce=bytes(16),
        expires_at=1,
        envelope_hash=bytes(32),
    )
    keys = [(a.pubkey, a.is_signer, a.is_writable) for a in ix.accounts]
    assert keys == [
        ("agent", True, False),
        ("vault", False, False),
        ("stream", False, True),
        ("src-ata", False, True),
        ("dst-ata", False, True),
        ("mint", False, False),
        (TOKEN_PROGRAM_ID, False, False),
        ("prog", False, False),
    ]


# ─── route ─────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def isolate_dbs(tmp_path: Path) -> None:
    from src.backend.agents import server_wallet
    from src.backend.mpp import mpp_streams

    server_wallet.DB_PATH = tmp_path / "server_wallets.db"
    mpp_streams.DB_PATH = tmp_path / "mpp.db"


@pytest.fixture()
def onchain_env(monkeypatch: pytest.MonkeyPatch) -> dict:
    """Valid on-chain env config (devnet-shaped, no network use)."""
    from solders.keypair import Keypair
    import base58

    settler = Keypair()
    env = {
        "KS_MPP_SETTLER_KEY": base58.b58encode(bytes(settler)).decode(),
        "KS_PLATFORM_USDC_ATA": "5XkmKe6giGYgEgmiNdnwVJrsQMKEc3HJbvy2ACspAMqG",
        "KS_KEYSHIELD_PROGRAM_ID": "41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j",
        "KS_VAULT_PDA": "Axzwa7otsDGowxQSCcA7YvBpXgDZ2nTerzkRTc5m923M",
        "KS_USDC_MINT": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
        "KS_SOLANA_RPC_URL": "http://mock-rpc.invalid",
    }
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    return env


@pytest.fixture()
def client() -> TestClient:
    from src.backend.app import app

    return TestClient(app)


@pytest.fixture()
def token() -> str:
    from src.backend.auth import session as sess_mod

    return sess_mod.create_token(USER, "pw")


def _envelope(amount: int = 500) -> dict:
    return {
        "envelope": {
            "network": "solana-devnet",
            "amountRequired": amount,
            "payTo": "GHpd6gfZZhQHojxp7y7rQtivbksT7zJhC2Rv4N468Jvi",
            "asset": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
            "resource": "/proxy/openai/v1/chat/completions",
        }
    }


def _create_wallet_and_stream(client: TestClient, token: str) -> str:
    """Server wallet + open stream bound to it. Returns agent pubkey."""
    r = client.post(
        f"/agents/{AGENT_ID}/wallet/create",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    pubkey = r.json()["pubkey"]

    from src.backend.mpp import mpp_streams

    mpp_streams.open_stream(
        user_id=USER,
        agent_pubkey=pubkey,
        agent_name="x402-test",
        upstream="openai",
        rate_per_token=1,
        rate_per_call=0,
        settlement_interval=3600,
        stream_pda="Dit8rnzaH3QikXgyVBRSSg4xdgyTNxfbiaKjTdbqQPD1",
        stream_usdc_ata="GDXBvJDpMUAtdNFhiBhmzZ2fRutCDZzBnEbWDsBR9LQ7",
    )
    return pubkey


def test_pay_requires_auth(client: TestClient) -> None:
    r = client.post(f"/agents/{AGENT_ID}/wallet/pay_x402", json=_envelope())
    assert r.status_code == 401


def test_pay_404_without_server_wallet(client: TestClient, token: str, onchain_env: dict) -> None:
    r = client.post(
        f"/agents/{AGENT_ID}/wallet/pay_x402",
        headers={"Authorization": f"Bearer {token}"},
        json=_envelope(),
    )
    assert r.status_code == 404


def test_pay_409_without_stream(client: TestClient, token: str, onchain_env: dict) -> None:
    r = client.post(
        f"/agents/{AGENT_ID}/wallet/create",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    r = client.post(
        f"/agents/{AGENT_ID}/wallet/pay_x402",
        headers={"Authorization": f"Bearer {token}"},
        json=_envelope(),
    )
    assert r.status_code == 409


def test_pay_402_over_per_call_cap(
    client: TestClient, token: str, onchain_env: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("KS_X402_AGENT_MAX_PER_CALL", "100")
    r = client.post(
        f"/agents/{AGENT_ID}/wallet/pay_x402",
        headers={"Authorization": f"Bearer {token}"},
        json=_envelope(amount=101),
    )
    assert r.status_code == 402


def test_pay_happy_path_mocked_submit(
    client: TestClient, token: str, onchain_env: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    agent_pubkey = _create_wallet_and_stream(client, token)

    captured: dict = {}

    async def _fake_submit(ix, seed, rpc_url):
        captured["ix"] = ix
        captured["seed_len"] = len(seed)
        captured["rpc_url"] = rpc_url
        return "FAKE_SIG_abc123"

    from src.backend.agents import agent_wallet

    monkeypatch.setattr(agent_wallet, "submit_pay_x402", _fake_submit)

    r = client.post(
        f"/agents/{AGENT_ID}/wallet/pay_x402",
        headers={"Authorization": f"Bearer {token}"},
        json=_envelope(amount=500),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["signature"] == "FAKE_SIG_abc123"
    assert body["network"] == "solana-devnet"
    assert body["agentPubkey"] == agent_pubkey
    assert body["streamPda"] == "Dit8rnzaH3QikXgyVBRSSg4xdgyTNxfbiaKjTdbqQPD1"

    ix = captured["ix"]
    assert captured["seed_len"] == 32
    assert ix.data[0] == 25
    assert int.from_bytes(ix.data[1:9], "little") == 500
    # account 0 = agent signer, account 2 = stream PDA
    assert ix.accounts[0].pubkey == agent_pubkey
    assert ix.accounts[2].pubkey == "Dit8rnzaH3QikXgyVBRSSg4xdgyTNxfbiaKjTdbqQPD1"


def test_pay_400_wrong_mint(client: TestClient, token: str, onchain_env: dict) -> None:
    _create_wallet_and_stream(client, token)
    payload = _envelope()
    payload["envelope"]["asset"] = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"  # mainnet mint
    r = client.post(
        f"/agents/{AGENT_ID}/wallet/pay_x402",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    assert r.status_code == 400
