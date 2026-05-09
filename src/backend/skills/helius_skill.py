"""
HeliusSkill — all four Helius API surfaces as callable tools.

Each tool is a plain async function. They can be called directly or wired
into any LLM agent (Anthropic tool_use, OpenAI function_calling, etc.).

Surfaces covered:
  helius-rpc      Standard Solana RPC (balance, account, blockhash…)
  helius-das      DAS API (NFTs, assets, metadata)
  helius-enhanced Enhanced Transactions + Token Balances
  webhooks        Create / delete / list Helius webhooks

Real scenario tools:
  portfolio(wallet)              balance + tokens + NFTs in parallel
  transactions(wallet, limit)    decoded tx history (enhanced API)
  nfts(wallet, limit)            DAS assets owned by wallet
  search_nfts(query, limit)      semantic asset search via DAS
  token_info(mint)               token account + metadata
  analyze_tx(signature)          single decoded transaction
  watch_wallet(wallet, url, types) create webhook for wallet activity
  list_webhooks()                list all webhooks for this API key
  delete_webhook(id)             remove a webhook
  priority_fee(accounts, level)  per-write-account priority fee estimate (lamports/CU)
"""

import asyncio
import json
from typing import Any

import httpx

from ..proxy import api_router


# ─── Webhook client (Enhanced API, different auth style) ─────────────────────

_WEBHOOK_CLIENT = httpx.AsyncClient(
    base_url="https://api.helius.xyz",
    http2=True,
    timeout=30,
)


async def _webhook_req(method: str, path: str, api_key: str, body: Any = None) -> Any:
    url = f"{path}?api-key={api_key}"
    kwargs: dict = {}
    if body is not None:
        kwargs["json"] = body
    resp = await _WEBHOOK_CLIENT.request(method, url, **kwargs)
    resp.raise_for_status()
    return resp.json()


# ─── Tool: portfolio ──────────────────────────────────────────────────────────

async def portfolio(wallet: str, api_key: str) -> dict:
    """
    Full wallet snapshot: SOL balance + SPL token balances + NFT count.
    Fires three Helius calls in parallel (Oliver move #2).
    """
    results = await api_router.batch_helius([
        {"method": "getBalance",        "params": [wallet],            "id": 1},
        {"method": "getTokenBalances",  "params": [wallet],            "id": 2},
        {"method": "getAssetsByOwner",  "params": [wallet, {"page": 1, "limit": 10}], "id": 3},
    ], api_key)

    balance_resp = results[0]
    tokens_resp  = results[1]
    nfts_resp    = results[2]

    sol_lamports = balance_resp.get("result", 0)
    tokens = tokens_resp.get("result", {}).get("tokens", [])
    nft_items = nfts_resp.get("result", {}).get("items", [])

    return {
        "wallet": wallet,
        "sol": round(sol_lamports / 1_000_000_000, 6),
        "tokens": [
            {
                "mint":    t.get("mint"),
                "symbol":  t.get("tokenData", {}).get("symbol", "?"),
                "balance": t.get("amount", 0) / (10 ** t.get("decimals", 0)),
            }
            for t in tokens[:20]
        ],
        "nfts": [
            {
                "id":   a.get("id"),
                "name": a.get("content", {}).get("metadata", {}).get("name", ""),
            }
            for a in nft_items[:10]
        ],
        "nft_page_total": nfts_resp.get("result", {}).get("total", 0),
    }


# ─── Tool: transactions ───────────────────────────────────────────────────────

async def transactions(wallet: str, api_key: str, limit: int = 10) -> list[dict]:
    """
    Decoded transaction history via Helius Enhanced API.
    Returns up to `limit` transactions with type, source, and amount info.
    """
    result, _ = await api_router.call_helius("getTransactions", [wallet, {"limit": limit}], api_key)
    raw_txs = result.get("result", [])
    out = []
    for tx in raw_txs:
        out.append({
            "signature":   tx.get("signature"),
            "timestamp":   tx.get("timestamp"),
            "type":        tx.get("type", "UNKNOWN"),
            "source":      tx.get("source", ""),
            "fee":         tx.get("fee", 0),
            "native_transfers": tx.get("nativeTransfers", []),
            "token_transfers":  tx.get("tokenTransfers", []),
            "description": tx.get("description", ""),
        })
    return out


# ─── Tool: nfts ──────────────────────────────────────────────────────────────

async def nfts(wallet: str, api_key: str, limit: int = 20, page: int = 1) -> dict:
    """
    List NFTs owned by a wallet via DAS getAssetsByOwner.
    Returns items with name, image, and collection.
    """
    result, _ = await api_router.call_helius(
        "getAssetsByOwner",
        [wallet, {"page": page, "limit": limit}],
        api_key,
    )
    data = result.get("result", {})
    items = []
    for a in data.get("items", []):
        meta = a.get("content", {}).get("metadata", {})
        links = a.get("content", {}).get("links", {})
        items.append({
            "id":         a.get("id"),
            "name":       meta.get("name", ""),
            "symbol":     meta.get("symbol", ""),
            "image":      links.get("image", ""),
            "collection": a.get("grouping", [{}])[0].get("group_value", "") if a.get("grouping") else "",
            "floor_price": a.get("floorPrice"),
        })
    return {
        "wallet":  wallet,
        "total":   data.get("total", 0),
        "page":    page,
        "items":   items,
    }


