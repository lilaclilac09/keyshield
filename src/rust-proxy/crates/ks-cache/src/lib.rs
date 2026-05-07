//! TTL cache + cache policy tables for KeyShield's hot path.
//!
//! See `proxy-rs/specs/03-cache-policy.md`.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub struct TtlCache<V: Clone> {
    inner: Mutex<HashMap<String, (V, Instant)>>,
}

impl<V: Clone> TtlCache<V> {
    pub fn new() -> Self {
        Self { inner: Mutex::new(HashMap::new()) }
    }

    pub fn get(&self, key: &str) -> Option<V> {
        let mut g = self.inner.lock().ok()?;
        if let Some((v, exp)) = g.get(key).cloned() {
            if Instant::now() < exp {
                return Some(v);
            }
            g.remove(key);
        }
        None
    }

    pub fn set(&self, key: String, value: V, ttl: Duration) {
        if let Ok(mut g) = self.inner.lock() {
            g.insert(key, (value, Instant::now() + ttl));
        }
    }

    pub fn len(&self) -> usize {
        self.inner.lock().map(|g| g.len()).unwrap_or(0)
    }
}

impl<V: Clone> Default for TtlCache<V> {
    fn default() -> Self { Self::new() }
}

pub fn helius_method_ttl(method: &str) -> Option<Duration> {
    let secs = match method {
        "getBalance" | "getAccountInfo" | "getMultipleAccounts"
        | "getTokenAccountBalance" => 5,
        "getTokenAccountsByOwner" | "getTokenAccounts" | "getTokenBalances" => 10,
        "getAsset" | "getAssetBatch" => 300,
        "getAssetsByOwner" | "searchAssets" | "getSignaturesForAddress"
        | "getTransactions" => 30,
        "getAssetsByGroup" => 60,
        "getTransaction" => 60,
        "getSlot" | "getRecentBlockhash" | "getLatestBlockhash" => 2,
        "getEpochInfo" => 10,
        "getBlockTime" => 600,
        _ => return None,
    };
    Some(Duration::from_secs(secs))
}

pub fn helius_is_write(method: &str) -> bool {
    matches!(
        method,
        "sendTransaction" | "sendRawTransaction" | "simulateTransaction"
    )
}

