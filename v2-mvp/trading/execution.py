"""
trading/execution.py — 0x swap routing + Titan MEV-protected execution (v2 migration)

Latency budget for a full trade:
  1. 0x quote:          ~100-200ms
  2. AI confirmation:   ~100ms (Groq) / ~3s (Claude)    ← run PARALLEL with quote
  3. Titan submission:  ~50ms  (private mempool bypass)
  4. Block inclusion:   ~12s   (next Ethereum block)

Total to submission: ~200ms  (parallel quote + AI)
Total to confirmation: ~12s + block propagation

0x Protocol:
  - DEX aggregator: splits across Uniswap, Curve, Balancer, etc.
  - Returns: best route, gas estimate, calldata
  - Gasless: can use permit2 so user never holds ETH for gas
  - Multi-chain: Ethereum, Polygon, Arbitrum, Base, Optimism, BSC

Titan Exchange:
  - Private mempool builder on Ethereum
  - Bundles protect against front-running / sandwich attacks
  - Works like Flashbots but optimized for retail flow
  - eth_sendBundle: submit a bundle for next block(s)
  - eth_callBundle: simulate a bundle (no send)
  - Private: your TX never hits the public mempool
"""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass
from typing import Any

import httpx

KS_BASE = "http://localhost:8000"

# ── Data types ────────────────────────────────────────────────────────────────

@dataclass
class SwapQuote:
    """
    Response from 0x /swap/v1/quote.
    Pass `to`, `data`, `value`, `gas` directly to your wallet's sendTransaction.
    """
    buy_token:    str
    sell_token:   str
    buy_amount:   int     # in base units (wei for ETH, lamports for SOL)
    sell_amount:  int
    price:        float   # buy_amount / sell_amount (human readable)
    price_impact: float   # fraction, e.g. 0.003 = 0.3%
    sources:      list[dict]   # DEXes used + their weights
    to:           str     # contract address to call
    data:         str     # calldata
    value:        str     # ETH value (in wei) to send with the TX
    gas:          int     # gas estimate
    gas_price:    str     # gas price in wei
    fetch_ms:     float   # how long the quote took


@dataclass
class BundleResult:
    """Result from Titan bundle submission."""
    bundle_hash: str
    submitted_at: float    # monotonic timestamp
    target_block: int | None
    simulated: bool
    simulation_ok: bool | None
    raw: dict


# ── 0x Execution ──────────────────────────────────────────────────────────────

class ZeroXRouter:
    """
    Get swap quotes from 0x Protocol via KeyShield proxy.
    The 0x API key is stored encrypted in KeyShield — never in your code.

    Quick usage:
      router = ZeroXRouter(ks_token="your_token")
      quote = await router.quote("USDC", "ETH", sell_amount=1_000_000)   # sell 1 USDC
      print(f"Buy {quote.buy_amount} ETH, price impact {quote.price_impact:.2%}")

    Supported chains (pass chain_id):
      1     Ethereum mainnet
      137   Polygon
      42161 Arbitrum One
      8453  Base
      10    Optimism
      56    BNB Chain

    For Solana: use Jupiter aggregator (not 0x).
    """

    # ERC-20 token addresses (Ethereum mainnet)
    TOKEN_ADDRESSES = {
        "ETH":   "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        "WETH":  "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        "USDC":  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "USDT":  "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "DAI":   "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        "WBTC":  "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
        "UNI":   "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
        "AAVE":  "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
        "ARB":   "0x912CE59144191C1204E64559FE8253a0e49E6548",  # on Arbitrum
    }

    def __init__(
        self,
        ks_token: str,
        ks_base: str = KS_BASE,
        chain_id: int = 1,
        slippage: float = 0.005,   # 0.5% default
    ):
        self._token    = ks_token
        self._base     = ks_base.rstrip("/")
        self._chain_id = chain_id
        self._slippage = slippage
        self._client   = httpx.AsyncClient(
            base_url=f"{self._base}/proxy/0x",
            timeout=15,
            headers={"Authorization": f"Bearer {ks_token}"},
        )

    def _resolve_token(self, token: str) -> str:
        """Convert symbol to address, or pass through if already an address."""
        if token.startswith("0x"):
            return token
        addr = self.TOKEN_ADDRESSES.get(token.upper())
        if not addr:
            raise ValueError(f"Unknown token {token!r}. Pass the contract address directly.")
        return addr

    async def quote(
        self,
        sell_token: str,
        buy_token: str,
        sell_amount: int | None = None,
        buy_amount: int | None = None,
        taker_address: str | None = None,
    ) -> SwapQuote:
        """
        Get the best swap route.
        Provide either sell_amount (in base units) or buy_amount, not both.

        sell_amount=1_000_000 with sell_token=USDC means sell 1 USDC (6 decimals).
        """
        if sell_amount is None and buy_amount is None:
            raise ValueError("Provide sell_amount or buy_amount")

        params: dict[str, Any] = {
            "sellToken":   self._resolve_token(sell_token),
            "buyToken":    self._resolve_token(buy_token),
            "slippagePercentage": str(self._slippage),
        }
        if sell_amount is not None:
            params["sellAmount"] = str(sell_amount)
        if buy_amount is not None:
            params["buyAmount"] = str(buy_amount)
        if taker_address:
            params["takerAddress"] = taker_address

        t0 = time.monotonic()
        r = await self._client.get("/swap/v1/quote", params=params)
        fetch_ms = (time.monotonic() - t0) * 1000

        if r.is_error:
            try:
                err = r.json().get("validationErrors", [r.json()])
            except Exception:
                err = r.text
            raise RuntimeError(f"0x quote failed {r.status_code}: {err}")

        d = r.json()
        return SwapQuote(
            buy_token    = buy_token,
            sell_token   = sell_token,
            buy_amount   = int(d.get("buyAmount", 0)),
            sell_amount  = int(d.get("sellAmount", sell_amount or 0)),
            price        = float(d.get("price", 0)),
            price_impact = float(d.get("estimatedPriceImpact", 0)) / 100,
            sources      = d.get("sources", []),
            to           = d.get("to", ""),
            data         = d.get("data", ""),
            value        = d.get("value", "0"),
            gas          = int(d.get("gas", 0)),
            gas_price    = d.get("gasPrice", "0"),
            fetch_ms     = fetch_ms,
        )

    async def sources(self) -> list[str]:
        """List all DEX sources 0x can route through."""
        r = await self._client.get("/swap/v1/sources")
        r.raise_for_status()
        return list(r.json().get("sources", {}).keys())

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "ZeroXRouter":
        return self

    async def __aexit__(self, *_) -> None:
        await self.close()


