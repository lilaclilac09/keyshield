# 08 — Python JSON compatibility

## Why this exists

Python's `json.dumps` (default + `sort_keys=True`) and Rust's
`serde_json::to_string` produce **different bytes** for the same logical
input:

| Concern | Python default | serde_json default |
|---|---|---|
| Item separator | `, ` (comma + space) | `,` (no space) |
| Key:value separator | `: ` (colon + space) | `:` (no space) |
| Non-ASCII chars | escaped as `\uXXXX` | passed through verbatim |
| Key ordering | insertion (or `sort_keys=True` → alphabetical) | depends on `serde_json::Map` impl + `preserve_order` feature |

In stage 1 we need byte-parity for cache HIT responses (per ADR 001 #1)
and exact cache-key SHA-1 matching with Python (per ADR 001 #2). Both
require Rust to reproduce Python's exact output.

This spec defines a `python_compat` module — lives in `ks-cache` since it
has no other deps — that other crates use whenever they need to produce
"what Python's `json.dumps(obj, sort_keys=True)` would have produced".

## Python reference behavior

```python
import json
json.dumps(obj, sort_keys=True)
# Equivalent to:
json.dumps(obj, sort_keys=True, separators=(", ", ": "), ensure_ascii=True)
```

- `sort_keys=True`: every object's keys emitted alphabetically (UTF-8
  codepoint order, which for ASCII keys matches lex order).
- `separators=(", ", ": ")`: literal strings between items and between
  key/value (the default when `indent=None`).
- `ensure_ascii=True`: every codepoint > 0x7F is escaped as `\uXXXX`.
  Surrogate pairs used for codepoints > 0xFFFF.
- All other escape rules: `"` → `\"`, `\\` → `\\\\`, `\b\f\n\r\t` →
  named escapes, control chars 0x00-0x1F → `\uXXXX`.

## Rust API

```rust
pub mod pycompat {
    /// Produce a string identical to Python's
    /// `json.dumps(value, sort_keys=True)`.
    ///
    /// Used for both cache keys and re-serialization of upstream responses
    /// when the spec requires Python-bytes parity.
    pub fn to_canonical_json(value: &serde_json::Value) -> String;

    /// Helius cache key. Mirrors `api_router.py:117`:
    ///     sha1("{provider}:{key}:{json.dumps(payload, sort_keys=True)}")
    /// Returns the lowercase 40-char hex string.
    pub fn cache_key(provider: &str, key: &str, payload: &serde_json::Value) -> String;
}
```

## Implementation notes

- Build on `serde_json::Serializer<W, F>` with a custom `Formatter`. The
  three overrides needed:
  - `begin_object_value` writes `": "` instead of `:`
  - Item separator (`begin_object_key` / `begin_array_value` for non-first
    elements) writes `", "` instead of `,`
  - `write_string_fragment` escapes any byte > 0x7F as `\uXXXX`
- For sorting keys: walk the `Value` tree once, materializing
  `Object(BTreeMap)` from `Object(Map)`. `serde_json::Map` is a `BTreeMap`
  by default (without `preserve_order` feature), so iteration is already
  alphabetical. **Verify** this by reading Cargo.toml — the default
  features for `serde_json` exclude `preserve_order`, which is what we
  want.
- ASCII-only escaping for non-BMP codepoints: emit a UTF-16 surrogate
  pair, e.g. U+1F600 → `😀`.

## Acceptance fixtures

Generate via Python at implementation time:

```python
# scripts/dump_python_json_fixtures.py
import json, os
cases = [
    {"jsonrpc": "2.0", "id": 1, "result": {"value": 1234567890}},
    {"params": [{"b": 2, "a": 1}], "method": "getBalance"},
    {"text": "résumé"},                               # non-ASCII
    {"emoji": "😀"},                                   # non-BMP
    {"nested": {"z": 1, "a": [3, 1, 2]}},             # sorted recursion
    [],
    {},
    {"escape": "\"\\\b\f\n\r\t"},
    [None, True, False, 0, -1.5, "x"],
    {"large_num": 9007199254740993},                  # > 2^53
]
out = {f"case_{i:02}": json.dumps(c, sort_keys=True) for i, c in enumerate(cases)}
with open("proxy-rs/tests/fixtures/python_json.json", "w") as f:
    json.dump({"inputs": cases, "expected": out}, f, indent=2, ensure_ascii=False)
```

Rust test loads the fixture, calls `to_canonical_json` on each input,
asserts byte-equality with `expected[case_NN]`.

For `cache_key`: 5 fixtures of `(provider, key, payload) → sha1`, dumped
the same way.

## Test plan

1. 10 byte-equality fixtures (above) — `cargo test -p ks-cache pycompat`.
2. Round-trip property test: for any `serde_json::Value`,
   `to_canonical_json(v)` parses back to the same `Value` (excluding
   key-ordering differences).
3. Negative test: `serde_json::to_string` and `to_canonical_json` differ on
   at least one of the fixtures (sanity check that we're actually adding
   value).
4. `cache_key("helius", "getBalance", json!(["addr"]))` matches the
   SHA-1 Python produces for the same call. Capture the Python value once
   via REPL; commit as fixture.

## Rollout

Land this **before** spec 04, 05, 06, 07 implementations. Other engineers
treat `pycompat` as a workspace shared dep — they call into it; they
don't reinvent it.

If a non-blocking edge case ships incorrect (e.g., NaN handling — Python
errors, serde_json may emit `null` depending on config) — note in this
spec, decide later. Stage-1 acceptance doesn't need NaN coverage because
no upstream returns NaN in well-formed JSON.
