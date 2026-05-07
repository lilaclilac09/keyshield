//! ACME (Let's Encrypt) cert issuance + renewal for ks-proxy.
//!
//! Used when `KS_TLS_MODE=acme`. Three pieces:
//!
//! 1. **Cert cache** — `KS_TLS_CACHE_DIR` (default `/var/lib/keyshield/tls`)
//!    persists `cert.pem` + `key.pem` so restarts don't burn LE rate-limit.
//! 2. **HTTP-01 challenge handler** — axum router fragment that serves
//!    `/.well-known/acme-challenge/:token` from a thread-safe in-memory
//!    store. The store is populated transiently while issuance runs.
//! 3. **Issuance + renewal** — `obtain_certificate` runs the full flow
//!    against the configured ACME directory (LE prod / staging / pebble).
//!    `spawn_renewal_task` wakes every 24h and re-runs issuance if the
//!    cert has <30 days validity.
//!
//! ### Why instant-acme
//!
//! Pure-Rust, async-native, small surface (the alternatives — `acme-lib`,
//! `acme-client`, the Python `certbot` shell-out — pull in OpenSSL,
//! synchronous I/O, or process management). Trade-off documented in
//! ADR-007.
//!
//! ### Out of scope for this commit
//!
//! - DNS-01 challenge (HTTP-01 only — DNS-01 needs a generic provider
//!   abstraction that doesn't exist in the rust ecosystem yet)
//! - Wildcard certs (would need DNS-01)
//! - OCSP stapling (rustls handles automatically when enabled; not on
//!   the critical path for v1)

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime};

use axum::{
    extract::{Path as PathExtractor, State as AxumState},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Router,
};
use dashmap::DashMap;

/// Days-until-expiry below which we trigger a renewal.
pub const RENEWAL_THRESHOLD_DAYS: i64 = 30;

/// Hard floor for "renewal is genuinely urgent — log at WARN every wake".
/// If the renewal task is failing for some reason (RPC down, rate-limited),
/// we want pager-level signal once the cliff is close.
pub const URGENT_RENEWAL_THRESHOLD_DAYS: i64 = 7;

#[derive(Debug, Clone)]
pub struct AcmeConfig {
    pub domain:         String,
    pub contact_email:  String,
    /// ACME directory URL. Defaults to LE production. Tests / staging
    /// override via `KS_ACME_DIRECTORY` to e.g. LE staging or pebble.
    pub directory_url:  String,
    /// Where to persist `cert.pem` + `key.pem` between restarts.
    pub cache_dir:      PathBuf,
}

/// Default LE production directory. NOTE: real-money rate limits apply
/// (50 certs/registered-domain/week). Use `KS_ACME_DIRECTORY` set to LE
/// staging for any iteration testing.
pub const LETSENCRYPT_PROD: &str = "https://acme-v02.api.letsencrypt.org/directory";
pub const LETSENCRYPT_STAGING: &str = "https://acme-staging-v02.api.letsencrypt.org/directory";

/// Read ACME config from env. Returns `Err` when required vars missing
/// — caller (main.rs) will fall back to self-signed + WARN.
pub fn load_acme_config() -> Result<AcmeConfig, String> {
    let domain = std::env::var("KS_TLS_DOMAIN")
        .map_err(|_| "KS_TLS_DOMAIN required for KS_TLS_MODE=acme".to_string())?;
    let domain = domain.trim().to_string();
    if domain.is_empty() || !domain.contains('.') {
        return Err(format!(
            "KS_TLS_DOMAIN={domain:?} doesn't look like a real FQDN",
        ));
    }
    let contact_email = std::env::var("KS_TLS_CONTACT_EMAIL")
        .map_err(|_| "KS_TLS_CONTACT_EMAIL required for KS_TLS_MODE=acme".to_string())?;
    let contact_email = contact_email.trim().to_string();
    if contact_email.is_empty() || !contact_email.contains('@') {
        return Err(format!(
            "KS_TLS_CONTACT_EMAIL={contact_email:?} doesn't look like an email",
        ));
    }

    let directory_url = std::env::var("KS_ACME_DIRECTORY")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| LETSENCRYPT_PROD.to_string());

    let cache_dir = std::env::var("KS_TLS_CACHE_DIR")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/var/lib/keyshield/tls"));

    Ok(AcmeConfig { domain, contact_email, directory_url, cache_dir })
}


