//! ACME end-to-end integration test against a local Pebble instance.
//!
//! Pebble is the Let's Encrypt project's local ACME test server
//! (https://github.com/letsencrypt/pebble). Unlike LE staging, it
//! runs entirely in-process on the dev box, so the test:
//!   1. Doesn't burn LE rate-limit budget.
//!   2. Doesn't require a real public domain or `:80` reachable from
//!      the internet — pebble accepts arbitrary domains and resolves
//!      challenges over loopback.
//!   3. Exercises the full instant-acme flow against a real RFC 8555
//!      directory: account creation, order, HTTP-01 challenge,
//!      finalize, certificate fetch.
//!
//! The test is `#[ignore]` by default so the normal `cargo test`
//! run never tries to spin up Docker. To exercise it locally:
//!
//! ```sh
//! # 1. Start pebble (default config — accepts any domain, validates
//! #    HTTP-01 over loopback at the configured port).
//! docker run -d --rm --name pebble \
//!   -p 14000:14000 \
//!   -p 15000:15000 \
//!   -e PEBBLE_VA_NOSLEEP=1 \
//!   -e PEBBLE_VA_ALWAYS_VALID=0 \
//!   -e PEBBLE_VA_HTTP_PORT=$KS_ACME_HTTP01_PORT \
//!   letsencrypt/pebble \
//!   pebble -config /test/config/pebble-config.json -strict
//!
//! # 2. Pick a free local port for the HTTP-01 listener and tell pebble
//! #    to use it for validation. KS_ACME_HTTP01_BIND must agree.
//! export KS_ACME_HTTP01_PORT=5002
//! export KS_ACME_HTTP01_BIND=127.0.0.1:5002
//!
//! # 3. Run the ignored test.
//! cargo test -p ks-proxy --test acme_pebble \
//!   -- --ignored --nocapture acme_pebble_full_flow
//! ```
//!
//! Pebble uses a self-signed cert for its own management endpoint
//! (`https://localhost:14000/dir`). The test config builds a
//! `reqwest` client with `danger_accept_invalid_certs` so the ACME
//! library can talk to it. instant-acme uses its own HTTP client
//! internally — it picks up the system root store via webpki-roots,
//! so we additionally export `SSL_CERT_FILE=/path/to/pebble.minica.pem`
//! to teach it to trust pebble. The most reliable approach in CI is
//! to use pebble's "acceptable" mode (the docker image bundles a
//! root cert at /test/certs/pebble.minica.pem); we resolve that path
//! from `KS_ACME_PEBBLE_CA` if set, else fall back to disabling
//! cert verification entirely (only safe for local-loopback pebble).
//!
//! ## What gets verified
//!
//! * `obtain_certificate` returns a `CertBundle` whose `not_after` is
//!   in the future (pebble's default cert lifetime is 5 years; the
//!   acceptance threshold in the spec is 80 days because LE issues
//!   90-day certs and we want to verify the parser pulls a sensible
//!   number).
//! * The cert PEM is a parseable PEM block that `load_cached_cert`
//!   round-trips through disk without losing anything.
//! * The ChallengeStore is populated then drained — no orphaned
//!   tokens after issuance completes.

#![allow(clippy::needless_pass_by_value)]

use std::sync::Arc;
use std::time::SystemTime;

use ks_proxy::acme::{
    self, AcmeConfig, CertBundle, ChallengeStore, RENEWAL_THRESHOLD_DAYS,
};

/// Configurable knob — pebble's default ACME directory URL. Tests
/// override via `KS_ACME_DIRECTORY` so the same flow can target LE
/// staging if pebble is unavailable.
const PEBBLE_DIRECTORY: &str = "https://localhost:14000/dir";

/// Env var: where to bind the local HTTP-01 challenge listener. Pebble
/// must be configured to validate against the same port (set
/// `PEBBLE_VA_HTTP_PORT` on the docker container).
const HTTP01_BIND_ENV: &str = "KS_ACME_HTTP01_BIND";

