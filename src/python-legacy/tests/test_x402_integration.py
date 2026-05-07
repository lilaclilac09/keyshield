"""
End-to-end integration test for x402_verify against a local anvil
fork of Base mainnet.

Anvil (https://book.getfoundry.sh/anvil/) is foundry's local Ethereum
node. With `--fork-url`, it makes a forked copy of Base mainnet
available on `http://127.0.0.1:8545` — including the live USDC
contract state — but signed transactions stay on the local fork.
That means we can exercise the real `_verify_on_chain_real` flow
(eth_getTransactionReceipt + eth_blockNumber + ERC-20 Transfer log
decode) against a real RPC implementation without needing a Base
mainnet wallet, gas, or testnet faucet.

## Running this test

```sh
# 1. Install foundry if you don't have it.
curl -L https://foundry.paradigm.xyz | bash
foundryup

# 2. Start anvil forked at Base mainnet. Pin the block so the test
#    is deterministic across re-runs.
anvil --fork-url https://mainnet.base.org \
      --fork-block-number 24000000 \
      --port 8545 \
      --no-mining \
      --silent &

# 3. Run the integration test (pytest auto-detects anvil and skips
#    if absent).
cd v2-mvp && .venv/bin/python -m pytest \
    tests/test_x402_integration.py -v
```

If anvil is not running on port 8545, every test in this file is
skipped via `pytest.mark.skipif`. Module load is dependency-free —
imports `httpx` lazily inside `_anvil_alive()` so collection works
even when httpx isn't installed (it is in v2-mvp deps, but the
defensive guard keeps CI happy on a fresh checkout).

## What gets verified

* Happy path: send USDC from an impersonated whale to the platform
  receiver, mine a block, run `verify_on_chain`, assert
  `(verified=True, mode="real")`.
* Wrong-receiver path: same tx but pass a different platform
  receiver in the config → `VerifyError("no matching")`.
* Insufficient-amount path: transfer below the expected threshold
  → `VerifyError("amount")`.

## Why a real RPC fixture instead of httpx mocks

The pure-data unit tests in `tests/test_x402_verify.py::TestTransferLogDecode`
already exercise the log-decode branch with synthetic JSON. The
purpose of *this* file is to catch integration drift the unit tests
miss: JSON-RPC field encoding mismatches, hex padding subtleties on
the topic / data fields, off-by-one on min_confirmations, etc. A
real anvil node produces the same exact wire format the LE / RPC
provider would, so we know `_verify_on_chain_real` survives a
real RPC interaction.

## Anvil-specific helpers used

* `anvil_impersonateAccount` — lets us forge a `from` address
  without a private key, so we can transfer USDC from a known
  whale (Base USDC's largest holder is the Base bridge contract).
* `anvil_mine` — manually mines blocks so confirmations math is
  deterministic.
* `eth_sendTransaction` — anvil signs with the impersonated
  account's "fake" key.
"""

from __future__ import annotations

import os
import socket
from typing import Optional

import pytest


# ─── env / availability gate ──────────────────────────────────────────

ANVIL_HOST = os.environ.get("KS_TEST_ANVIL_HOST", "127.0.0.1")
ANVIL_PORT = int(os.environ.get("KS_TEST_ANVIL_PORT", "8545"))
ANVIL_RPC = f"http://{ANVIL_HOST}:{ANVIL_PORT}"

# USDC on Base mainnet (Coinbase issuer). Fork captures the current
# state including totalSupply + holders.
USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

# The Base bridge contract is one of the largest USDC holders on
# Base mainnet. Impersonating it lets us transfer arbitrary USDC
# to test wallets without needing a faucet.
USDC_WHALE = "0x4200000000000000000000000000000000000010"

# Test-only platform receiver addresses. Must be 40-hex 0x-prefixed.
PLATFORM_RECEIVER = "0x" + "11" * 20  # 0x111...111
WRONG_RECEIVER    = "0x" + "22" * 20

# ERC-20 `transfer(address,uint256)` selector (first 4 bytes of
# keccak256("transfer(address,uint256)")).
ERC20_TRANSFER_SELECTOR = "0xa9059cbb"


def _anvil_alive() -> bool:
    """Cheap port-probe before importing httpx — keeps `pytest --collect-only`
    fast on machines without anvil running."""
    try:
        with socket.create_connection((ANVIL_HOST, ANVIL_PORT), timeout=0.5):
            return True
    except OSError:
        return False


# Skip the entire module when anvil isn't running. This is the cheapest
# way to honor the "275 still pass + 1 skipif" acceptance criterion.
pytestmark = pytest.mark.skipif(
    not _anvil_alive(),
    reason=(
        f"anvil not running on {ANVIL_RPC} — start with "
        f"`anvil --fork-url https://mainnet.base.org --port {ANVIL_PORT}`"
    ),
)


# ─── DB / env isolation (mirrors test_x402_verify.py) ─────────────────