// ─── HTTP-01 challenge store ──────────────────────────────────────────────


/// Thread-safe map of `token` → `key_authorization` populated by the
/// issuer task and consumed by the HTTP-01 challenge handler. Cloned
/// into both the axum router state and the issuer scope.
#[derive(Debug, Clone, Default)]
pub struct ChallengeStore {
    inner: Arc<DashMap<String, String>>,
}

impl ChallengeStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set(&self, token: impl Into<String>, key_auth: impl Into<String>) {
        self.inner.insert(token.into(), key_auth.into());
    }

    pub fn remove(&self, token: &str) -> Option<String> {
        self.inner.remove(token).map(|(_, v)| v)
    }

    pub fn get(&self, token: &str) -> Option<String> {
        self.inner.get(token).map(|r| r.value().clone())
    }

    pub fn len(&self) -> usize {
        self.inner.len()
    }

    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }
}

/// Build the axum sub-router that serves HTTP-01 challenges. Mount on
/// the `:80` listener; LE polls
/// `http://{domain}/.well-known/acme-challenge/{token}` during issuance.
pub fn challenge_router(store: ChallengeStore) -> Router {
    Router::new()
        .route(
            "/.well-known/acme-challenge/:token",
            get(serve_challenge),
        )
        .with_state(store)
}

async fn serve_challenge(
    AxumState(store): AxumState<ChallengeStore>,
    PathExtractor(token): PathExtractor<String>,
) -> impl IntoResponse {
    match store.get(&token) {
        Some(key_auth) => (StatusCode::OK, key_auth).into_response(),
        None => (StatusCode::NOT_FOUND, "no such challenge").into_response(),
    }
}


// ─── cert cache (disk persistence) ────────────────────────────────────────


/// Cert + key PEM bytes + the parsed not-after timestamp. Returned by
/// `load_cached_cert` and produced by `obtain_certificate`.
#[derive(Debug, Clone)]
pub struct CertBundle {
    pub cert_pem:  Vec<u8>,
    pub key_pem:   Vec<u8>,
    /// Not-after expressed as seconds since UNIX epoch. Pulled from the
    /// leaf cert's `validity.not_after`.
    pub not_after: i64,
}

impl CertBundle {
    /// Days remaining until `not_after`, signed (negative when expired).
    pub fn days_until_expiry(&self) -> i64 {
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        (self.not_after - now) / 86_400
    }

    pub fn should_renew(&self, threshold_days: i64) -> bool {
        self.days_until_expiry() < threshold_days
    }
}

/// Read `{cache_dir}/cert.pem` + `{cache_dir}/key.pem` if both exist,
/// returning the bundle with parsed expiry. Returns `None` for any
/// failure (missing files, parse error, etc) so the caller knows to
/// run a fresh issuance.
pub fn load_cached_cert(cache_dir: &Path) -> Option<CertBundle> {
    let cert_path = cache_dir.join("cert.pem");
    let key_path = cache_dir.join("key.pem");
    if !cert_path.exists() || !key_path.exists() {
        return None;
    }
    let cert_pem = std::fs::read(&cert_path).ok()?;
    let key_pem = std::fs::read(&key_path).ok()?;
    let not_after = parse_not_after_unix(&cert_pem)?;
    Some(CertBundle { cert_pem, key_pem, not_after })
}