pub fn rest_route_ttl(provider: &str, method: &str, path: &str) -> Option<Duration> {
    let route = format!("{method} {path}");
    match provider {
        "openai" => {
            if route.starts_with("GET /v1/models") {
                Some(Duration::from_secs(3600))
            } else if route.starts_with("POST /v1/embeddings") {
                Some(Duration::from_secs(86400))
            } else {
                None
            }
        }
        "anthropic" => {
            if route.starts_with("GET /v1/models") {
                Some(Duration::from_secs(3600))
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Python-compatible JSON serialization.
///
/// Produces output bytes-identical to Python's
/// `json.dumps(value, sort_keys=True)` for the value types we exercise
/// (objects, arrays, strings, ints, the `-1.5`-shaped float, bools, null).
///
/// Used by the cache layer for cache-key SHA-1 derivation and by
/// upstream re-serialization to keep byte parity with the Python oracle.
///
/// See `proxy-rs/specs/08-python-compat.md`.
pub mod pycompat {
    use serde_json::Value;
    use serde_json::ser::{Formatter, Serializer};
    use sha1::{Digest, Sha1};
    use std::io;

    /// Bytes-identical to Python's `json.dumps(value, sort_keys=True)`.
    /// Used for cache-key derivation (Python's `_ck` always passes
    /// `sort_keys=True` per `api_router.py:117`).
    pub fn to_canonical_json(value: &Value) -> String {
        // With `preserve_order` enabled on serde_json, the default
        // iteration order is insertion-order, NOT alphabetical. Walk the
        // tree once, materializing a sorted representation, then
        // serialize via `PythonFormatter`. The clone cost is fine for
        // cache-key paths — the body is small and this happens once per
        // cache miss.
        let sorted = sort_keys(value);
        write_with_python_formatter(&sorted)
    }

    /// Bytes-identical to Python's `json.dumps(value)` — i.e. **no**
    /// `sort_keys=True`. Mirrors `server.py:721` which re-serializes the
    /// upstream's parsed JSON without sorting (Python preserves dict
    /// insertion order). Used by the upstream layer to produce cached
    /// response bytes that byte-match Python's hot-path output.
    pub fn to_python_json(value: &Value) -> String {
        write_with_python_formatter(value)
    }

    fn write_with_python_formatter(value: &Value) -> String {
        let mut buf = Vec::with_capacity(64);
        let formatter = PythonFormatter::new();
        let mut ser = Serializer::with_formatter(&mut buf, formatter);
        value
            .serialize(&mut ser)
            .expect("Value -> Vec<u8> with PythonFormatter cannot fail");
        // safety: PythonFormatter only ever writes ASCII bytes.
        debug_assert!(buf.iter().all(|&b| b < 0x80));
        String::from_utf8(buf).expect("PythonFormatter is ASCII-only")
    }

    /// Recursively replace every `Object(IndexMap)` with an alphabetically-
    /// sorted variant. We can't mutate `Value` in place with a
    /// `BTreeMap`-backed object without giving up the `preserve_order`
    /// feature globally, so build a new tree.
    fn sort_keys(value: &Value) -> Value {
        match value {
            Value::Object(m) => {
                let mut entries: Vec<(&String, &Value)> = m.iter().collect();
                entries.sort_by(|a, b| a.0.cmp(b.0));
                let mut out = serde_json::Map::with_capacity(entries.len());
                for (k, v) in entries {
                    out.insert(k.clone(), sort_keys(v));
                }
                Value::Object(out)
            }
            Value::Array(items) => {
                Value::Array(items.iter().map(sort_keys).collect())
            }
            other => other.clone(),
        }
    }

    /// SHA-1 hex of `"{provider}:{key}:{to_canonical_json(payload)}"`.
    /// Mirrors `_ck` in `v2-mvp/src/api_router.py:117`.
    pub fn cache_key(provider: &str, key: &str, payload: &Value) -> String {
        let body = to_canonical_json(payload);
        let mut hasher = Sha1::new();
        hasher.update(provider.as_bytes());
        hasher.update(b":");
        hasher.update(key.as_bytes());
        hasher.update(b":");
        hasher.update(body.as_bytes());
        let digest = hasher.finalize();
        // 40-char lowercase hex
        let mut out = String::with_capacity(40);
        for b in digest.iter() {
            // simple lowercase hex, no extra deps.
            out.push(NIBBLE[(b >> 4) as usize] as char);
            out.push(NIBBLE[(b & 0x0F) as usize] as char);
        }
        out
    }

    const NIBBLE: &[u8; 16] = b"0123456789abcdef";

    use serde::Serialize;

    /// Custom formatter mirroring Python's `json.dumps(..., sort_keys=True,
    /// separators=(", ", ": "), ensure_ascii=True)`.
    ///
    /// Three deviations from `serde_json::ser::CompactFormatter`:
    /// 1. `", "` between array items and between object entries.
    /// 2. `": "` between object key and value.
    /// 3. Every codepoint > 0x7F escaped as `\uXXXX`, with surrogate pairs
    ///    used for codepoints > 0xFFFF.
    struct PythonFormatter;

    impl PythonFormatter {
        fn new() -> Self {
            Self
        }
    }

    impl Formatter for PythonFormatter {
        // ----- array separators -----
        fn begin_array_value<W>(&mut self, writer: &mut W, first: bool) -> io::Result<()>
        where
            W: ?Sized + io::Write,
        {
            if first {
                Ok(())
            } else {
                writer.write_all(b", ")
            }
        }

        // ----- object separators -----
        fn begin_object_key<W>(&mut self, writer: &mut W, first: bool) -> io::Result<()>
        where
            W: ?Sized + io::Write,
        {
            if first {
                Ok(())
            } else {
                writer.write_all(b", ")
            }
        }

        fn begin_object_value<W>(&mut self, writer: &mut W) -> io::Result<()>
        where
            W: ?Sized + io::Write,
        {
            writer.write_all(b": ")
        }

        // ----- string contents: ASCII-escape every codepoint > 0x7F -----
        //
        // serde_json's default `format_escaped_str_contents` uses the ESCAPE
        // table to find ASCII control / quote / backslash; everything else
        // (including all non-ASCII UTF-8 bytes) gets passed through to
        // `write_string_fragment` as a single contiguous slice. We override
        // that override to also escape the high bytes.
        fn write_string_fragment<W>(&mut self, writer: &mut W, fragment: &str) -> io::Result<()>
        where
            W: ?Sized + io::Write,
        {
            // Hot path: pure ASCII fragments dominate. Fast-bail on those.
            if fragment.is_ascii() {
                return writer.write_all(fragment.as_bytes());
            }

            let mut chunk_start = 0usize;
            let bytes = fragment.as_bytes();
            for (i, ch) in fragment.char_indices() {
                let c = ch as u32;
                if c < 0x80 {
                    continue;
                }
                // Flush any preceding ASCII bytes since the last escape.
                if i > chunk_start {
                    writer.write_all(&bytes[chunk_start..i])?;
                }
                if c <= 0xFFFF {
                    write!(writer, "\\u{:04x}", c)?;
                } else {
                    // UTF-16 surrogate pair for codepoints > 0xFFFF.
                    let v = c - 0x10000;
                    let hi = 0xD800 + (v >> 10);
                    let lo = 0xDC00 + (v & 0x3FF);
                    write!(writer, "\\u{:04x}\\u{:04x}", hi, lo)?;
                }
                chunk_start = i + ch.len_utf8();
            }
            if chunk_start < bytes.len() {
                writer.write_all(&bytes[chunk_start..])?;
            }
            Ok(())
        }
    }
}
