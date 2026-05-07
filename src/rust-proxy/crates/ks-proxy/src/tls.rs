//! TLS termination for ks-proxy. Three modes:
//!
//! * `KS_TLS_MODE=off`         — plain HTTP on `KS_BIND` (default; preserves
//!                                existing dev workflows).
//! * `KS_TLS_MODE=self-signed` — boots a rustls listener on `KS_TLS_BIND`
//!                                (default `:443`) with a freshly generated
//!                                self-signed cert. For staging /
//!                                docker-compose smoke tests.
//! * `KS_TLS_MODE=acme`        — request a Let's Encrypt cert via ACME
//!                                HTTP-01. Currently a placeholder that
//!                                falls back to `self-signed` with a WARN
//!                                log; full implementation is the next
//!                                follow-up.
//!
//! ## Stealth-mode default
//!
//! Stealth was an opt-in flag (`KS_STEALTH=1`). With TLS now first-class,
//! we want production to default-on stealth — anyone scanning a TLS port
//! they don't have credentials for sees nginx, not "404 Not Found - axum".
//!
//! Resolution order:
//!   1. Explicit `KS_STEALTH=1|0|true|false` always wins.
//!   2. Otherwise: `off` mode → stealth OFF; `self-signed` / `acme` → ON.
//!
//! See ADR-007 for the rationale.

use std::path::PathBuf;
use std::sync::OnceLock;

use axum_server::tls_rustls::RustlsConfig;

/// TLS mode resolved from `KS_TLS_MODE`. Matches the env values exactly.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TlsMode {
    /// Plain HTTP — existing dev behaviour.
    Off,
    /// Self-generated cert (rcgen). Browsers will warn; useful for
    /// internal dogfood and end-to-end smoke tests.
    SelfSigned,
    /// Real Let's Encrypt cert via ACME HTTP-01. Placeholder until the
    /// follow-up commit lands the `instant-acme` integration.
    Acme,
}

impl TlsMode {
    /// Parse the env value. Unknown values fall back to `Off` with a
    /// warn-level log so production typos don't silently start a TLS
    /// server with a different config than intended.
    pub fn from_env_value(raw: &str) -> Self {
        match raw.trim().to_ascii_lowercase().as_str() {
            "" | "off" | "0" | "false" | "disabled" => Self::Off,
            "self-signed" | "selfsigned" | "self_signed" => Self::SelfSigned,
            "acme" | "letsencrypt" | "le"             => Self::Acme,
            other => {
                tracing::warn!(
                    "KS_TLS_MODE={other:?} not recognised — falling back to off. \
                     Valid: off | self-signed | acme",
                );
                Self::Off
            }
        }
    }

    /// Stealth-default per the resolution order above.
    pub fn stealth_default(self) -> bool {
        match self {
            Self::Off => false,
            Self::SelfSigned | Self::Acme => true,
        }
    }
}

/// Read `KS_TLS_MODE` once. Tests override via env.
pub fn read_tls_mode() -> TlsMode {
    let raw = std::env::var("KS_TLS_MODE").unwrap_or_default();
    TlsMode::from_env_value(&raw)
}

/// Cached version for the rare hot-path consumer. Tests typically use
/// `read_tls_mode()` directly so they can flip the env between assertions.
pub fn tls_mode_cached() -> TlsMode {
    static CELL: OnceLock<TlsMode> = OnceLock::new();
    *CELL.get_or_init(read_tls_mode)
}

/// Generate a self-signed cert + private key in memory and return a
/// `RustlsConfig` axum-server can serve from.
///
/// The cert lists `CN=keyshield.local` plus the SAN(s) in `sans`. Pass
/// the production hostname here so curl/`wget`-style clients can verify
/// against a known SAN even if they don't trust the CA.
///
/// Async because `RustlsConfig::from_pem` consumes tokio fs primitives
/// internally; must be called from a tokio runtime.
///
/// Idempotently installs a process-wide rustls `CryptoProvider` (ring)
/// the first time it's called — rustls 0.23 made provider installation
/// explicit, and axum-server panics without one. We pick `ring` over
/// `aws-lc-rs` to keep the build hermetic (no cmake/aws-lc-sys deps).
pub async fn build_self_signed_config(
    sans: &[String],
) -> Result<RustlsConfig, Box<dyn std::error::Error + Send + Sync>> {
    install_crypto_provider();
    let (cert_pem, key_pem) = build_self_signed_pem(sans)?;
    let config = RustlsConfig::from_pem(cert_pem.into_bytes(), key_pem.into_bytes()).await?;
    Ok(config)
}