# ─── Tool: search_nfts ───────────────────────────────────────────────────────

async def search_nfts(query: str, api_key: str, limit: int = 10) -> list[dict]:
    """
    Search NFTs by name / symbol / creator via DAS searchAssets.
    """
    result, _ = await api_router.call_helius(
        "searchAssets",
        [{"burnt": False, "limit": limit, "name": query}],
        api_key,
    )
    items = result.get("result", {}).get("items", [])
    return [
        {
            "id":   a.get("id"),
            "name": a.get("content", {}).get("metadata", {}).get("name", ""),
            "image": a.get("content", {}).get("links", {}).get("image", ""),
        }
        for a in items
    ]


# ─── Tool: token_info ────────────────────────────────────────────────────────

async def token_info(mint: str, api_key: str) -> dict:
    """
    Token metadata + supply via getAsset (DAS) + getAccountInfo (RPC).
    """
    asset_result, _ = await api_router.call_helius("getAsset", [mint], api_key)
    asset = asset_result.get("result", {})
    meta = asset.get("content", {}).get("metadata", {})
    return {
        "mint":     mint,
        "name":     meta.get("name", ""),
        "symbol":   meta.get("symbol", ""),
        "decimals": asset.get("token_info", {}).get("decimals"),
        "supply":   asset.get("token_info", {}).get("supply"),
        "image":    asset.get("content", {}).get("links", {}).get("image", ""),
    }


# ─── Tool: analyze_tx ────────────────────────────────────────────────────────

async def analyze_tx(signature: str, api_key: str) -> dict:
    """
    Decode a single transaction — type, accounts involved, token movements.
    Uses Helius Enhanced getTransactions with a single signature.
    """
    result, _ = await api_router.call_helius("getTransactions", [signature], api_key)
    txs = result.get("result", [])
    if not txs:
        return {"error": "transaction not found", "signature": signature}
    tx = txs[0]
    return {
        "signature":        tx.get("signature"),
        "timestamp":        tx.get("timestamp"),
        "type":             tx.get("type", "UNKNOWN"),
        "source":           tx.get("source", ""),
        "fee_sol":          round(tx.get("fee", 0) / 1_000_000_000, 9),
        "accounts":         tx.get("accountData", []),
        "native_transfers": tx.get("nativeTransfers", []),
        "token_transfers":  tx.get("tokenTransfers", []),
        "description":      tx.get("description", ""),
        "events":           tx.get("events", {}),
    }


# ─── Tool: priority_fee ───────────────────────────────────────────────────────

_PRIORITY_LEVELS = {"Min", "Low", "Medium", "High", "VeryHigh", "UnsafeMax"}


async def priority_fee(
    api_key: str,
    accounts: list[str] | None = None,
    transaction: str | None = None,
    priority_level: str = "Medium",
    include_all_levels: bool = False,
    lookback_slots: int | None = None,
) -> dict:
    """
    Per-write-account priority fee estimate via Helius `getPriorityFeeEstimate`.

    Pass `accounts` (list of write-locked pubkeys) OR a base64 `transaction`.
    `priority_level` ∈ Min|Low|Medium|High|VeryHigh|UnsafeMax (default Medium).
    Set `include_all_levels=True` to get all six levels in one call.
    """
    if priority_level not in _PRIORITY_LEVELS:
        raise ValueError(f"priority_level must be one of {_PRIORITY_LEVELS}")
    if not accounts and not transaction:
        raise ValueError("provide either accounts=[...] or transaction=<b64>")

    options: dict = {}
    if include_all_levels:
        options["includeAllPriorityFeeLevels"] = True
    else:
        options["priorityLevel"] = priority_level
    if lookback_slots is not None:
        options["lookbackSlots"] = int(lookback_slots)

    request: dict = {"options": options}
    if accounts:
        request["accountKeys"] = accounts
    if transaction:
        request["transaction"] = transaction

    result, _ = await api_router.call_helius(
        "getPriorityFeeEstimate", [request], api_key
    )
    return result.get("result", {})


# ─── Tool: watch_wallet ───────────────────────────────────────────────────────

async def watch_wallet(
    wallet: str,
    webhook_url: str,
    api_key: str,
    event_types: list[str] | None = None,
) -> dict:
    """
    Create a Helius webhook that POSTs to webhook_url on wallet activity.
    event_types: e.g. ["SWAP", "NFT_SALE", "TRANSFER"] — defaults to all.
    """
    payload = {
        "webhookURL":    webhook_url,
        "transactionTypes": event_types or ["ANY"],
        "accountAddresses": [wallet],
        "webhookType":   "enhanced",
    }
    return await _webhook_req("POST", "/v0/webhooks", api_key, payload)