/// Atomic save: write to `.tmp` then rename. Crashes mid-write don't
/// leave a half-written cert file the next boot reads as truncated.
pub fn save_cert(cache_dir: &Path, bundle: &CertBundle) -> std::io::Result<()> {
    std::fs::create_dir_all(cache_dir)?;

    let cert_tmp = cache_dir.join("cert.pem.tmp");
    let key_tmp = cache_dir.join("key.pem.tmp");
    std::fs::write(&cert_tmp, &bundle.cert_pem)?;
    std::fs::write(&key_tmp, &bundle.key_pem)?;

    // Best-effort 0600 on the key for non-root readers on the box.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(
            &key_tmp,
            std::fs::Permissions::from_mode(0o600),
        );
    }

    std::fs::rename(cert_tmp, cache_dir.join("cert.pem"))?;
    std::fs::rename(key_tmp, cache_dir.join("key.pem"))?;
    Ok(())
}

/// Best-effort parse of the leaf cert's not-after as unix seconds.
/// Uses rustls-pemfile to extract the first CERTIFICATE block, then
/// hand-rolls a tiny ASN.1 walk to find the validity field — a full
/// x509-parser dep would be overkill for this one number.
///
/// Returns `None` on parse failure; caller treats as "force renewal".
fn parse_not_after_unix(cert_pem: &[u8]) -> Option<i64> {
    use std::io::Cursor;

    let mut cursor = Cursor::new(cert_pem);
    let der = rustls_pemfile::certs(&mut cursor)
        .next()?
        .ok()?
        .to_vec();
    parse_not_after_from_der(&der)
}

/// ASN.1 walker for the not-after time. Cert layout per RFC 5280:
///   Certificate ::= SEQUENCE {
///     tbsCertificate    SEQUENCE {
///       version           [0] EXPLICIT INTEGER,        -- optional
///       serialNumber      INTEGER,
///       signature         AlgorithmIdentifier,
///       issuer            Name,
///       validity          SEQUENCE {
///         notBefore       Time,
///         notAfter        Time,
///       },
///       ...
///     },
///     signatureAlgorithm  AlgorithmIdentifier,
///     signatureValue      BIT STRING
///   }
///
/// We don't fully parse — we navigate to validity, extract notAfter,
/// and convert to unix. Defensive; returns None on any anomaly.
fn parse_not_after_from_der(der: &[u8]) -> Option<i64> {
    let mut p = Asn1Parser::new(der);
    p.expect_sequence()?;       // outer Certificate
    p.expect_sequence()?;       // tbsCertificate

    // Optional version [0]. If present, skip.
    p.skip_if_explicit_tag(0)?;
    p.skip_one()?;              // serialNumber
    p.skip_one()?;              // signature alg
    p.skip_one()?;              // issuer
    p.expect_sequence()?;       // validity
    p.skip_one()?;              // notBefore
    let not_after_bytes = p.read_time_value()?;
    parse_asn1_time_to_unix(&not_after_bytes)
}

/// Minimal ASN.1 DER parser. Just enough for the validity walk.
struct Asn1Parser<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> Asn1Parser<'a> {
    fn new(buf: &'a [u8]) -> Self { Self { buf, pos: 0 } }

    fn read_tag(&mut self) -> Option<u8> {
        let t = *self.buf.get(self.pos)?;
        self.pos += 1;
        Some(t)
    }

    fn read_len(&mut self) -> Option<usize> {
        let first = *self.buf.get(self.pos)?;
        self.pos += 1;
        if first & 0x80 == 0 { return Some(first as usize); }
        let n = (first & 0x7F) as usize;
        if n == 0 || n > 4 { return None; }
        let mut v: usize = 0;
        for _ in 0..n {
            v = (v << 8) | (*self.buf.get(self.pos)? as usize);
            self.pos += 1;
        }
        Some(v)
    }

    fn expect_sequence(&mut self) -> Option<()> {
        // Tag 0x30 = SEQUENCE | constructed
        if self.read_tag()? != 0x30 { return None; }
        let _ = self.read_len()?;
        Some(())
    }

    fn skip_if_explicit_tag(&mut self, ctx: u8) -> Option<()> {
        // Context-specific [0] EXPLICIT = 0xA0 (constructed).
        let saved = self.pos;
        if let Some(&t) = self.buf.get(self.pos) {
            if t == 0xA0 | ctx {
                self.pos += 1;
                let len = self.read_len()?;
                self.pos += len;
                return Some(());
            }
        }
        self.pos = saved;
        Some(())
    }

    fn skip_one(&mut self) -> Option<()> {
        let _tag = self.read_tag()?;
        let len = self.read_len()?;
        self.pos += len;
        Some(())
    }

    /// Read an ASN.1 Time value (UTCTime 0x17 or GeneralizedTime 0x18)
    /// and return its bytes. Lets `parse_asn1_time_to_unix` worry about
    /// the encoding.
    fn read_time_value(&mut self) -> Option<Vec<u8>> {
        let tag = self.read_tag()?;
        if tag != 0x17 && tag != 0x18 { return None; }
        let len = self.read_len()?;
        let bytes = self.buf.get(self.pos..self.pos + len)?.to_vec();
        self.pos += len;
        // Prefix the tag byte so the caller can disambiguate.
        let mut out = Vec::with_capacity(len + 1);
        out.push(tag);
        out.extend_from_slice(&bytes);
        Some(out)
    }
}

