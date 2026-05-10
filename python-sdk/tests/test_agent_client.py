"""
Tests for `AgentKeyShield`. Exercises the full agent self-auth loop:
register pubkey as owner → switch to AgentKeyShield → authenticate →
make a request.

These tests require pynacl (`pip install keyshield[agent]`).
"""

import pytest

pytest.importorskip("nacl.signing")

from keyshield import KeyShield, AgentKeyShield, KeyShieldError, generate_keypair


def _owner_login_and_register(sync_client, agent_pubkey: str) -> str:
    """Owner-side bootstrap. Returns the owner's user_id."""
    with KeyShield(base_url="http://test", client=sync_client) as ks:
        ks.login("alice", "secret")
        ks.agent_register(agent_pubkey, name="bot")
    return "alice"


def test_generate_keypair_returns_hex_and_b58():
    creds = generate_keypair()
    assert len(creds["private_key_hex"]) == 64
    assert isinstance(creds["pubkey_b58"], str)
    assert len(creds["pubkey_b58"]) > 30


def test_agent_authenticate_and_list_keys(sync_client):
    # 1. owner registers agent pubkey
    creds = generate_keypair()
    owner = _owner_login_and_register(sync_client, creds["pubkey_b58"])

    # 2. agent process self-auths
    agent = AgentKeyShield(
        owner_wallet=owner,
        private_key_hex=creds["private_key_hex"],
        vault_passphrase="secret",
        base_url="http://test",
        client=sync_client,
    )
    token = agent.authenticate()
    assert isinstance(token, str) and token

    # 3. authed calls go through; vault lookup uses owner's data
    assert agent.list_keys() == []


def test_agent_pubkey_property_matches_keypair(sync_client):
    creds = generate_keypair()
    agent = AgentKeyShield(
        owner_wallet="alice",
        private_key_hex=creds["private_key_hex"],
        vault_passphrase="secret",
        base_url="http://test",
        client=sync_client,
    )
    assert agent.pubkey_b58 == creds["pubkey_b58"]


def test_agent_authenticate_without_registration_returns_403(sync_client):
    creds = generate_keypair()
    # No owner registration — agent-login must reject.
    agent = AgentKeyShield(
        owner_wallet="alice",
        private_key_hex=creds["private_key_hex"],
        vault_passphrase="secret",
        base_url="http://test",
        client=sync_client,
    )
    with pytest.raises(KeyShieldError) as exc:
        agent.authenticate()
    assert exc.value.status in (401, 403)


def test_agent_missing_inputs_raise_clear_errors(monkeypatch, sync_client):
    monkeypatch.delenv("KS_OWNER_WALLET", raising=False)
    monkeypatch.delenv("KS_AGENT_KEY", raising=False)
    monkeypatch.delenv("KS_VAULT_PASS", raising=False)
    agent = AgentKeyShield(base_url="http://test", client=sync_client)
    with pytest.raises(KeyShieldError) as exc:
        agent.authenticate()
    assert exc.value.status == 400
