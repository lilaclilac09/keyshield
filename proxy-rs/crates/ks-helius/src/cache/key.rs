/// Cache key derivation — reuses `ks_cache::pycompat::cache_key` for byte
/// parity with Python.
///
/// Format: 40-char lowercase hex = SHA1(`"helius:{method}:{canonical_json}"`).
/// The prefix is baked into the hash, not prepended literally.
///
/// Spec 09 §"Key derivation": explicitly reuse pycompat, don't reinvent.

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct CacheKey(pub String);

impl CacheKey {
    pub fn derive(method: &str, params: &serde_json::Value) -> Self {
        let raw = ks_cache::pycompat::cache_key("helius", method, params);
        Self(raw)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for CacheKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}
