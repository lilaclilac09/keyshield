"""
Devnet end-to-end test — exercises the running KeyShield server
against **real Solana devnet**, not a mock.

Skipped by default. Activates only when ALL of these env vars are
exported (typically by sourcing the env block from
`scripts/devnet-setup.sh`):

  - KS_MPP_SETTLER_KEY        — path to the settler keypair JSON
  - KS_KEYSHIELD_PROGRAM_ID   — base58 deployed program id on devnet
  - KS_SOLANA_RPC_URL         — should be https://api.devnet.solana.com
  - KS_USDC_MINT              — devnet USDC mint
  - KS_PLATFORM_USDC_ATA      — platform receiver ATA

Plus the gate flag itself:

  - KS_DEVNET_E2E=1           — opt-in (CI default is OFF)

Set those, then run:

    pytest v2-mvp/tests/test_devnet_e2e.py -v

The test asserts the server's MPP settle / x402 endpoints return
`verified_mode == "real"` (not "stub") and a non-zero
`settled_micro_usdc`. It does NOT mock anything — it talks to live
devnet RPC.

NOTE: This test currently asserts the **expected** post-implementation
behaviour. Until `v2-mvp/src/mpp_onchain.py` ships and the server
actually signs + submits `mpp_settle` ixs against devnet, the test
will FAIL with `verified_mode == "stub"`. That failure mode is the
signal that the on-chain integration hasn't landed yet.
"""

import os

import pytest


_REQUIRED_ENV = (
    "KS_MPP_SETTLER_KEY",
    "KS_KEYSHIELD_PROGRAM_ID",
    "KS_SOLANA_RPC_URL",
    "KS_USDC_MINT",
    "KS_PLATFORM_USDC_ATA",
)


def _devnet_env_set() -> bool:
    """All required env vars must be non-empty AND opt-in flag set."""
    if os.getenv("KS_DEVNET_E2E", "").strip() != "1":
        return False
    return all(os.getenv(v, "").strip() for v in _REQUIRED_ENV)


pytestmark = pytest.mark.skipif(
    not _devnet_env_set(),
    reason=(
        "devnet env not configured — set KS_DEVNET_E2E=1 and source "
        "the block from `scripts/devnet-setup.sh` to enable."
    ),
)


@pytest.fixture
def client():
    """Talks to the in-process FastAPI server. The server itself reads
    the KS_* env vars at request time so we don't need to override
    any module attributes here."""
    from fastapi.testclient import TestClient
    from src import server

    return TestClient(server.app)


def _login(client, user_id: str = "DevnetE2EUser11111111111111111111111111"):
    r = client.post(
        "/auth/login",
        json={"userId": user_id, "password": "p"},
    )
    assert r.status_code == 200, r.text
    return r.json()["token"], user_id


def _auth(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


class TestDevnetMppSettle:
    """The two assertions that prove on-chain settlement is wired up:

       1. `verified_mode == "real"` (not "stub" / "stub-fallback")
       2. `settled_micro_usdc > 0` — i.e. the MPP settle path
          successfully debited USDC from the stream's ATA into the
          platform receiver ATA on devnet.

    The exact endpoints/route paths are TBD — they live behind
    /mpp/* and the server reads KS_KEYSHIELD_PROGRAM_ID + KS_*
    env vars to decide between stub and real mode. This test
    will need to be updated when the routes are finalised."""

    def test_settle_emits_real_verified_mode(self, client):
        token, user_id = _login(client)

        # Open a stream and ingest at least one billable event before
        # calling settle. The exact request bodies are placeholders;
        # they will line up with the server's MPP routes once the
        # on-chain integration ships.
        r = client.post(
            "/mpp/streams",
            headers=_auth(token),
            json={
                "agent_id": "test-agent",
                "max_total_micro_usdc": 1_000_000,
                "cost_per_unit_micro_usdc": 1_500,
                "settlement_interval_secs": 1,
            },
        )
        assert r.status_code in (200, 201), r.text
        stream = r.json()
        stream_id = stream["id"]

        # Ingest a single billable event (15 units — matches the unit
        # tests in test_mpp_routes.py).
        r = client.post(
            f"/mpp/streams/{stream_id}/ingest",
            headers=_auth(token),
            json={"units_consumed": 15, "tokens": 15},
        )
        assert r.status_code == 200, r.text

        # Force a settle.
        r = client.post(
            f"/mpp/streams/{stream_id}/settle",
            headers=_auth(token),
        )
        assert r.status_code == 200, r.text
        body = r.json()

        # The two devnet-mode assertions.
        assert body.get("verified_mode") == "real", (
            f"verified_mode={body.get('verified_mode')!r} — server is still "
            f"in stub-fallback. Check that mpp_onchain.py is loaded and "
            f"KS_KEYSHIELD_PROGRAM_ID is propagated to the server process."
        )
        assert int(body.get("settled_micro_usdc", 0)) > 0, (
            f"settled_micro_usdc={body.get('settled_micro_usdc')!r} — "
            f"on-chain settle didn't actually transfer."
        )
        # Strong signal: a real settlement returns a tx signature.
        assert body.get("tx_signature"), (
            "expected tx_signature on a real-mode settle response"
        )

    def test_x402_pay_returns_real_receipt(self, client):
        """The x402 per-call path also needs to flip to verified_mode=real
        when KS_KEYSHIELD_PROGRAM_ID is set. We just hit a 402-protected
        endpoint and assert the payment receipt is real, not stubbed."""
        token, user_id = _login(client)

        r = client.post(
            "/billing/pay-x402",
            headers=_auth(token),
            json={
                "upstream": "openai",
                "amount_micro_usdc": 10_000,
            },
        )
        # The route may not exist yet — accept either 200 (route exists,
        # check response body) or 404 (route not yet implemented;
        # fail loud so the gap is visible).
        if r.status_code == 404:
            pytest.fail(
                "POST /billing/pay-x402 not implemented — devnet e2e cannot "
                "validate the x402 path. Implement it before claiming "
                "MVP-ready."
            )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("verified_mode") == "real", body