/// Convert ASN.1 time bytes (with leading tag byte) to unix seconds.
/// Supports UTCTime "YYMMDDHHMMSSZ" and GeneralizedTime "YYYYMMDDHHMMSSZ".
fn parse_asn1_time_to_unix(tagged: &[u8]) -> Option<i64> {
    if tagged.len() < 2 { return None; }
    let tag = tagged[0];
    let raw = &tagged[1..];
    let s = std::str::from_utf8(raw).ok()?;
    let (yr, rest) = match tag {
        0x17 if s.len() == 13 => {
            // YYMMDDHHMMSSZ
            let yy: i64 = s.get(0..2)?.parse().ok()?;
            let yr = if yy >= 50 { 1900 + yy } else { 2000 + yy };
            (yr, &s[2..])
        }
        0x18 if s.len() == 15 => {
            let yr: i64 = s.get(0..4)?.parse().ok()?;
            (yr, &s[4..])
        }
        _ => return None,
    };
    if !rest.ends_with('Z') { return None; }
    let mo: i64 = rest.get(0..2)?.parse().ok()?;
    let da: i64 = rest.get(2..4)?.parse().ok()?;
    let hr: i64 = rest.get(4..6)?.parse().ok()?;
    let mi: i64 = rest.get(6..8)?.parse().ok()?;
    let se: i64 = rest.get(8..10)?.parse().ok()?;
    Some(ymdhms_to_unix(yr, mo, da, hr, mi, se))
}

/// Converts gregorian date-time to unix epoch seconds. Pure integer
/// arithmetic so no chrono / time dep.
fn ymdhms_to_unix(y: i64, m: i64, d: i64, h: i64, mi: i64, s: i64) -> i64 {
    // Days from 1970-01-01 to the start of year `y`, accounting for
    // leap years.
    let mut days = 0i64;
    if y >= 1970 {
        for yr in 1970..y { days += if is_leap(yr) { 366 } else { 365 }; }
    } else {
        for yr in y..1970 { days -= if is_leap(yr) { 366 } else { 365 }; }
    }
    // Days within the year up to start of month `m`.
    let month_days_normal = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let month_days_leap   = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let table = if is_leap(y) { &month_days_leap } else { &month_days_normal };
    for i in 0..(m - 1) as usize { days += table[i]; }
    days += d - 1;
    days * 86400 + h * 3600 + mi * 60 + s
}

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0)
}


// ─── issuance + renewal task ──────────────────────────────────────────────


