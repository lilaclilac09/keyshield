"""
Smoke parity for AsyncKeyShield. Same in-process FastAPI app, just driven
through `AsyncClient` + `ASGITransport`.
"""

import pytest
from keyshield import AsyncKeyShield, KeyShieldError


@pytest.mark.asyncio
async def test_async_login_store_list_round_trips(async_transport):
    async with AsyncKeyShield(base_url="http://test", transport=async_transport) as ks:
        await ks.login("alice", "secret")
        assert await ks.list_keys() == []
        await ks.store("openai", "sk-X")
        assert await ks.list_keys() == ["openai"]
        assert await ks.decrypt_key("openai") == "sk-X"


@pytest.mark.asyncio
async def test_async_pricing_round_trip(async_transport):
    async with AsyncKeyShield(base_url="http://test", transport=async_transport) as ks:
        await ks.login("alice", "secret")
        await ks.set_pricing("openai", price_usd=0.002)
        rows = await ks.list_pricing()
        assert rows == [
            {
                "upstream": "openai",
                "price_usd": 0.002,
                "updated_at": rows[0]["updated_at"],
            }
        ]
        await ks.clear_pricing("openai")
        assert await ks.list_pricing() == []


@pytest.mark.asyncio
async def test_async_topup_balance(async_transport):
    async with AsyncKeyShield(base_url="http://test", transport=async_transport) as ks:
        await ks.login("alice", "secret")
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
