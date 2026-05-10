"""Proxy domain — universal API router with caching and batching."""

from .api_router import (
    PROVIDERS,
    call_helius,
    call_rest,
    batch_helius,
    batch_rest,
    cache_stats,
)
from .api_router import _ck, _cache_get, _cache_set, _helius_provider
from .api_router import _HELIUS_TTL, _HELIUS_WRITES

__all__ = [
    "PROVIDERS",
    "call_helius",
    "call_rest",
    "batch_helius",
    "batch_rest",
    "cache_stats",
    "_ck",
    "_cache_get",
    "_cache_set",
    "_helius_provider",
    "_HELIUS_TTL",
    "_HELIUS_WRITES",
]