/// Idempotent install of the rustls ring `CryptoProvider`. Safe to call
/// from multiple test threads — `install_default` returns Err on a
/// second call which we ignore.
pub fn install_crypto_provider() {
    static CELL: OnceLock<()> = OnceLock::new();
    CELL.get_or_init(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

/// Pure-data helper: produce the cert + key PEM bytes without touching
/// tokio. Used by the non-async unit test below so `cargo test` doesn't
/// need a runtime to verify rcgen integration.
pub fn build_self_signed_pem(
    sans: &[String],
) -> Result<(String, String), Box<dyn std::error::Error + Send + Sync>> {
    use rcgen::{generate_simple_self_signed, CertifiedKey};

    let names: Vec<String> = if sans.is_empty() {
        vec!["keyshield.local".to_string(), "localhost".to_string()]
    } else {
        let mut v = sans.to_vec();
        if !v.iter().any(|s| s == "localhost") {
            v.push("localhost".to_string());
        }
        v
    };
    let CertifiedKey { cert, key_pair } = generate_simple_self_signed(names)?;
    Ok((cert.pem(), key_pair.serialize_pem()))
}

/// Resolve the TLS bind address. `KS_TLS_BIND` overrides; otherwise we
/// pick `:443` for self-signed/acme and refuse for off (caller should
/// use `KS_BIND` instead in off mode).
pub fn read_tls_bind() -> String {
    std::env::var("KS_TLS_BIND").unwrap_or_else(|_| "0.0.0.0:443".into())
}

/// Future ACME-cache directory. Read here so the path is stable across
/// the placeholder + real implementation. Defaults to the FHS-friendly
/// `/var/lib/keyshield/tls/`; tests that don't need to write certs can
/// safely ignore.
pub fn read_tls_cache_dir() -> PathBuf {
    std::env::var("KS_TLS_CACHE_DIR")
        .unwrap_or_else(|_| "/var/lib/keyshield/tls".into())
        .into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_tls_mode_known_values() {
        assert_eq!(TlsMode::from_env_value("off"),         TlsMode::Off);
        assert_eq!(TlsMode::from_env_value(""),            TlsMode::Off);
        assert_eq!(TlsMode::from_env_value("self-signed"), TlsMode::SelfSigned);
        assert_eq!(TlsMode::from_env_value("SelfSigned"),  TlsMode::SelfSigned);
        assert_eq!(TlsMode::from_env_value("acme"),        TlsMode::Acme);
        assert_eq!(TlsMode::from_env_value("LE"),          TlsMode::Acme);
    }

    #[test]
    fn parse_tls_mode_unknown_falls_back_to_off() {
        // The warn log fires; the parser must not panic. Unknown values
        // shouldn't accidentally enable a TLS mode.
        assert_eq!(TlsMode::from_env_value("https"),  TlsMode::Off);
        assert_eq!(TlsMode::from_env_value("hello"),  TlsMode::Off);
        assert_eq!(TlsMode::from_env_value("1"),      TlsMode::Off);
    }

    #[test]
    fn stealth_default_matches_adr_007() {
        // Off → stealth off (dev convenience: easier debugging).
        assert!(!TlsMode::Off.stealth_default());
        // Both TLS modes → stealth on (production fingerprint hygiene).
        assert!(TlsMode::SelfSigned.stealth_default());
        assert!(TlsMode::Acme.stealth_default());
    }

    #[test]
    fn self_signed_pem_succeeds_with_custom_san() {
        // Pure-data path: rcgen generates a valid cert + key without
        // needing a tokio runtime. Cert PEM should be ASCII-armored
        // and key PEM should look like a standard pkcs8 block.
        let result = build_self_signed_pem(&["keyshield.test".into()]);
        let (cert, key) = result.expect("self-signed PEM build failed");
        assert!(cert.starts_with("-----BEGIN CERTIFICATE-----"));
        assert!(cert.ends_with("-----END CERTIFICATE-----\r\n")
            || cert.ends_with("-----END CERTIFICATE-----\n"));
        assert!(key.contains("PRIVATE KEY"));
    }

    #[test]
    fn self_signed_pem_with_empty_sans_uses_defaults() {
        // Empty input → keyshield.local + localhost defaults so curl
        // -k still works against the binary out of the box.
        let (cert, key) = build_self_signed_pem(&[])
            .expect("self-signed PEM build with empty SANs failed");
        assert!(!cert.is_empty() && !key.is_empty());
    }

    #[tokio::test]
    async fn build_self_signed_config_succeeds_in_runtime() {
        // Wrapper that needs tokio because axum_server::tls_rustls::
        // RustlsConfig::from_pem awaits internally. Marked tokio::test
        // so it runs only when the cargo runner provides a runtime.
        let cfg = build_self_signed_config(&["keyshield.test".into()]).await;
        assert!(cfg.is_ok(), "self-signed config build failed: {:?}", cfg.err());
    }
}
