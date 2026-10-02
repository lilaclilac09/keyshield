"""
Smoke parity for AsyncKeyShield. Same in-process FastAPI app, just driven
through `AsyncClient` + `ASGITransport`.
"""

import pytest
from keyshield import AsyncKeyShield, KeyShieldError


async def _wallet_login(ks, passphrase: str = "secret") -> str:
    pytest.importorskip("nacl.signing")
    import base58
    from nacl.signing import SigningKey

    sk = SigningKey.generate()
    wallet = base58.b58encode(bytes(sk.verify_key)).decode()
    ch = await ks.wallet_challenge()
    sig = sk.sign(ch["challenge"].encode()).signature
    await ks.wallet_login(wallet, sig, ch["challenge"], passphrase)
    return wallet


@pytest.mark.asyncio
async def test_async_wallet_store_list_round_trips(async_transport):
    async with AsyncKeyShield(base_url="http://test", transport=async_transport) as ks:
        await _wallet_login(ks)
        assert await ks.list_keys() == []
        await ks.store("openai", "sk-X")
        assert await ks.list_keys() == ["openai"]
        assert await ks.decrypt_key("openai") == "sk-X"


@pytest.mark.asyncio
async def test_async_topup_balance(async_transport):
    async with AsyncKeyShield(base_url="http://test", transport=async_transport) as ks:
        await _wallet_login(ks)
        before = (await ks.get_balance())["balance_usd"]
        await ks.topup(0.25)
        after = (await ks.get_balance())["balance_usd"]
        assert round(after - before, 6) == 0.25


@pytest.mark.asyncio
async def test_async_authed_without_login_raises(async_transport):
    ks = AsyncKeyShield(base_url="http://test", transport=async_transport)
    with pytest.raises(KeyShieldError) as exc:
        await ks.list_keys()
    assert exc.value.status == 401
    await ks._client.aclose()


@pytest.mark.asyncio
async def test_async_password_login_disabled(async_transport):
    async with AsyncKeyShield(base_url="http://test", transport=async_transport) as ks:
        with pytest.raises(KeyShieldError) as exc:
            await ks.login("alice", "secret")
        assert exc.value.status == 403
