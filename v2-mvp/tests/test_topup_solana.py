"""
End-to-end tests for the Solana on-chain topup pipeline:

  GET  /billing/sol-quote          → Pyth-priced quote
  POST /billing/topup-solana       → SOL native transfer + verify + credit
  POST /billing/topup-solana-usdc  → USDC SPL transfer + verify + credit
  GET  /billing/topup-history      → list of credited topups

The Solana RPC (`getTransaction`) and Pyth Hermes price calls are
mocked at the `billing_solana.{get_transaction, fetch_sol_usd_price}`
boundary, so we don't hit real networks. The verification logic
itself runs end-to-end against synthetic jsonParsed responses.
"""

import pytest
from pathlib import Path


@pytest.fixture(autouse=True)
def isolate_dbs(tmp_path, monkeypatch):
    from src import vault as vault_mod
    from src import session as session_mod
    from src import agents as agents_mod
    from src import usage as usage_mod
    from src import server as server_mod

    monkeypatch.setattr(vault_mod, "VAULT_DIR", Path(tmp_path / "vault"))
    monkeypatch.setattr(session_mod, "DB_PATH", Path(tmp_path / "sessions.db"))
    monkeypatch.setattr(agents_mod, "DB_PATH", Path(tmp_path / "data" / "agents.db"))
    monkeypatch.setattr(usage_mod, "DB_PATH", Path(tmp_path / "data" / "usage.db"))
    # Configurable receiver — easier than literal env-var setup.
    monkeypatch.setattr(
        server_mod, "PAYMENT_ADDRESS_SOLANA",
        "kSh1eLDPaymentReceiver11111111111111111111",
    )
    yield


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from src import server

    server._NONCES.clear()
    server._CACHE.clear()
    return TestClient(server.app)


def _login(client, wallet_address: str = "WALLetUser1111111111111111111111111111111"):
    """v2-mvp /auth/login is the lightest path to get a Bearer token —
    we don't need the wallet-signature flow to exercise topup, since
    `sess["user_id"]` is populated either way and that's what the topup
    handler reads."""
    r = client.post(
        "/auth/login",
        json={"userId": wallet_address, "password": "p"},
    )
    return r.json()["token"], wallet_address