# ── Titan Bundle Submission ────────────────────────────────────────────────────

class TitanExecutor:
    """
    Submit bundles to Titan's private mempool.

    Why Titan instead of public mempool:
      - Public mempool: searchers see your TX and can front-run it
      - Titan: TX goes directly to Titan block builder, invisible to searchers
      - Cost: same gas, but ~20% better effective price due to no sandwich loss
      - Extra: Titan can also refund MEV extracted from your bundle

    How a bundle works:
      bundle = [tx1, tx2, tx3]  # atomic — all succeed or all revert
      target_block = current_block + 1  # try to land in next block

    eth_sendBundle: fire and forget (Titan tries for 25 blocks by default)
    eth_callBundle: simulate only, no broadcast — use for validation

    For Solana: use Jito block engine instead (jito-solana).

    Quick usage:
      titan = TitanExecutor(ks_token="your_token")
      signed_tx = "0x..."   # signed raw transaction hex
      result = await titan.send_bundle([signed_tx])
      print(result.bundle_hash)
    """

    TITAN_RPC = "https://rpc.titanbuilder.xyz"

    def __init__(
        self,
        ks_token: str,
        ks_base: str = KS_BASE,
        use_proxy: bool = True,
    ):
        self._token     = ks_token
        self._base      = ks_base.rstrip("/")
        self._use_proxy = use_proxy
        rpc_url = f"{self._base}/proxy/titan" if use_proxy else self.TITAN_RPC
        self._client = httpx.AsyncClient(
            base_url=rpc_url,
            timeout=10,
            headers={
                "Authorization": f"Bearer {ks_token}",
                "Content-Type": "application/json",
            },
        )

    async def simulate_bundle(
        self,
        signed_txs: list[str],
        block_number: str = "latest",
        state_block_number: str = "latest",
        timestamp: int | None = None,
    ) -> dict:
        """
        Simulate a bundle without broadcasting.
        Returns: {results: [{value, error, revert}], coinbaseDiff, gasFees}

        Use this BEFORE send_bundle to:
          - Verify your TX won't revert
          - Estimate actual gas cost
          - Check MEV extracted
        """
        payload: dict[str, Any] = {
            "txs":              signed_txs,
            "blockNumber":      block_number,
            "stateBlockNumber": state_block_number,
        }
        if timestamp is not None:
            payload["timestamp"] = timestamp

        r = await self._rpc_call("eth_callBundle", [payload])
        return r.get("result", r)

    async def send_bundle(
        self,
        signed_txs: list[str],
        target_block: int | None = None,
        min_block: int | None = None,
        max_block: int | None = None,
        simulate_first: bool = True,
    ) -> BundleResult:
        """
        Submit a bundle to Titan's private mempool.

        signed_txs: list of signed raw TX hex strings (0x-prefixed)
        target_block: specific block to target (default: current + 1)
        simulate_first: run eth_callBundle before submitting (recommended)

        Returns BundleResult with bundle_hash for tracking.
        """
        sim_ok: bool | None = None

        if simulate_first:
            try:
                sim = await self.simulate_bundle(signed_txs)
                # Check if any TX would revert
                results = sim.get("results", [])
                sim_ok = all(not r.get("error") and not r.get("revert") for r in results)
                if not sim_ok:
                    reverts = [r.get("revert") or r.get("error") for r in results if r.get("error") or r.get("revert")]
                    raise RuntimeError(f"Bundle simulation failed: {reverts}")
            except RuntimeError:
                raise
            except Exception as e:
                # Simulation failed to run — proceed anyway
                sim_ok = None

        params: dict[str, Any] = {"txs": signed_txs}
        if target_block is not None:
            params["blockNumber"] = hex(target_block)
        if min_block is not None:
            params["minTimestamp"] = min_block
        if max_block is not None:
            params["maxTimestamp"] = max_block

        t = time.monotonic()
        r = await self._rpc_call("eth_sendBundle", [params])
        raw = r.get("result", r)

        return BundleResult(
            bundle_hash   = raw.get("bundleHash", ""),
            submitted_at  = t,
            target_block  = target_block,
            simulated     = simulate_first,
            simulation_ok = sim_ok,
            raw           = raw,
        )

    async def get_bundle_stats(self, bundle_hash: str, block_number: int) -> dict:
        """Check if a submitted bundle was included in a block."""
        r = await self._rpc_call("flashbots_getBundleStats", [
            {"bundleHash": bundle_hash, "blockNumber": hex(block_number)}
        ])
        return r.get("result", r)

    async def _rpc_call(self, method: str, params: list) -> dict:
        body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
        r = await self._client.post("/", json=body)
        if r.is_error:
            raise RuntimeError(f"Titan RPC error {r.status_code}: {r.text}")
        return r.json()

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "TitanExecutor":
        return self

    async def __aexit__(self, *_) -> None:
        await self.close()


