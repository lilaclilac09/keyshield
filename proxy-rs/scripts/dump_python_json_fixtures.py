#!/usr/bin/env python3
"""Generate Python json.dumps oracle fixtures for the ks-cache pycompat tests.

This script is the single source of truth for the byte-shape expectations
in `proxy-rs/tests/fixtures/python_json.json` and the SHA-1 expectations in
`proxy-rs/tests/fixtures/cache_keys.json`. Re-run it whenever the input
cases change; commit the regenerated JSON alongside the script.

See `proxy-rs/specs/08-python-compat.md` for the contract these fixtures
encode.

Usage:
    cd proxy-rs
    python3 scripts/dump_python_json_fixtures.py
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


# Resolve paths relative to this script so the working directory doesn't
# matter — both `python3 scripts/dump_python_json_fixtures.py` from
# proxy-rs/ and direct execution work.
SCRIPT_DIR = Path(__file__).resolve().parent
PROXY_RS = SCRIPT_DIR.parent
FIXTURES = PROXY_RS / "tests" / "fixtures"


# ---- to_canonical_json fixtures -------------------------------------------------

# These cases are deliberately chosen to exercise every place where Python's
# json.dumps(..., sort_keys=True) diverges from serde_json's default output.
# Each case must be a JSON-roundtrippable Python value.
JSON_CASES: list[Any] = [
    # 1. Nested object with mixed key order — exercises sort_keys recursion
    #    AND ensures int round-trip.
    {"jsonrpc": "2.0", "id": 1, "result": {"value": 1234567890}},
    # 2. Array containing an object with reverse-sorted keys.
    {"params": [{"b": 2, "a": 1}], "method": "getBalance"},
    # 3. Non-ASCII BMP codepoints — must escape as \u00XX.
    {"text": "résumé"},
    # 4. Non-BMP codepoint (U+1F600) — must escape as a UTF-16 surrogate pair.
    {"emoji": "😀"},
    # 5. Recursive sort: outer key "nested", inner keys must also sort.
    {"nested": {"z": 1, "a": [3, 1, 2]}},
    # 6. Empty array — minimal edge case.
    [],
    # 7. Empty object — minimal edge case.
    {},
    # 8. The full set of named JSON escapes plus quote+backslash.
    {"escape": "\"\\\b\f\n\r\t"},
    # 9. Mixed scalar array — covers null/true/false/int/float/string.
    [None, True, False, 0, -1.5, "x"],
    # 10. Integer larger than 2^53 — Python keeps full precision; serde_json
    #     does too via its arbitrary_precision-free i64 path. This guards
    #     against silent f64 conversion.
    {"large_num": 9007199254740993},
]


def dump_json_fixtures(out_path: Path) -> None:
    expected = [json.dumps(c, sort_keys=True) for c in JSON_CASES]
    payload = {"inputs": JSON_CASES, "expected": expected}
    out_path.parent.mkdir(parents=True, exist_ok=True)
    # ensure_ascii=False so the on-disk file stays human-readable for the
    # input side; the `expected` strings are already pre-escaped by
    # json.dumps above and stay byte-exact regardless.
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")


# ---- cache_key SHA-1 fixtures ---------------------------------------------------

# Matches `_ck` in v2-mvp/src/api_router.py:
#   sha1(f"{provider}:{key}:{json.dumps(payload, sort_keys=True)}").hexdigest()
CACHE_KEY_CASES: list[dict[str, Any]] = [
    {
        "provider": "helius",
        "key": "getBalance",
        "payload": ["9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"],
    },
    {
        "provider": "helius",
        "key": "getAsset",
        "payload": ["mint_address"],
    },
    {
        "provider": "openai",
        "key": "POST /v1/chat/completions",
        "payload": {"model": "gpt-4", "messages": []},
    },
    {
        "provider": "anthropic",
        "key": "GET /v1/models",
        "payload": "",
    },
    {
        "provider": "helius",
        "key": "getMultipleAccounts",
        "payload": [["a", "b", "c"], {"encoding": "base64"}],
    },
]


def dump_cache_key_fixtures(out_path: Path) -> None:
    out: list[dict[str, Any]] = []
    for case in CACHE_KEY_CASES:
        body = json.dumps(case["payload"], sort_keys=True)
        raw = f'{case["provider"]}:{case["key"]}:{body}'
        digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()
        out.append(
            {
                "provider": case["provider"],
                "key": case["key"],
                "payload": case["payload"],
                "expected_sha1": digest,
                # `raw_string` is just for human debugging when a fixture
                # diverges; the Rust test ignores it.
                "raw_string": raw,
            }
        )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")


def main() -> None:
    json_out = FIXTURES / "python_json.json"
    cache_out = FIXTURES / "cache_keys.json"
    dump_json_fixtures(json_out)
    dump_cache_key_fixtures(cache_out)
    print(f"wrote {json_out.relative_to(PROXY_RS)} ({len(JSON_CASES)} cases)")
    print(f"wrote {cache_out.relative_to(PROXY_RS)} ({len(CACHE_KEY_CASES)} cases)")


if __name__ == "__main__":
    main()
