"""API keychain: detect provider shapes, RPC cache catalog, cheap probes.

The key never goes into logs. Detect returns a prefix only. Call uses a
vault/env key already stored for the session user.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

from . import api_router
from .openrouter_interface import DEMO_CHAT_PATH, DEMO_MODEL, chat_body_bytes

# Specific prefixes first — generic `sk-` must be last so it cannot steal
# OpenRouter (`sk-or-`) or Anthropic (`sk-ant-`) keys.
_DETECTORS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("openrouter", re.compile(r"sk-or-[A-Za-z0-9_-]{12,}")),
    ("anthropic", re.compile(r"sk-ant-api\d{2}-[A-Za-z0-9_-]{40,}")),
    ("groq", re.compile(r"gsk_[A-Za-z0-9]{32,}")),
    ("helius", re.compile(r"helius_auth_[A-Za-z0-9]{16,}")),
    (
        "helius",
        re.compile(
            r"(?i)(?<![0-9a-f-])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-f-])"
        ),
    ),
    ("vercel", re.compile(r"(?:vercel_|vcp_)[A-Za-z0-9_]{20,}")),
    ("github", re.compile(r"(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}")),
    ("openai", re.compile(r"sk-(?:proj-|svcacct-|admin-)?(?!or-|ant-)[A-Za-z0-9_-]{20,}")),
)

_PROVIDERS: dict[str, dict[str, str | tuple[str, ...]]] = {
    "openai": {
        "name": "OpenAI",
        "family": "AI",
        "product": "GPT",
        "domain": "platform.openai.com",
        "tags": ("AI", "GPT", "OPENAI"),
    },
    "anthropic": {
        "name": "Anthropic Claude",
        "family": "AI",
        "product": "Claude",
        "domain": "console.anthropic.com",
        "tags": ("AI", "CLAUDE", "ANTHROPIC"),
    },
    "groq": {
        "name": "Groq",
        "family": "AI",
        "product": "Groq LPU",
        "domain": "console.groq.com",
        "tags": ("AI", "GROQ", "FAST"),
    },
    "openrouter": {
        "name": "OpenRouter",
        "family": "AI",
        "product": "NVIDIA Nemotron",
        "domain": "openrouter.ai",
        "tags": ("AI", "NEMOTRON", "OPENROUTER"),
    },
    "mistral": {
        "name": "Mistral AI",
        "family": "AI",
        "product": "Mistral",
        "domain": "console.mistral.ai",
        "tags": ("AI", "MISTRAL"),
    },
    "cohere": {
        "name": "Cohere",
        "family": "AI",
        "product": "Command",
        "domain": "dashboard.cohere.com",
        "tags": ("AI", "COHERE"),
    },
    "cursor": {
        "name": "Cursor",
        "family": "AI",
        "product": "Cursor",
        "domain": "cursor.com",
        "tags": ("AI", "CURSOR"),
    },
    "helius": {
        "name": "Helius RPC",
        "family": "RPC",
        "product": "Solana RPC",
        "domain": "dashboard.helius.dev",
        "tags": ("RPC", "SOLANA", "HELIUS"),
    },
    "0x": {
        "name": "0x Protocol",
        "family": "DEX",
        "product": "0x Swap",
        "domain": "dashboard.0x.org",
        "tags": ("DEX", "0X"),
    },
    "alchemy": {
        "name": "Alchemy",
        "family": "RPC",
        "product": "EVM RPC",
        "domain": "dashboard.alchemy.com",
        "tags": ("RPC", "ALCHEMY"),
    },
    "vercel": {
        "name": "Vercel",
        "family": "INFRA",
        "product": "Vercel",
        "domain": "vercel.com",
        "tags": ("INFRA", "VERCEL"),
    },
    "github": {
        "name": "GitHub",
        "family": "GIT",
        "product": "GitHub PAT",
        "domain": "github.com",
        "tags": ("GIT", "GITHUB"),
    },
}

_PUBKEY_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")
_USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
_USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"


def mask_key(raw: str) -> str:
    text = (raw or "").strip()
    if len(text) < 10:
        return "••••"
    return f"{text[:6]}…{text[-4:]}"


def provider_meta(upstream: str) -> dict[str, Any]:
    ident = (upstream or "").strip().lower()
    row = _PROVIDERS.get(ident)
    if row:
        tags = row["tags"]
        return {
            "id": ident,
            "name": str(row["name"]),
            "family": str(row["family"]),
            "product": str(row["product"]),
            "domain": str(row["domain"]),
            "tags": list(tags) if isinstance(tags, tuple) else list(tags or []),
        }
    return {
        "id": ident or "custom",
        "name": ident or "API",
        "family": "INFRA",
        "product": "API key",
        "domain": "",
        "tags": ["KEY"],
    }


def infer_product(upstream: str, raw: str = "") -> str:
    text = (raw or "").strip()
    if text.startswith("sk-or-"):
        return "NVIDIA Nemotron"
    if text.startswith("sk-ant-"):
        return "Claude"
    if text.startswith("sk-proj-"):
        return "GPT project"
    if text.startswith("sk-svcacct-"):
        return "OpenAI service account"
    if text.startswith("sk-admin-"):
        return "OpenAI admin"
    if text.startswith("gsk_"):
        return "Groq LPU"
    if text.startswith("key_") or text.lower().startswith("crsr"):
        return "Cursor"
    if text.startswith("github_pat_") or text.startswith("ghp_"):
        return "GitHub PAT"
    if text.startswith("vercel_") or text.startswith("vcp_"):
        return "Vercel"
    if text.startswith("helius_auth_") or (len(text) == 36 and text.count("-") == 4):
        return "Solana RPC"
    return str(provider_meta(upstream)["product"])


_PAGE_NAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9 _-]{2,47}$")
_PAGE_NAME_BLOCK = frozenset(
    {
        "name",
        "names",
        "api key",
        "api keys",
        "key",
        "keys",
        "expires",
        "expiry",
        "created",
        "status",
        "actions",
        "type",
        "product",
    }
)


def looks_like_page_key_name(name: str, upstream: str = "") -> bool:
    text = (name or "").strip()
    if not text or text.lower() in _PAGE_NAME_BLOCK:
        return False
    if "http" in text.lower() or "•" in text or "…" in text:
        return False
    if re.search(r"sk-|gsk_|helius_auth_|github_pat_|ghp_", text, re.I):
        return False
    if re.fullmatch(r"[0-9a-f-]{8,}", text, re.I):
        return False
    if re.search(r"\b(key|keys|rpc|api)$", text, re.I):
        return False
    up = (upstream or "").strip().lower()
    if up and text.lower() in {up, str(provider_meta(up)["name"]).lower()}:
        return False
    return bool(_PAGE_NAME_RE.fullmatch(text))


def is_generic_vault_name(name: str, upstream: str) -> bool:
    n = (name or "").strip().lower()
    up = (upstream or "").strip().lower()
    if not n or n in {"unnamed", "untitled", "key"}:
        return True
    if n in {up, f"{up} key", f"{up}key"}:
        return True
    meta = str(provider_meta(up)["name"]).lower()
    if n == meta or n.startswith(f"{meta} ("):
        return True
    return n.endswith(" key") and n.startswith(up)


def uniquify_vault_name(name: str, upstream: str, taken: list[str] | None = None) -> str:
    given = (name or "").strip()
    up = (upstream or "api").strip().lower() or "api"
    taken_l = {str(row or "").strip().lower() for row in (taken or []) if str(row or "").strip()}
    if looks_like_page_key_name(given, upstream) and given.lower() not in taken_l:
        return given
    if looks_like_page_key_name(given, upstream):
        stem = re.sub(r"\s+\d+$", "", given)
        i = 2
        while f"{stem} {i}".lower() in taken_l or f"{stem}{i}".lower() in taken_l:
            i += 1
        return f"{stem} {i}"
    i = 1
    while f"{up}{i}" in taken_l or f"{up} {i}" in taken_l:
        i += 1
    return f"{up}{i}"


def vault_item_name(
    *,
    upstream: str,
    raw: str = "",
    host: str = "",
    name: str = "",
    page_title: str = "",
    taken: list[str] | None = None,
) -> str:
    del raw, host, page_title
    given = (name or "").strip()
    if looks_like_page_key_name(given, upstream) or (given and not is_generic_vault_name(given, upstream)):
        return uniquify_vault_name(given, upstream, taken)
    return uniquify_vault_name(upstream, upstream, taken)


def distinguish_name(
    *,
    upstream: str,
    raw: str,
    host: str = "",
    name: str = "",
    page_title: str = "",
) -> str:
    """Human label + prefix + host so two Helius UUIDs are not the same card."""
    prefix = mask_key(raw)
    meta = provider_meta(upstream)
    given = (name or "").strip()
    if given and looks_like_page_key_name(given):
        return given
    if given and not is_generic_vault_name(given, upstream):
        return given if prefix in given else f"{given} · {prefix}"
    parts = [str(meta["name"])]
    product = infer_product(upstream, raw)
    if product and product.lower() not in str(meta["name"]).lower():
        parts.append(product)
    parts.append(prefix)
    host = (host or "").strip()
    if host:
        parts.append(host)
    title = " ".join((page_title or "").split())[:48]
    if title and not any(title.lower() in str(p).lower() for p in parts):
        parts.append(title)
    return " · ".join(p for p in parts if p)


def tag_value(tags: list[Any] | None, prefix: str) -> str:
    needle = f"{prefix.lower().rstrip(':')}:"
    for tag in tags or []:
        text = str(tag or "")
        if text.lower().startswith(needle):
            return text.split(":", 1)[1].strip()
    return ""


def catalog_tags(upstream: str, extra: list[str] | None = None) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for tag in list(provider_meta(upstream)["tags"]) + list(extra or []):
        text = str(tag or "").strip()
        if not text:
            continue
        key = text.upper()
        if key in seen:
            continue
        seen.add(key)
        out.append(text)
    return out


def extract_key(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        return ""
    for _upstream, pattern in _DETECTORS:
        found = pattern.search(text)
        if found:
            return found.group(0)
    return text


def detect_upstream(raw: str) -> dict[str, Any]:
    """Classify a pasted blob. Does not store or log the secret."""
    text = (raw or "").strip()
    if not text:
        return {"upstream": None, "matched": False, "prefix": None}
    for upstream, pattern in _DETECTORS:
        found = pattern.search(text)
        if found:
            return {
                "upstream": upstream,
                "matched": True,
                "prefix": mask_key(found.group(0)),
            }
    return {"upstream": None, "matched": False, "prefix": mask_key(text)}


def rpc_cache_catalog() -> dict[str, Any]:
    """Read-only RPC TTL table. Writes always bypass."""
    methods = [
        {"method": name, "ttl_sec": ttl, "cached": True}
        for name, ttl in sorted(api_router._HELIUS_TTL.items(), key=lambda kv: kv[0])
    ]
    return {
        "provider": "helius",
        "methods": methods,
        "writes_bypass": sorted(api_router._HELIUS_WRITES),
        "lowest_ttl_sec": min(api_router._HELIUS_TTL.values()) if api_router._HELIUS_TTL else None,
        "note": "Cache hits skip the provider RTT. Writes and quotes never cache.",
    }


def probe_for(
    upstream: str, prompt: str = "KeyShield keychain ping"
) -> tuple[str, str, bytes | None]:
    """Return (call_upstream, path, body_or_none)."""
    name = (upstream or "").strip().lower() or "openrouter"
    if name in {"helius", "helius-rpc"}:
        body = b'{"jsonrpc":"2.0","id":1,"method":"getSlot","params":[]}'
        return "helius-rpc", "", body
    if name == "openai":
        return "openai", "v1/models", None
    if name == "anthropic":
        return "anthropic", "v1/models", None
    if name == "groq":
        return "groq", "openai/v1/models", None
    if name == "mistral":
        return "mistral", "v1/models", None
    path = DEMO_CHAT_PATH.lstrip("/")
    return "openrouter", path, chat_body_bytes(prompt, model=DEMO_MODEL)


def looks_like_pubkey(value: str) -> bool:
    return bool(_PUBKEY_RE.match((value or "").strip()))


def usdc_mint() -> str:
    override = os.environ.get("KS_USDC_MINT", "").strip()
    if override:
        return override
    rpc = (os.environ.get("KS_SOLANA_RPC_URL") or os.environ.get("KS_RPC_URL") or "").lower()
    if "mainnet" in rpc:
        return _USDC_MAINNET
    return _USDC_DEVNET


def public_rpc_url() -> str:
    return (
        os.environ.get("KS_SOLANA_RPC_URL", "").strip()
        or os.environ.get("KS_RPC_URL", "").strip()
        or "https://api.devnet.solana.com"
    )


def parse_sol_lamports(rpc_result: Any) -> int | None:
    if not isinstance(rpc_result, dict):
        return None
    val = rpc_result.get("result", rpc_result)
    if isinstance(val, dict) and "value" in val:
        try:
            return int(val["value"])
        except (TypeError, ValueError):
            return None
    if isinstance(val, int):
        return val
    return None


def parse_usdc_micro(rpc_result: Any) -> int | None:
    if not isinstance(rpc_result, dict):
        return None
    val = rpc_result.get("result", rpc_result)
    accounts = val.get("value") if isinstance(val, dict) else None
    if not isinstance(accounts, list) or not accounts:
        return 0
    total = 0
    found = False
    for row in accounts:
        info = ((row or {}).get("account") or {}).get("data") or {}
        parsed = info.get("parsed") if isinstance(info, dict) else None
        token = ((parsed or {}).get("info") or {}).get("tokenAmount") or {}
        raw = token.get("amount")
        if raw is None:
            continue
        try:
            total += int(raw)
            found = True
        except (TypeError, ValueError):
            continue
    return total if found else 0


def list_stored_upstreams(user_id: str) -> list[dict[str, Any]]:
    """Names + prefixes only. Never returns the raw key.

    One card per vault row. Five Helius keys stay five rows — do not
    collapse by upstream or Vault looks empty after detect.
    """
    from ..routes import vault as vault_mod

    out: list[dict[str, Any]] = []
    with vault_mod._db() as conn:
        rows = conn.execute(
            "SELECT id, name, upstream, value, tags, created_at, updated_at, expires_at "
            "FROM vault_items WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()
    seen: set[str] = set()
    for row in rows:
        upstream = str(row["upstream"] or row["id"] or "").strip()
        item_id = str(row["id"] or "")
        if not upstream or not item_id:
            continue
        if item_id in seen:
            continue
        seen.add(item_id)
        raw = str(row["value"] or "")
        if not raw.strip():
            continue
        prefix = mask_key(raw)
        meta = provider_meta(upstream)
        product = infer_product(upstream, raw)
        expires_at = vault_mod._iso(row["expires_at"]) if row["expires_at"] else None
        created_at = vault_mod._iso(row["created_at"])
        try:
            parsed_tags = json.loads(row["tags"] or "[]")
        except Exception:
            parsed_tags = []
        if not isinstance(parsed_tags, list):
            parsed_tags = []
        host = tag_value(parsed_tags, "host")
        page_title = tag_value(parsed_tags, "page")
        expiry_label = f"expires {expires_at[:10]}" if expires_at else "no expiry"
        note_bits = [
            str(meta["family"]),
            product,
            prefix,
            host or str(meta["domain"]),
            expiry_label,
        ]
        if page_title:
            note_bits.append(page_title)
        out.append(
            {
                "id": item_id,
                "name": str(row["name"] or "") or distinguish_name(
                    upstream=upstream,
                    raw=raw,
                    name=str(row["name"] or ""),
                    host=host,
                    page_title=page_title,
                ),
                "upstream": upstream,
                "prefix": prefix,
                "family": meta["family"],
                "product": product,
                "domain": host or meta["domain"],
                "expires_at": expires_at,
                "created_at": created_at,
                "tags": catalog_tags(upstream, [str(t) for t in parsed_tags]),
                "notes": " · ".join(b for b in note_bits if b),
            }
        )
    return out


async def _jsonrpc(url: str, method: str, params: list[Any]) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=4.0) as client:
        resp = await client.post(
            url,
            json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        )
        resp.raise_for_status()
        data = resp.json()
        return data if isinstance(data, dict) else {}


async def fetch_wallet_balances(address: str, helius_key: str | None) -> dict[str, Any]:
    """SOL + USDC via cached Helius when a key exists, else public RPC."""
    catalog = rpc_cache_catalog()
    empty = {
        "address": address or None,
        "sol": None,
        "sol_lamports": None,
        "usdc": None,
        "usdc_micro": None,
        "cache": "skip",
        "rpc": "none",
        "lowest_ttl_sec": catalog["lowest_ttl_sec"],
        "error": None,
    }
    if not looks_like_pubkey(address):
        return empty

    mint = usdc_mint()
    token_params: list[Any] = [address, {"mint": mint}, {"encoding": "jsonParsed"}]
    try:
        bal = tok = None
        cache = "MISS"
        rpc = "public"
        if helius_key:
            try:
                bal, c1 = await api_router.call_helius("getBalance", [address], helius_key)
                tok, c2 = await api_router.call_helius(
                    "getTokenAccountsByOwner", token_params, helius_key
                )
                cache = "HIT" if c1 == "HIT" and c2 == "HIT" else c1
                rpc = "helius-cache"
            except Exception:
                bal = tok = None
        if bal is None or tok is None:
            url = public_rpc_url()
            bal = await _jsonrpc(url, "getBalance", [address])
            tok = await _jsonrpc(url, "getTokenAccountsByOwner", token_params)
            cache = "MISS"
            rpc = "public"
    except Exception as exc:  # noqa: BLE001
        empty["error"] = type(exc).__name__
        return empty

    lamports = parse_sol_lamports(bal)
    micro = parse_usdc_micro(tok)
    return {
        "address": address,
        "sol": None if lamports is None else round(lamports / 1_000_000_000, 6),
        "sol_lamports": lamports,
        "usdc": None if micro is None else round(micro / 1_000_000, 6),
        "usdc_micro": micro,
        "cache": cache,
        "rpc": rpc,
        "lowest_ttl_sec": catalog["lowest_ttl_sec"],
        "error": None,
    }