def _auth(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


# ─── Pyth quote ────────────────────────────────────────────────────────────


class TestSolQuote:
    def test_returns_quote_at_pyth_price(self, client, monkeypatch):
        from src import billing_solana as bsol

        async def fake_price(**kwargs):
            return bsol.SolUsdPrice(
                price_usd=160.0, publish_time=1_700_000_000, confidence_usd=0.5,
            )

        monkeypatch.setattr(bsol, "fetch_sol_usd_price", fake_price)

        r = client.get("/billing/sol-quote?amount_usd=1.6")
        assert r.status_code == 200
        body = r.json()
        # 1.6 USD / 160 USD/SOL = 0.01 SOL = 10_000_000 lamports
        assert body["amount_lamports"] == 10_000_000
        assert body["sol_usd_price"] == 160.0
        assert body["payment_address"] == "kSh1eLDPaymentReceiver11111111111111111111"
        assert body["valid_for_secs"] == 60

    def test_rejects_zero_or_negative(self, client):
        for bad in (0, -1.0):
            r = client.get(f"/billing/sol-quote?amount_usd={bad}")
            assert r.status_code == 400

    def test_rejects_over_10(self, client):
        r = client.get("/billing/sol-quote?amount_usd=11")
        assert r.status_code == 400

    def test_502_when_oracle_dies(self, client, monkeypatch):
        from src import billing_solana as bsol

        async def boom(**kwargs):
            raise bsol.PaymentVerificationError("hermes 503")

        monkeypatch.setattr(bsol, "fetch_sol_usd_price", boom)
        r = client.get("/billing/sol-quote?amount_usd=1")
        assert r.status_code == 502


# ─── helpers for synthesizing tx responses ─────────────────────────────────


def _sol_transfer_tx(sender: str, recipient: str, lamports: int) -> dict:
    """Synthesize a getTransaction(jsonParsed) result for a successful
    SystemProgram.transfer."""
    return {
        "blockTime": 1_700_000_000,
        "slot": 100,
        "meta": {"err": None, "fee": 5000},
        "transaction": {
            "message": {
                "accountKeys": [
                    {"pubkey": sender, "signer": True, "writable": True},
                    {"pubkey": recipient, "signer": False, "writable": True},
                    {"pubkey": "11111111111111111111111111111111",
                     "signer": False, "writable": False},
                ],
                "instructions": [
                    {
                        "programId": "11111111111111111111111111111111",
                        "program": "system",
                        "parsed": {
                            "type": "transfer",
                            "info": {
                                "source": sender,
                                "destination": recipient,
                                "lamports": lamports,
                            },
                        },
                    }
                ],
            },
            "signatures": ["sigA"],
        },
    }


def _usdc_transfer_checked_tx(
    sender_authority: str,
    sender_ata: str,
    recipient_ata: str,
    recipient_owner: str,
    atoms: int,
    *,
    mint: str,
) -> dict:
    return {
        "blockTime": 1_700_000_000,
        "slot": 100,
        "meta": {
            "err": None,
            "fee": 5000,
            "postTokenBalances": [
                {
                    "accountIndex": 0,
                    "mint": mint,
                    "owner": sender_authority,
                    "uiTokenAmount": {"amount": "0", "decimals": 6},
                },
                {
                    "accountIndex": 1,
                    "mint": mint,
                    "owner": recipient_owner,
                    "uiTokenAmount": {"amount": str(atoms), "decimals": 6},
                },
            ],
        },
        "transaction": {
            "message": {
                "accountKeys": [
                    {"pubkey": sender_ata, "signer": False, "writable": True},
                    {"pubkey": recipient_ata, "signer": False, "writable": True},
                    {"pubkey": sender_authority, "signer": True, "writable": True},
                    {"pubkey": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                     "signer": False, "writable": False},
                ],
                "instructions": [
                    {
                        "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                        "program": "spl-token",
                        "parsed": {
                            "type": "transferChecked",
                            "info": {
                                "source": sender_ata,
                                "destination": recipient_ata,
                                "authority": sender_authority,
                                "mint": mint,
                                "tokenAmount": {
                                    "amount": str(atoms), "decimals": 6,
                                },
                            },
                        },
                    }
                ],
            },
            "signatures": ["sigB"],
        },
    }


def _patch_tx(monkeypatch, tx_or_none):
    from src import billing_solana as bsol

    async def fake_get_transaction(rpc_url, tx_signature, **kwargs):
        return tx_or_none

    monkeypatch.setattr(bsol, "get_transaction", fake_get_transaction)


def _patch_price(monkeypatch, usd: float):
    from src import billing_solana as bsol

    async def fake(**kwargs):
        return bsol.SolUsdPrice(
            price_usd=usd, publish_time=1_700_000_000, confidence_usd=0.0,
        )

    monkeypatch.setattr(bsol, "fetch_sol_usd_price", fake)


# ─── /billing/topup-solana (SOL native) ────────────────────────────────────


class TestTopupSolana:
    def test_requires_bearer(self, client):
        r = client.post(
            "/billing/topup-solana",
            json={"tx_signature": "x"},
        )
        assert r.status_code == 401

    def test_404_when_tx_not_found(self, client, monkeypatch):
        token, _ = _login(client)
        _patch_tx(monkeypatch, None)
        r = client.post(
            "/billing/topup-solana",
            headers=_auth(token),
            json={"tx_signature": "missing"},
        )
        assert r.status_code == 404

    def test_400_when_tx_did_not_send_to_payment_address(self, client, monkeypatch):
        token, sender = _login(client)
        # Send to wrong recipient.
        tx = _sol_transfer_tx(sender, "wrong-recipient-XXXXXXXXXXXXXXXXXXXXXX", 1_000)
        _patch_tx(monkeypatch, tx)
        _patch_price(monkeypatch, 100.0)
        r = client.post(
            "/billing/topup-solana",
            headers=_auth(token),
            json={"tx_signature": "abc"},
        )
        assert r.status_code == 400
        assert "no SystemProgram.transfer" in r.json()["detail"]

    def test_400_when_tx_sent_from_different_wallet(self, client, monkeypatch):
        from src import server

        token, alice = _login(client, "AliceWallet111111111111111111111111111111")
        # Tx is FROM bob, not alice.
        tx = _sol_transfer_tx(
            "BobsImpostor111111111111111111111111111111",
            server.PAYMENT_ADDRESS_SOLANA, 10_000_000,
        )
        _patch_tx(monkeypatch, tx)
        _patch_price(monkeypatch, 100.0)
        r = client.post(
            "/billing/topup-solana",
            headers=_auth(token),
            json={"tx_signature": "abc"},
        )
        assert r.status_code == 400

    def test_400_when_tx_reverted(self, client, monkeypatch):
        from src import server

        token, sender = _login(client)
        tx = _sol_transfer_tx(sender, server.PAYMENT_ADDRESS_SOLANA, 10_000_000)
        tx["meta"]["err"] = {"InstructionError": [0, "Custom"]}
        _patch_tx(monkeypatch, tx)
        _patch_price(monkeypatch, 100.0)
        r = client.post(
            "/billing/topup-solana",
            headers=_auth(token),
            json={"tx_signature": "abc"},
        )
        assert r.status_code == 400
        assert "reverted" in r.json()["detail"]

    def test_happy_path_credits_and_returns_balance(self, client, monkeypatch):
        from src import server, usage

        token, sender = _login(client)
        # 0.05 SOL → 50_000_000 lamports → at $100/SOL = $5.00
        lamports = 50_000_000
        tx = _sol_transfer_tx(sender, server.PAYMENT_ADDRESS_SOLANA, lamports)
        _patch_tx(monkeypatch, tx)
        _patch_price(monkeypatch, 100.0)

        before = usage.get_balance(sender)
        r = client.post(
            "/billing/topup-solana",
            headers=_auth(token),
            json={"tx_signature": "sig-happy"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["credited_atoms"] == lamports
        assert body["credited_unit"] == "lamports"
        assert body["credited_usd"] == 5.0
        assert body["sol_usd_price"] == 100.0

        after = usage.get_balance(sender)
        assert pytest.approx(after - before, rel=1e-6) == 5.0

    def test_idempotent_double_credit_returns_409(self, client, monkeypatch):
        from src import server

        token, sender = _login(client)
        tx = _sol_transfer_tx(sender, server.PAYMENT_ADDRESS_SOLANA, 10_000_000)
        _patch_tx(monkeypatch, tx)
        _patch_price(monkeypatch, 100.0)

        r1 = client.post(
            "/billing/topup-solana",
            headers=_auth(token),
            json={"tx_signature": "sig-replay"},
        )
        assert r1.status_code == 200

        r2 = client.post(
            "/billing/topup-solana",
            headers=_auth(token),
            json={"tx_signature": "sig-replay"},
        )
        assert r2.status_code == 409
        assert "already credited" in r2.json()["detail"]

    def test_slippage_check_rejects_wildly_off_quote(self, client, monkeypatch):
        from src import server

        token, sender = _login(client)
        tx = _sol_transfer_tx(sender, server.PAYMENT_ADDRESS_SOLANA, 10_000_000)
        _patch_tx(monkeypatch, tx)
        _patch_price(monkeypatch, 100.0)  # observed: $1.00

        r = client.post(
            "/billing/topup-solana",
            headers=_auth(token),
            json={"tx_signature": "abc", "expected_amount_usd": 5.0},  # claimed: $5
        )
        assert r.status_code == 400
        assert "slippage" in r.json()["detail"]

    def test_slippage_check_accepts_within_tolerance(self, client, monkeypatch):
        from src import server

        token, sender = _login(client)
        # Claim $1.00, observe $1.04 (4% slippage, default tolerance is 5%)
        # 0.01 SOL at $104 = $1.04
        tx = _sol_transfer_tx(sender, server.PAYMENT_ADDRESS_SOLANA, 10_000_000)
        _patch_tx(monkeypatch, tx)
        _patch_price(monkeypatch, 104.0)

        r = client.post(
            "/billing/topup-solana",
            headers=_auth(token),
            json={"tx_signature": "abc", "expected_amount_usd": 1.0},
        )
        assert r.status_code == 200


# ─── /billing/topup-solana-usdc ────────────────────────────────────────────


class TestTopupSolanaUsdc:
    def test_requires_bearer(self, client):
        r = client.post(
            "/billing/topup-solana-usdc",
            json={"tx_signature": "x"},
        )
        assert r.status_code == 401

    def test_happy_path_mainnet_usdc(self, client, monkeypatch):
        from src import server, billing_solana as bsol, usage

        token, sender = _login(client)
        atoms = 5_000_000  # 5.00 USDC (6 decimals)

        tx = _usdc_transfer_checked_tx(
            sender_authority=sender,
            sender_ata="senderATA1111111111111111111111111111111",
            recipient_ata="recipATA1111111111111111111111111111111",
            recipient_owner=server.PAYMENT_ADDRESS_SOLANA,
            atoms=atoms,
            mint=bsol.USDC_MINT_MAINNET,
        )
        _patch_tx(monkeypatch, tx)

        before = usage.get_balance(sender)
        r = client.post(
            "/billing/topup-solana-usdc",
            headers=_auth(token),
            json={"tx_signature": "sigUSDC"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["credited_atoms"] == atoms
        assert body["credited_usd"] == 5.0
        assert pytest.approx(usage.get_balance(sender) - before, rel=1e-6) == 5.0

    def test_devnet_usdc_uses_devnet_mint(self, client, monkeypatch):
        from src import server, billing_solana as bsol

        token, sender = _login(client)

        # Submit a tx using mainnet mint but ask for devnet — should NOT match.
        tx_mainnet = _usdc_transfer_checked_tx(
            sender_authority=sender,
            sender_ata="aATA",
            recipient_ata="bATA",
            recipient_owner=server.PAYMENT_ADDRESS_SOLANA,
            atoms=5_000_000,
            mint=bsol.USDC_MINT_MAINNET,
        )
        _patch_tx(monkeypatch, tx_mainnet)

        r = client.post(
            "/billing/topup-solana-usdc",
            headers=_auth(token),
            json={"tx_signature": "sigD", "network": "devnet"},
        )
        assert r.status_code == 400  # no devnet-mint USDC transfer found

    def test_usdc_idempotent(self, client, monkeypatch):
        from src import server, billing_solana as bsol

        token, sender = _login(client)
        tx = _usdc_transfer_checked_tx(
            sender_authority=sender,
            sender_ata="aATA",
            recipient_ata="bATA",
            recipient_owner=server.PAYMENT_ADDRESS_SOLANA,
            atoms=2_000_000,
            mint=bsol.USDC_MINT_MAINNET,
        )
        _patch_tx(monkeypatch, tx)

        r1 = client.post(
            "/billing/topup-solana-usdc",
            headers=_auth(token),
            json={"tx_signature": "sigUSDCdup"},
        )
        assert r1.status_code == 200

        r2 = client.post(
            "/billing/topup-solana-usdc",
            headers=_auth(token),
            json={"tx_signature": "sigUSDCdup"},
        )
        assert r2.status_code == 409


# ─── /billing/topup-history ────────────────────────────────────────────────


class TestTopupHistory:
    def test_requires_bearer(self, client):
        assert client.get("/billing/topup-history").status_code == 401

    def test_returns_credited_topups(self, client, monkeypatch):
        from src import server, billing_solana as bsol

        token, sender = _login(client)

        # Credit 1 SOL topup + 1 USDC topup.
        tx_sol = _sol_transfer_tx(sender, server.PAYMENT_ADDRESS_SOLANA, 10_000_000)
        _patch_tx(monkeypatch, tx_sol)
        _patch_price(monkeypatch, 100.0)
        client.post(
            "/billing/topup-solana",
            headers=_auth(token),
            json={"tx_signature": "sigSOL1"},
        )

        tx_usdc = _usdc_transfer_checked_tx(
            sender_authority=sender,
            sender_ata="a",
            recipient_ata="b",
            recipient_owner=server.PAYMENT_ADDRESS_SOLANA,
            atoms=3_000_000,
            mint=bsol.USDC_MINT_MAINNET,
        )
        _patch_tx(monkeypatch, tx_usdc)
        client.post(
            "/billing/topup-solana-usdc",
            headers=_auth(token),
            json={"tx_signature": "sigUSDC1"},
        )

        r = client.get("/billing/topup-history", headers=_auth(token))
        assert r.status_code == 200
        topups = r.json()["topups"]
        assert len(topups) == 2
        assets = {t["asset"] for t in topups}
        assert assets == {"SOL", "USDC"}
        for t in topups:
            assert t["chain"] == "solana"
            assert "tx_signature" in t

    def test_per_user_isolation(self, client, monkeypatch):
        from src import server

        a_token, alice = _login(client, "AliceTopup1111111111111111111111111111111")
        b_token, _bob = _login(client, "BobTopup11111111111111111111111111111111")

        tx = _sol_transfer_tx(alice, server.PAYMENT_ADDRESS_SOLANA, 10_000_000)
        _patch_tx(monkeypatch, tx)
        _patch_price(monkeypatch, 100.0)

        client.post(
            "/billing/topup-solana",
            headers=_auth(a_token),
            json={"tx_signature": "alice-sig"},
        )
        a_history = client.get("/billing/topup-history", headers=_auth(a_token)).json()["topups"]
        b_history = client.get("/billing/topup-history", headers=_auth(b_token)).json()["topups"]
        assert len(a_history) == 1
        assert len(b_history) == 0


# ─── billing_solana module unit tests ──────────────────────────────────────


class TestBillingSolanaModule:
    def test_find_sol_transfer_returns_lamports(self):
        from src import billing_solana as bsol

        tx = _sol_transfer_tx("alice", "vault", 12345)
        assert bsol.find_sol_transfer(tx, "alice", "vault") == 12345

    def test_find_sol_transfer_raises_on_no_match(self):
        from src import billing_solana as bsol

        tx = _sol_transfer_tx("alice", "wrong-vault", 12345)
        with pytest.raises(bsol.PaymentVerificationError):
            bsol.find_sol_transfer(tx, "alice", "expected-vault")

    def test_find_sol_transfer_raises_on_reverted_tx(self):
        from src import billing_solana as bsol

        tx = _sol_transfer_tx("alice", "vault", 12345)
        tx["meta"]["err"] = "any-error"
        with pytest.raises(bsol.PaymentVerificationError, match="reverted"):
            bsol.find_sol_transfer(tx, "alice", "vault")

    def test_find_sol_transfer_raises_on_missing_tx(self):
        from src import billing_solana as bsol

        with pytest.raises(bsol.PaymentVerificationError, match="not found"):
            bsol.find_sol_transfer(None, "alice", "vault")

    def test_find_usdc_transfer_returns_atoms(self):
        from src import billing_solana as bsol

        tx = _usdc_transfer_checked_tx(
            sender_authority="alice", sender_ata="a", recipient_ata="b",
            recipient_owner="vault", atoms=5_000_000,
            mint=bsol.USDC_MINT_MAINNET,
        )
        assert bsol.find_usdc_transfer(
            tx, "alice", "vault", usdc_mint=bsol.USDC_MINT_MAINNET,
        ) == 5_000_000

    def test_find_usdc_transfer_rejects_wrong_mint(self):
        from src import billing_solana as bsol

        tx = _usdc_transfer_checked_tx(
            sender_authority="alice", sender_ata="a", recipient_ata="b",
            recipient_owner="vault", atoms=5_000_000,
            mint="SOMERANDOMMINT11111111111111111111111111111",
        )
        with pytest.raises(bsol.PaymentVerificationError):
            bsol.find_usdc_transfer(
                tx, "alice", "vault", usdc_mint=bsol.USDC_MINT_MAINNET,
            )

    @pytest.mark.anyio
    async def test_fetch_sol_usd_price_parses_pyth_response(self):
        from src import billing_solana as bsol

        class FakeResp:
            def __init__(self, body, status=200):
                self._body = body
                self.status_code = status

            def json(self):
                return self._body

        async def fake_fetch(method, url, params=None, body=None):
            return FakeResp({
                "parsed": [{
                    "id": bsol.PYTH_SOL_USD_FEED,
                    "price": {
                        "price": "16025000000",  # 160.25
                        "expo": -8,
                        "conf": "10000000",
                        "publish_time": 1_700_000_000,
                    },
                }],
            })

        result = await bsol.fetch_sol_usd_price(fetch_impl=fake_fetch)
        assert pytest.approx(result.price_usd, rel=1e-6) == 160.25
        assert result.publish_time == 1_700_000_000

    @pytest.mark.anyio
    async def test_fetch_sol_usd_price_raises_on_http_error(self):
        from src import billing_solana as bsol

        class FakeResp:
            status_code = 503

            def json(self):
                return {}

        async def fake_fetch(method, url, params=None, body=None):
            return FakeResp()

        with pytest.raises(bsol.PaymentVerificationError, match="503"):
            await bsol.fetch_sol_usd_price(fetch_impl=fake_fetch)