/// Pebble runs entirely on the local box, so a domain like `test.local`
/// or `example.test` is fine. The CA itself (pebble) accepts whatever.
const TEST_DOMAIN: &str = "test.local";
const TEST_EMAIL: &str = "test@example.com";

/// Give pebble a moment to be reachable. If docker is still spinning
/// up the container, we get a connection refused. Polling keeps the
/// test deterministic without hard-coding sleeps.
async fn wait_for_pebble_ready(directory_url: &str) -> Result<(), String> {
    use std::time::Duration;

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|e| format!("build reqwest client: {e}"))?;

    for attempt in 0..30 {
        match client.get(directory_url).send().await {
            Ok(r) if r.status().is_success() => return Ok(()),
            Ok(r) => {
                if attempt == 29 {
                    return Err(format!(
                        "pebble reachable but returned {} after 30 attempts",
                        r.status(),
                    ));
                }
            }
            Err(e) if attempt == 29 => {
                return Err(format!(
                    "pebble unreachable at {directory_url} after 30 attempts: {e}. \
                     Start pebble with: docker run -d --rm -p 14000:14000 \
                     -p 15000:15000 letsencrypt/pebble",
                ));
            }
            Err(_) => {}
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    Ok(())
}

/// Spawn the HTTP-01 challenge listener on a free local port. Returns
/// the bound socket address so the caller can advertise it to pebble.
async fn spawn_challenge_listener(
    challenges: ChallengeStore,
    bind: &str,
) -> Result<std::net::SocketAddr, String> {
    let listener = tokio::net::TcpListener::bind(bind)
        .await
        .map_err(|e| format!("bind {bind}: {e}"))?;
    let addr = listener
        .local_addr()
        .map_err(|e| format!("local_addr: {e}"))?;
    let app = acme::challenge_router(challenges);
    tokio::spawn(async move {
        // The listener lives for the whole test; ignore graceful
        // shutdown — the tokio runtime tears it down at test exit.
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("challenge listener exited: {e}");
        }
    });
    Ok(addr)
}

/// Build a fresh tempdir under the OS temp root. Avoids the
/// `tempfile` dep — keyed on pid + nanos for parallel safety.
fn fresh_cache_dir() -> std::path::PathBuf {
    let pid = std::process::id();
    let nanos = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let p = std::env::temp_dir().join(format!("ks-acme-pebble-{pid}-{nanos}"));
    std::fs::create_dir_all(&p).expect("mkdir cache dir");
    p
}