@pytest.fixture(autouse=True)
def isolate_db(tmp_path, monkeypatch):
    """Each test gets its own x402.db so idempotency rows don't bleed."""
    from pathlib import Path
    from src import x402_verify as x402_mod

    monkeypatch.setattr(x402_mod, "DB_PATH", Path(tmp_path / "data" / "x402.db"))
    x402_mod._WARNED_ENV_MISSING = False
    yield


@pytest.fixture(autouse=True)
def clean_x402_env(monkeypatch):
    """Always start with a clean env so config loading is predictable."""
    for var in (
        "KS_X402_BASE_RPC_URL",
        "KS_X402_RECEIVER_ADDRESS",
        "KS_X402_USDC_ADDRESS",
        "KS_X402_MIN_CONFIRMATIONS",
        "KS_X402_VERIFY_REQUIRED",
    ):
        monkeypatch.delenv(var, raising=False)
    yield


# ─── anvil helpers ────────────────────────────────────────────────────


async def _rpc(client, method: str, params: list) -> dict:
    """Thin JSON-RPC wrapper. Returns the parsed body; raises on RPC
    error rather than silently passing it through."""
    r = await client.post(
        ANVIL_RPC,
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
    )
    r.raise_for_status()
    body = r.json()
    if "error" in body:
        raise RuntimeError(f"{method} returned RPC error: {body['error']}")
    return body


def _encode_transfer_calldata(to_addr: str, amount_micros: int) -> str:
    """ABI-encode `transfer(address,uint256)` calldata. No web3 dep —
    the encoding is fixed: 4-byte selector || 32-byte address ||
    32-byte amount, all hex-concatenated."""
    if not to_addr.startswith("0x") or len(to_addr) != 42:
        raise ValueError(f"bad address: {to_addr!r}")
    addr_padded   = to_addr[2:].rjust(64, "0")
    amount_padded = format(amount_micros, "064x")
    return ERC20_TRANSFER_SELECTOR + addr_padded + amount_padded


async def _send_usdc_transfer(
    client,
    *,
    from_addr: str,
    to_addr: str,
    amount_usd: float,
) -> str:
    """Impersonate `from_addr`, send a USDC transfer, mine 1 block,
    return the tx hash. Caller is responsible for mining additional
    blocks if `min_confirmations > 0`."""
    # 1. Impersonate the whale (anvil-only RPC)
    await _rpc(client, "anvil_impersonateAccount", [from_addr])

    # 2. Top up the whale's ETH balance for gas. anvil_setBalance
    #    takes a hex-encoded wei amount — 1 ETH = 0xde0b6b3a7640000.
    await _rpc(client, "anvil_setBalance", [from_addr, "0xde0b6b3a7640000"])

    # 3. Build + send the transfer
    micros = int(round(amount_usd * 1_000_000))
    calldata = _encode_transfer_calldata(to_addr, micros)
    tx_resp = await _rpc(
        client,
        "eth_sendTransaction",
        [{
            "from":  from_addr,
            "to":    USDC_BASE,
            "data":  calldata,
            # Generous gas — USDC transfer is ~50k but anvil's
            # estimator can spike on cold-load.
            "gas":   "0x30d40",  # 200_000
        }],
    )
    tx_hash = tx_resp["result"]
    if not (isinstance(tx_hash, str) and tx_hash.startswith("0x")):
        raise RuntimeError(f"unexpected tx hash shape: {tx_hash!r}")

    # 4. Mine 1 block so the tx is included.
    await _rpc(client, "anvil_mine", ["0x1"])

    # 5. Stop impersonating (good hygiene; anvil will auto-clear on
    #    next RPC anyway).
    await _rpc(client, "anvil_stopImpersonatingAccount", [from_addr])

    return tx_hash


def _make_config(
    receiver: str,
    *,
    min_confirmations: int = 0,
    rpc_url: Optional[str] = None,
) -> "X402Config":
    from src import x402_verify

    return x402_verify.X402Config(
        rpc_url=rpc_url or ANVIL_RPC,
        receiver_address=receiver.lower(),
        usdc_address=USDC_BASE.lower(),
        min_confirmations=min_confirmations,
        verify_required=True,
    )


# ─── tests ────────────────────────────────────────────────────────────