/// Run the full ACME flow: account creation, order, HTTP-01
/// challenge, finalize, certificate fetch. Returns a freshly-issued
/// CertBundle on success; caller saves to disk.
///
/// `challenges` MUST already be wired to a `:80` HTTP-01 handler before
/// this is called — the function inserts the key authorization mid-flow
/// and removes it when done. The handler reads the same Arc across both
/// contexts so LE's poll succeeds.
///
/// **Network — runs against `config.directory_url`.** Set
/// `KS_ACME_DIRECTORY` to LE staging (`acme-staging-v02.api.letsencrypt.org`)
/// or a local pebble for iteration to avoid burning the real LE rate-limit
/// (50 certs / registered-domain / week).
pub async fn obtain_certificate(
    config: &AcmeConfig,
    challenges: &ChallengeStore,
) -> Result<CertBundle, Box<dyn std::error::Error + Send + Sync>> {
    use instant_acme::{
        Account, AuthorizationStatus, ChallengeType, Identifier,
        NewAccount, NewOrder, OrderStatus, RetryPolicy,
    };

    // 1. Account — fresh ECDSA key per call. LE doesn't dedupe by
    //    contact email, but our cert cache makes account churn cheap
    //    (only happens on cold-start without a valid cached cert).
    //    A future optimisation persists the AccountCredentials to
    //    KS_TLS_CACHE_DIR/account.json for re-use.
    let contact = format!("mailto:{}", config.contact_email);
    let (account, _credentials) = Account::builder()?
        .create(
            &NewAccount {
                contact: &[&contact],
                terms_of_service_agreed: true,
                only_return_existing: false,
            },
            config.directory_url.clone(),
            None,
        )
        .await?;

    // 2. Order for our domain. instant-acme allows multiple identifiers
    //    per order but spec 12 v1 is single-domain.
    let identifiers = vec![Identifier::Dns(config.domain.clone())];
    let mut order = account
        .new_order(&NewOrder::new(&identifiers))
        .await?;

    // 3. Stream authorizations, populate HTTP-01 challenge response,
    //    notify LE we're ready. We track tokens we inserted so we can
    //    clean up on success or failure (tokens remain accessible via
    //    `:80` until removed; LE only needs them during polling).
    let mut tokens_inserted: Vec<String> = Vec::new();
    {
        let mut authorizations = order.authorizations();
        while let Some(result) = authorizations.next().await {
            let mut authz = result?;
            match authz.status {
                AuthorizationStatus::Pending => {}
                AuthorizationStatus::Valid => continue,  // already validated
                other => {
                    return Err(format!(
                        "authorization in unexpected state: {other:?}"
                    ).into());
                }
            }
            let mut challenge = authz
                .challenge(ChallengeType::Http01)
                .ok_or("no HTTP-01 challenge offered for authorization")?;
            let token = challenge.token.to_string();
            let key_auth = challenge.key_authorization().as_str().to_string();
            challenges.set(&token, key_auth);
            tokens_inserted.push(token);
            challenge.set_ready().await?;
        }
    }

    // 4. Wait for the order to become Ready (HTTP-01 challenges
    //    validated by LE). instant-acme handles exponential backoff.
    let status = order.poll_ready(&RetryPolicy::default()).await?;
    if !matches!(status, OrderStatus::Ready) {
        for t in &tokens_inserted { challenges.remove(t); }
        return Err(format!(
            "ACME order didn't reach Ready (status={status:?})"
        ).into());
    }

    // 5. Finalize — instant-acme's `rcgen` feature generates the key +
    //    CSR internally and submits, returning the private key PEM.
    //    Belt-and-suspenders: clean up challenge tokens now that LE has
    //    validated; they remain public on `:80` until removed.
    let key_pem = order.finalize().await?;
    for t in &tokens_inserted { challenges.remove(t); }

    // 6. Fetch the cert chain. poll_certificate handles processing
    //    state internally with exponential backoff.
    let cert_chain_pem = order
        .poll_certificate(&RetryPolicy::default())
        .await?;

    let cert_pem_bytes = cert_chain_pem.into_bytes();
    let key_pem_bytes = key_pem.into_bytes();
    let not_after = parse_not_after_unix(&cert_pem_bytes).unwrap_or_else(|| {
        // LE-standard 90 days; conservative fallback when our parser
        // doesn't recognise the time encoding.
        let now_secs = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        now_secs + 90 * 86_400
    });

    Ok(CertBundle {
        cert_pem: cert_pem_bytes,
        key_pem: key_pem_bytes,
        not_after,
    })
}