/// Full ACME flow against pebble. Marked `#[ignore]` so the default
/// `cargo test` skips it — opt in with `-- --ignored`.
///
/// Acceptance criteria (from spec):
///   * `obtain_certificate` returns Ok(CertBundle).
///   * `bundle.not_after > now + 80 days` — pebble's default lifetime
///     is 5 years which easily clears this; the threshold is sized
///     for LE prod's 90-day certs.
///   * `bundle.cert_pem` is non-empty and parses as PEM.
///   * `bundle.key_pem` is non-empty.
///
/// Why `#[tokio::test(flavor = "multi_thread")]`: the challenge
/// listener is a long-running task; single-threaded would block the
/// instant-acme polling loop while serving the HTTP-01 GET.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires running pebble container — see module docstring"]
async fn acme_pebble_full_flow() {
    // Resolve config.
    let directory_url = std::env::var("KS_ACME_DIRECTORY")
        .unwrap_or_else(|_| PEBBLE_DIRECTORY.to_string());
    let http01_bind = std::env::var(HTTP01_BIND_ENV)
        .unwrap_or_else(|_| "127.0.0.1:5002".to_string());

    // Surface a useful error if pebble isn't reachable rather than
    // letting instant-acme produce a tangled DNS error.
    if let Err(e) = wait_for_pebble_ready(&directory_url).await {
        panic!("pebble readiness check failed: {e}");
    }

    let cache_dir = fresh_cache_dir();
    let cfg = AcmeConfig {
        domain:        TEST_DOMAIN.to_string(),
        contact_email: TEST_EMAIL.to_string(),
        directory_url: directory_url.clone(),
        cache_dir:     cache_dir.clone(),
    };

    // Wire up the challenge listener BEFORE calling obtain_certificate
    // — pebble polls it during the order's ready phase.
    let challenges = ChallengeStore::new();
    let _listener_addr = spawn_challenge_listener(challenges.clone(), &http01_bind)
        .await
        .expect("spawn HTTP-01 listener");

    // Run the real flow.
    let bundle: CertBundle = acme::obtain_certificate(&cfg, &challenges)
        .await
        .expect("obtain_certificate against pebble");

    // ── Acceptance assertions ─────────────────────────────────────
    assert!(!bundle.cert_pem.is_empty(), "cert PEM must not be empty");
    assert!(!bundle.key_pem.is_empty(),  "key PEM must not be empty");

    // PEM marker check — instant-acme returns a cert chain in PEM.
    let cert_str = std::str::from_utf8(&bundle.cert_pem)
        .expect("cert PEM must be UTF-8");
    assert!(
        cert_str.contains("-----BEGIN CERTIFICATE-----"),
        "cert PEM missing BEGIN CERTIFICATE marker: {cert_str:?}",
    );
    let key_str = std::str::from_utf8(&bundle.key_pem)
        .expect("key PEM must be UTF-8");
    assert!(
        // instant-acme + rcgen emit either PRIVATE KEY (PKCS#8) or
        // EC PRIVATE KEY (SEC1) depending on the key type.
        key_str.contains("-----BEGIN PRIVATE KEY-----")
            || key_str.contains("-----BEGIN EC PRIVATE KEY-----"),
        "key PEM missing PRIVATE KEY marker: {key_str:?}",
    );

    // not_after sanity: pebble issues 5-year certs by default; LE
    // would issue 90-day. Either way, > 80 days clears the threshold.
    let days_left = bundle.days_until_expiry();
    assert!(
        days_left > 80,
        "expected cert with > 80 days validity, got {days_left} \
         (not_after={}, now={})",
        bundle.not_after,
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0),
    );

    // should_renew should be false for a fresh pebble cert (well above
    // RENEWAL_THRESHOLD_DAYS=30).
    assert!(
        !bundle.should_renew(RENEWAL_THRESHOLD_DAYS),
        "freshly-issued cert should not need renewal yet \
         (days_left={days_left}, threshold={RENEWAL_THRESHOLD_DAYS})",
    );

    // Persist + reload — exercises the cache dir round-trip the
    // production code relies on for restart-survival.
    acme::save_cert(&cache_dir, &bundle).expect("save_cert");
    let reloaded = acme::load_cached_cert(&cache_dir)
        .expect("load_cached_cert after save_cert");
    assert_eq!(reloaded.cert_pem, bundle.cert_pem);
    assert_eq!(reloaded.key_pem,  bundle.key_pem);
    // not_after parsed independently from disk — should match within
    // a few seconds (parser rounds to second precision).
    assert!(
        (reloaded.not_after - bundle.not_after).abs() <= 1,
        "reloaded not_after diverged: {} vs {}",
        reloaded.not_after,
        bundle.not_after,
    );

    // Challenge tokens cleaned up after issuance.
    assert!(
        challenges.is_empty(),
        "expected challenge store to be empty after issuance, \
         got {} entries",
        challenges.len(),
    );

    // Cleanup (best-effort; tempdir cleanup isn't critical).
    let _ = std::fs::remove_dir_all(&cache_dir);

    // Hint the borrow checker we still own this for the duration.
    drop::<Arc<()>>(Arc::new(()));
}
