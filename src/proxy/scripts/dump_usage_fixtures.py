#!/usr/bin/env python3
"""Dump per-fixture (tok_in, tok_out, cost) tuples by running the canonical
Python `extract_token_usage` against curated bodies.

Used by `proxy-rs/crates/ks-proxy/tests/usage.rs` to lock byte-parity between
the Rust port (`ks_proxy::usage::extract_token_usage`) and the Python source
of truth (`v2-mvp/src/usage.py`). Drift = under/over-charging users.

Output: <out_dir>/manifest.json
  {
    "fixtures": [
      {
        "label": "openai_with_usage",
        "upstream": "openai",
        "body_b64": "<base64 of body>",
        "tok_in": 12,
        "tok_out": 34,
        "cost": 0.000444
      },
      ...
    ]
  }

Bodies are stored base64-encoded so non-UTF-8 / non-JSON malformed cases
round-trip cleanly through JSON.
"""
from __future__ import annotations

import base64
import importlib.util
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROXY_RS = SCRIPT_DIR.parent
# Post-restructure: src/proxy/ replaces top-level proxy-rs/, so REPO_ROOT
# is two parents up. Python control plane lives at src/backend/.
REPO_ROOT = PROXY_RS.parent.parent
V2_USAGE_PY = REPO_ROOT / "src" / "backend" / "billing" / "usage.py"


def _load_usage_module():
    spec = importlib.util.spec_from_file_location("v2_usage", V2_USAGE_PY)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {V2_USAGE_PY}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# Curated fixtures cover the four required shapes plus a handful of edges
# the Rust port can plausibly diverge on (zero-token usage object,
# Anthropic with both input/output, Helius/non-AI flat-cost path).
FIXTURES = [
    (
        "openai_with_usage",
        "openai",
        json.dumps({
            "id": "chatcmpl-1",
            "object": "chat.completion",
            "model": "gpt-4o",
            "usage": {"prompt_tokens": 12, "completion_tokens": 34},
            "choices": [{"message": {"role": "assistant", "content": "hi"}}],
        }).encode(),
    ),
    (
        "anthropic_with_usage",
        "anthropic",
        json.dumps({
            "id": "msg_1",
            "type": "message",
            "role": "assistant",
            "model": "claude-3-5",
            "usage": {"input_tokens": 50, "output_tokens": 80},
        }).encode(),
    ),
    (
        "malformed_body",
        "openai",
        b"\xff\xfe<not json>{",
    ),
    (
        "missing_usage_field",
        "openai",
        json.dumps({"id": "x", "object": "chat.completion"}).encode(),
    ),
    (
        "empty_body_helius_flat_cost",
        "helius",
        b"",
    ),
    (
        "groq_with_usage",
        "groq",
        json.dumps({
            "id": "cc-2",
            "usage": {"prompt_tokens": 200, "completion_tokens": 50},
        }).encode(),
    ),
    (
        "anthropic_partial_usage_only_input",
        "anthropic",
        json.dumps({
            "id": "msg_2",
            "usage": {"input_tokens": 100},
        }).encode(),
    ),
    (
        "alchemy_no_usage_flat_fallback",
        "alchemy",
        json.dumps({"jsonrpc": "2.0", "id": 1, "result": "0xabc"}).encode(),
    ),
]


def main() -> None:
    if len(sys.argv) != 2:
        print(f"usage: {sys.argv[0]} <out_dir>", file=sys.stderr)
        sys.exit(2)
    out_dir = Path(sys.argv[1]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    usage = _load_usage_module()

    out = []
    for label, upstream, body in FIXTURES:
        tok_in, tok_out, cost = usage.extract_token_usage(upstream, body)
        out.append({
            "label": label,
            "upstream": upstream,
            "body_b64": base64.b64encode(body).decode("ascii"),
            "tok_in": int(tok_in),
            "tok_out": int(tok_out),
            "cost": float(cost),
        })

    manifest = {"fixtures": out}
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2)
    )
    print(json.dumps({"status": "ok", "count": len(out)}))


if __name__ == "__main__":
    main()