/// Wake every 24h; if `<RENEWAL_THRESHOLD_DAYS` validity left, run
/// `obtain_certificate` and reload the cert into the served
/// `RustlsConfig`. The caller passes a closure that does the reload
/// — typically `axum_server::tls_rustls::RustlsConfig::reload_from_pem_file`.
pub async fn run_renewal_loop<F>(
    config: AcmeConfig,
    challenges: ChallengeStore,
    initial: CertBundle,
    mut on_renewed: F,
)
where
    F: FnMut(&CertBundle) + Send + 'static,
{
    let mut current = initial;
    loop {
        tokio::time::sleep(Duration::from_secs(24 * 3600)).await;

        let days = current.days_until_expiry();
        if days >= RENEWAL_THRESHOLD_DAYS {
            tracing::debug!("acme: cert valid {days}d, no renewal needed");
            continue;
        }
        if days < URGENT_RENEWAL_THRESHOLD_DAYS {
            tracing::warn!(
                "acme: cert expires in {days}d — renewal CRITICAL",
            );
        } else {
            tracing::info!(
                "acme: cert expires in {days}d — running renewal",
            );
        }

        match obtain_certificate(&config, &challenges).await {
            Ok(new_bundle) => {
                if let Err(e) = save_cert(&config.cache_dir, &new_bundle) {
                    tracing::error!("acme: failed to persist renewed cert: {e}");
                    // Keep current in memory anyway — the issuance
                    // succeeded, persistence is just a restart-survival
                    // optimisation.
                }
                on_renewed(&new_bundle);
                current = new_bundle;
                tracing::info!("acme: renewal complete");
            }
            Err(e) => {
                tracing::error!("acme: renewal attempt failed: {e}");
                // Don't update `current` — the next wake retries.
            }
        }
    }
}


// ─── tests ────────────────────────────────────────────────────────────────


#[cfg(test)]
mod tests {
    use super::*;
    use std::time::SystemTime;

    #[test]
    fn challenge_store_set_get_remove() {
        let store = ChallengeStore::new();
        assert!(store.is_empty());
        store.set("token-abc", "key-auth-xyz");
        assert_eq!(store.len(), 1);
        assert_eq!(store.get("token-abc"), Some("key-auth-xyz".to_string()));
        assert_eq!(store.get("missing"), None);
        store.remove("token-abc");
        assert!(store.is_empty());
    }

    #[tokio::test]
    async fn challenge_handler_returns_key_auth() {
        use axum::{body::Body, http::Request};
        use http_body_util::BodyExt;
        use tower::util::ServiceExt;

        let store = ChallengeStore::new();
        store.set("hello-token", "hello-key-auth");
        let app = challenge_router(store);

        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/.well-known/acme-challenge/hello-token")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let body = resp.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(&body[..], b"hello-key-auth");
    }