# ── Jupiter (Solana) — alternative to 0x for SPL tokens ──────────────────────

class JupiterRouter:
    """
    Jupiter aggregator for Solana token swaps.
    No API key required (public endpoint).
    But if you have a Helius key in KeyShield, use it for the RPC calls.

    Usage:
      jup = JupiterRouter(ks_token="token")
      quote = await jup.quote(
          input_mint="So11111111111111111111111111111111111111112",   # SOL
          output_mint="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", # USDC
          amount=1_000_000_000,   # 1 SOL in lamports
      )
    """

    JUPITER_BASE = "https://quote-api.jup.ag/v6"

    # Common Solana token mints
    MINTS = {
        "SOL":  "So11111111111111111111111111111111111111112",
        "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "USDT": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
        "BONK": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
        "JUP":  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
        "WIF":  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
        "PYTH": "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
    }

    def __init__(self, ks_token: str | None = None):
        self._client = httpx.AsyncClient(base_url=self.JUPITER_BASE, timeout=10)

    def _resolve(self, token: str) -> str:
        if len(token) > 20:
            return token  # assume it's already a mint address
        return self.MINTS.get(token.upper(), token)

    async def quote(
        self,
        input_mint: str,
        output_mint: str,
        amount: int,
        slippage_bps: int = 50,   # 0.5%
    ) -> dict:
        """
        Get a swap quote from Jupiter.
        amount: in base units (lamports for SOL, 6-decimal for USDC, etc.)
        Returns the full Jupiter quote object — pass to swap() to execute.
        """
        params = {
            "inputMint":    self._resolve(input_mint),
            "outputMint":   self._resolve(output_mint),
            "amount":       str(amount),
            "slippageBps":  str(slippage_bps),
        }
        r = await self._client.get("/quote", params=params)
        r.raise_for_status()
        return r.json()

    async def swap_transaction(
        self,
        quote: dict,
        user_public_key: str,
        wrap_unwrap_sol: bool = True,
    ) -> str:
        """
        Get a serialized swap transaction from a Jupiter quote.
        Returns: base64-encoded transaction — sign and submit via Helius RPC.
        """
        body = {
            "quoteResponse":    quote,
            "userPublicKey":    user_public_key,
            "wrapAndUnwrapSol": wrap_unwrap_sol,
        }
        r = await self._client.post("/swap", json=body)
        r.raise_for_status()
        return r.json()["swapTransaction"]   # base64

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "JupiterRouter":
        return self

    async def __aexit__(self, *_) -> None:
        await self.close()


# ── Parallel quote + analysis ─────────────────────────────────────────────────

async def parallel_quote_and_analyze(
    router: ZeroXRouter,
    analysis_fn,     # async callable that returns (bool, str)
    sell_token: str,
    buy_token: str,
    sell_amount: int,
) -> tuple[SwapQuote | None, bool, str]:
    """
    Run the swap quote and AI analysis CONCURRENTLY.
    This cuts latency from (quote + AI) serial → max(quote, AI).

    Typical: 200ms instead of 350ms.

    Returns: (quote, should_trade, reason)
    """
    quote_task    = asyncio.create_task(router.quote(sell_token, buy_token, sell_amount=sell_amount))
    analysis_task = asyncio.create_task(analysis_fn())

    quote, (should_trade, reason) = await asyncio.gather(quote_task, analysis_task)
    return quote, should_trade, reason