# ─── Tool: list_webhooks ──────────────────────────────────────────────────────

async def list_webhooks(api_key: str) -> list[dict]:
    """List all webhooks registered for this Helius API key."""
    data = await _webhook_req("GET", "/v0/webhooks", api_key)
    if isinstance(data, list):
        return data
    return data.get("webhooks", [])


# ─── Tool: delete_webhook ─────────────────────────────────────────────────────

async def delete_webhook(webhook_id: str, api_key: str) -> dict:
    """Remove a Helius webhook by ID."""
    return await _webhook_req("DELETE", f"/v0/webhooks/{webhook_id}", api_key)


# ─── Tool registry (for LLM agent tool-use) ──────────────────────────────────

TOOLS = {
    "portfolio":      portfolio,
    "transactions":   transactions,
    "nfts":           nfts,
    "search_nfts":    search_nfts,
    "token_info":     token_info,
    "analyze_tx":     analyze_tx,
    "watch_wallet":   watch_wallet,
    "list_webhooks":  list_webhooks,
    "delete_webhook": delete_webhook,
    "priority_fee":   priority_fee,
}

# Anthropic tool_use definitions (also compatible with OpenAI function calling schema)
TOOL_SCHEMAS = [
    {
        "name": "portfolio",
        "description": "Get a full wallet snapshot: SOL balance, SPL token balances, and NFTs owned.",
        "input_schema": {
            "type": "object",
            "properties": {
                "wallet": {"type": "string", "description": "Solana wallet address (base58)"},
            },
            "required": ["wallet"],
        },
    },
    {
        "name": "transactions",
        "description": "Get decoded transaction history for a wallet using Helius Enhanced API.",
        "input_schema": {
            "type": "object",
            "properties": {
                "wallet": {"type": "string"},
                "limit":  {"type": "integer", "default": 10, "maximum": 100},
            },
            "required": ["wallet"],
        },
    },
    {
        "name": "nfts",
        "description": "List NFTs owned by a wallet (name, image, collection).",
        "input_schema": {
            "type": "object",
            "properties": {
                "wallet": {"type": "string"},
                "limit":  {"type": "integer", "default": 20, "maximum": 100},
                "page":   {"type": "integer", "default": 1},
            },
            "required": ["wallet"],
        },
    },
    {
        "name": "search_nfts",
        "description": "Search NFTs by name or keyword via DAS searchAssets.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Name or keyword to search"},
                "limit": {"type": "integer", "default": 10},
            },
            "required": ["query"],
        },
    },
    {
        "name": "token_info",
        "description": "Get token metadata, decimals, and supply for a mint address.",
        "input_schema": {
            "type": "object",
            "properties": {
                "mint": {"type": "string", "description": "Token mint address"},
            },
            "required": ["mint"],
        },
    },
    {
        "name": "analyze_tx",
        "description": "Decode a single Solana transaction: type, transfers, events.",
        "input_schema": {
            "type": "object",
            "properties": {
                "signature": {"type": "string"},
            },
            "required": ["signature"],
        },
    },
    {
        "name": "watch_wallet",
        "description": "Create a Helius webhook to monitor a wallet for on-chain activity.",
        "input_schema": {
            "type": "object",
            "properties": {
                "wallet":      {"type": "string"},
                "webhook_url": {"type": "string", "description": "HTTPS URL to POST events to"},
                "event_types": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "e.g. ['SWAP','NFT_SALE','TRANSFER'] — omit for ALL events",
                },
            },
            "required": ["wallet", "webhook_url"],
        },
    },
    {
        "name": "list_webhooks",
        "description": "List all Helius webhooks configured for this API key.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "delete_webhook",
        "description": "Delete a Helius webhook by ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "webhook_id": {"type": "string"},
            },
            "required": ["webhook_id"],
        },
    },
    {
        "name": "priority_fee",
        "description": (
            "Estimate Solana priority fee (lamports per CU) via Helius "
            "getPriorityFeeEstimate. Pass write-locked accounts OR a "
            "base64 transaction."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "accounts":       {"type": "array", "items": {"type": "string"}},
                "transaction":    {"type": "string", "description": "base64-encoded tx"},
                "priority_level": {
                    "type": "string",
                    "enum": ["Min", "Low", "Medium", "High", "VeryHigh", "UnsafeMax"],
                    "default": "Medium",
                },
                "include_all_levels": {"type": "boolean", "default": False},
                "lookback_slots":     {"type": "integer", "minimum": 1, "maximum": 150},
            },
        },
    },
]


async def run_tool(name: str, inputs: dict, api_key: str) -> Any:
    """Dispatch a tool call by name, injecting api_key."""
    fn = TOOLS.get(name)
    if not fn:
        raise ValueError(f"unknown tool: {name}")
    return await fn(**inputs, api_key=api_key)