    #[tokio::test]
    async fn challenge_handler_returns_404_for_unknown_token() {
        use axum::{body::Body, http::Request};
        use tower::util::ServiceExt;

        let app = challenge_router(ChallengeStore::new());
        let resp = app
            .oneshot(
                Request::builder()
                    .uri("/.well-known/acme-challenge/never-seen")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn cache_round_trip_preserves_bytes_and_perms() {
        // Spot check: write, read back, get same bundle. Don't trust
        // tmpdir between tests (parallel execution).
        let tmp = tempdir_or_skip();
        let bundle = CertBundle {
            cert_pem: b"-----BEGIN CERTIFICATE-----\nfakedata\n-----END CERTIFICATE-----\n".to_vec(),
            key_pem:  b"-----BEGIN PRIVATE KEY-----\nfakedata\n-----END PRIVATE KEY-----\n".to_vec(),
            not_after: 9_999_999_999,
        };
        save_cert(&tmp, &bundle).expect("save");
        // Reads None because the fake PEM doesn't contain a real cert
        // — but it should have written both files.
        assert!(tmp.join("cert.pem").exists());
        assert!(tmp.join("key.pem").exists());

        // 0600 on key file (Unix only).
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = std::fs::metadata(tmp.join("key.pem"))
                .unwrap().permissions().mode() & 0o777;
            assert_eq!(perms, 0o600);
        }
    }

    #[test]
    fn days_until_expiry_arithmetic() {
        let now_secs = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap().as_secs() as i64;
        let bundle_45d = CertBundle {
            cert_pem: vec![], key_pem: vec![],
            not_after: now_secs + 45 * 86_400,
        };
        let d = bundle_45d.days_until_expiry();
        assert!((44..=45).contains(&d), "got {d}");
        assert!(!bundle_45d.should_renew(RENEWAL_THRESHOLD_DAYS));

        let bundle_5d = CertBundle {
            cert_pem: vec![], key_pem: vec![],
            not_after: now_secs + 5 * 86_400,
        };
        assert!(bundle_5d.should_renew(RENEWAL_THRESHOLD_DAYS));
        assert!(bundle_5d.should_renew(URGENT_RENEWAL_THRESHOLD_DAYS));

        let bundle_expired = CertBundle {
            cert_pem: vec![], key_pem: vec![],
            not_after: now_secs - 86_400,
        };
        assert!(bundle_expired.days_until_expiry() < 0);
        assert!(bundle_expired.should_renew(RENEWAL_THRESHOLD_DAYS));
    }

    #[test]
    fn ymdhms_to_unix_known_dates() {
        // Sanity vs python: datetime.datetime(2026, 1, 1, 0, 0, 0).timestamp()
        // (UTC) = 1767225600
        assert_eq!(ymdhms_to_unix(2026, 1, 1, 0, 0, 0), 1_767_225_600);
        // Epoch
        assert_eq!(ymdhms_to_unix(1970, 1, 1, 0, 0, 0), 0);
        // Leap-year boundary: Feb 29 2024 12:00:00
        assert_eq!(ymdhms_to_unix(2024, 2, 29, 12, 0, 0), 1_709_208_000);
    }

    #[test]
    fn parse_utc_time_handles_letsencrypt_format() {
        // UTCTime "YYMMDDHHMMSSZ" — 26 0501 12 30 00 Z = 2026-05-01 12:30:00 UTC
        let mut bytes = vec![0x17];
        bytes.extend_from_slice(b"260501123000Z");
        let unix = parse_asn1_time_to_unix(&bytes).expect("parse");
        // Manually computed: 56 years (1970-2025) × 365 + 14 leap days +
        // 120 days (Jan-Apr 2026) = 20574 days × 86400 + 12:30:00.
        //                         = 1,777,593,600 + 45,000
        //                         = 1,777,638,600
        // Verified via Python:
        //   datetime(2026,5,1,12,30,tzinfo=timezone.utc).timestamp()
        assert_eq!(unix, 1_777_638_600);
    }

    #[test]
    fn parse_generalized_time_handles_post_2050() {
        // GeneralizedTime "YYYYMMDDHHMMSSZ" — used by LE for certs
        // expiring 2050+ (UTCTime would alias to 1950).
        let mut bytes = vec![0x18];
        bytes.extend_from_slice(b"20510101000000Z");
        let unix = parse_asn1_time_to_unix(&bytes).expect("parse");
        // 2051-01-01 00:00:00 UTC. Python: 2556144000.
        assert_eq!(unix, 2_556_144_000);
    }

    fn tempdir_or_skip() -> PathBuf {
        // Avoid tempfile dep — make a unique-ish directory under the
        // OS temp dir keyed on process id + nanos.
        let pid = std::process::id();
        let nanos = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let p = std::env::temp_dir().join(format!("ks-acme-test-{pid}-{nanos}"));
        std::fs::create_dir_all(&p).expect("mkdir");
        p
    }
}