class TestX402AnvilHappyPath:
    """End-to-end success: send USDC, verify, expect (True, "real")."""

    def test_verifies_real_usdc_transfer(self):
        import asyncio
        import httpx
        from src import x402_verify

        async def go():
            async with httpx.AsyncClient(timeout=15) as client:
                tx_hash = await _send_usdc_transfer(
                    client,
                    from_addr=USDC_WHALE,
                    to_addr=PLATFORM_RECEIVER,
                    amount_usd=3.0,
                )
            cfg = _make_config(PLATFORM_RECEIVER, min_confirmations=0)
            return await x402_verify.verify_on_chain(cfg, tx_hash, 3.0)

        ok, mode = asyncio.run(go())
        assert ok is True
        assert mode == "real"

    def test_verifies_with_min_confirmations(self):
        """Confirms `min_confirmations > 0` waits for the right block
        delta. We mine extra blocks past the tx so the gap clears the
        threshold."""
        import asyncio
        import httpx
        from src import x402_verify

        async def go():
            async with httpx.AsyncClient(timeout=15) as client:
                tx_hash = await _send_usdc_transfer(
                    client,
                    from_addr=USDC_WHALE,
                    to_addr=PLATFORM_RECEIVER,
                    amount_usd=5.0,
                )
                # Mine 5 more so head - tx_block >= 5.
                await _rpc(client, "anvil_mine", ["0x5"])
            cfg = _make_config(PLATFORM_RECEIVER, min_confirmations=5)
            return await x402_verify.verify_on_chain(cfg, tx_hash, 5.0)

        ok, mode = asyncio.run(go())
        assert ok is True
        assert mode == "real"


class TestX402AnvilFailureCases:
    """Negative paths that must raise VerifyError, not silently
    return True. These are the load-bearing security checks."""

    def test_wrong_receiver_raises_no_matching(self):
        import asyncio
        import httpx
        from src import x402_verify

        async def go():
            async with httpx.AsyncClient(timeout=15) as client:
                tx_hash = await _send_usdc_transfer(
                    client,
                    from_addr=USDC_WHALE,
                    to_addr=PLATFORM_RECEIVER,
                    amount_usd=3.0,
                )
            # Config expects WRONG_RECEIVER but tx went to PLATFORM_RECEIVER.
            cfg = _make_config(WRONG_RECEIVER, min_confirmations=0)
            return await x402_verify.verify_on_chain(cfg, tx_hash, 3.0)

        with pytest.raises(x402_verify.VerifyError, match="no matching"):
            asyncio.run(go())

    def test_amount_below_expected_raises_amount(self):
        import asyncio
        import httpx
        from src import x402_verify

        async def go():
            async with httpx.AsyncClient(timeout=15) as client:
                tx_hash = await _send_usdc_transfer(
                    client,
                    from_addr=USDC_WHALE,
                    to_addr=PLATFORM_RECEIVER,
                    amount_usd=1.0,
                )
            # Tx transferred $1, caller expects $3.
            cfg = _make_config(PLATFORM_RECEIVER, min_confirmations=0)
            return await x402_verify.verify_on_chain(cfg, tx_hash, 3.0)

        with pytest.raises(x402_verify.VerifyError, match="amount"):
            asyncio.run(go())

    def test_insufficient_confirmations_raises(self):
        """min_confirmations=10 against a freshly-mined tx (1
        confirmation) must raise."""
        import asyncio
        import httpx
        from src import x402_verify

        async def go():
            async with httpx.AsyncClient(timeout=15) as client:
                tx_hash = await _send_usdc_transfer(
                    client,
                    from_addr=USDC_WHALE,
                    to_addr=PLATFORM_RECEIVER,
                    amount_usd=2.0,
                )
            cfg = _make_config(PLATFORM_RECEIVER, min_confirmations=10)
            return await x402_verify.verify_on_chain(cfg, tx_hash, 2.0)

        with pytest.raises(x402_verify.VerifyError, match="confirmations"):
            asyncio.run(go())

    def test_unknown_tx_hash_raises(self):
        """Hash not present on the fork → `transaction not found`."""
        import asyncio
        from src import x402_verify

        # Random-looking 32-byte hash that won't ever match.
        bogus = "0x" + "ab" * 32

        cfg = _make_config(PLATFORM_RECEIVER, min_confirmations=0)
        with pytest.raises(x402_verify.VerifyError, match="not found"):
            asyncio.run(x402_verify.verify_on_chain(cfg, bogus, 1.0))


class TestX402AnvilIdempotency:
    """The on-chain verify is non-idempotent on its own — `record_claim`
    is what enforces "credit at most once". This ensures the integration
    composes: a verified tx, recorded once, can't be claimed again even
    by a different user. Same property guarded as test_x402_verify.py
    but the proof is now a real on-chain hash, so we'd catch any
    encoding bug between the verify path and the DB write path."""

    def test_real_verified_proof_is_uniquely_claimable(self):
        import asyncio
        import httpx
        from src import x402_verify

        async def go():
            async with httpx.AsyncClient(timeout=15) as client:
                return await _send_usdc_transfer(
                    client,
                    from_addr=USDC_WHALE,
                    to_addr=PLATFORM_RECEIVER,
                    amount_usd=4.0,
                )

        tx_hash = asyncio.run(go())

        # First credit: succeeds.
        x402_verify.record_claim(tx_hash, "alice", 4.0, "real")
        assert x402_verify.has_claim(tx_hash) is True

        # Second credit (different user, same proof) — must raise.
        with pytest.raises(x402_verify.DuplicateClaim):
            x402_verify.record_claim(tx_hash, "bob", 4.0, "real")
