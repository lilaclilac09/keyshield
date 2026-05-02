//! Stealth mode — make the proxy look like a stock nginx server to anyone
//! without a valid bearer token. Inspired by maxlv's https_proxy article
//! ("对外看起来就是一台普通的 nginx 服务器").
//!
//! Toggle: `KS_STEALTH=1` (default 0). Read once at startup.
//!
//! Surface:
//!   * `is_stealth_enabled()` — reads `KS_STEALTH` from env, cached.
//!   * `nginx_404_response()` — canonical nginx 404.
//!   * `nginx_index_response()` — canonical nginx welcome page (200 OK).
//!   * `nginx_unauth_response(path)` — index for `/`, 404 otherwise.
//!
//! All stealth responses pin `Server: nginx/1.24.0` so casual scanners see a
//! vanilla nginx fingerprint.

use std::sync::OnceLock;

use axum::{
    body::Body,
    http::{HeaderValue, StatusCode},
    response::Response,
};

/// Canonical nginx 1.24 404 page — the exact bytes nginx serves when no
/// `error_page 404` directive is configured.
pub const NGINX_404_HTML: &str = "<html>
<head><title>404 Not Found</title></head>
<body>
<center><h1>404 Not Found</h1></center>
<hr><center>nginx/1.24.0</center>
</body>
</html>
";

/// Canonical nginx welcome page served at `/` for a fresh install.
pub const NGINX_INDEX_HTML: &str = "<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
<style>
    body {
        width: 35em;
        margin: 0 auto;
        font-family: Tahoma, Verdana, Arial, sans-serif;
    }
</style>
</head>
<body>
<h1>Welcome to nginx!</h1>
<p>If you see this page, the nginx web server is successfully installed and
working. Further configuration is required.</p>

<p>For online help and check the latest version, please refer to
<a href=\"http://nginx.org/\">nginx.org</a>.<br/>
Online documentation is available at
<a href=\"http://nginx.net/\">nginx.net</a>.</p>

<p><em>Thank you for using nginx.</em></p>
</body>
</html>
";

/// Server header pinned to nginx 1.24.0 — matches what Debian/Ubuntu LTS ship.
pub const NGINX_SERVER_HEADER: &str = "nginx/1.24.0";

/// Read `KS_STEALTH` once. Truthy values ("1", "true", "yes", "on") enable
/// stealth mode; everything else (including unset) disables it.
///
/// We also expose `read_stealth_env()` for `AppState` construction — that's
/// the canonical entry point. Routers store the resolved bool on `AppState`
/// so handlers don't re-read env on every request.
pub fn is_stealth_enabled() -> bool {
    static CELL: OnceLock<bool> = OnceLock::new();
    *CELL.get_or_init(read_stealth_env)
}

/// Direct read of `KS_STEALTH`, no caching. Used by `AppState` builders so
/// tests can flip the env var per-process without fighting a cached value.
pub fn read_stealth_env() -> bool {
    match std::env::var("KS_STEALTH") {
        Ok(s) => matches!(
            s.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes" | "on"
        ),
        Err(_) => false,
    }
}

/// Build a response with the nginx server fingerprint and the given body.
fn nginx_response(status: StatusCode, body: &'static str) -> Response {
    let mut resp = Response::builder()
        .status(status)
        .header("content-type", "text/html; charset=utf-8")
        .header("server", NGINX_SERVER_HEADER)
        .body(Body::from(body))
        .expect("static body always valid");
    // Belt-and-suspenders: ensure the Server header value is exactly what
    // we want, even if the builder did header coalescing weirdness.
    resp.headers_mut()
        .insert("server", HeaderValue::from_static(NGINX_SERVER_HEADER));
    resp
}

/// `404 Not Found` with the nginx body. Used for every unauthed request that
/// looks like a real API call.
pub fn nginx_404_response() -> Response {
    nginx_response(StatusCode::NOT_FOUND, NGINX_404_HTML)
}

/// `200 OK` with the nginx welcome page. Used for `GET /` only.
pub fn nginx_index_response() -> Response {
    nginx_response(StatusCode::OK, NGINX_INDEX_HTML)
}

/// Pick the right nginx response for a given request path:
///   * `/` (or empty) → welcome page
///   * anything else → 404
///
/// Mirrors how a stock nginx default site behaves: serves the index for the
/// document root, 404s everything else.
pub fn nginx_unauth_response(path: &str) -> Response {
    if path.is_empty() || path == "/" {
        nginx_index_response()
    } else {
        nginx_404_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nginx_404_has_server_header_and_html_body() {
        let resp = nginx_404_response();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
        assert_eq!(
            resp.headers()
                .get("server")
                .and_then(|v| v.to_str().ok())
                .unwrap(),
            "nginx/1.24.0",
        );
        assert_eq!(
            resp.headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap(),
            "text/html; charset=utf-8",
        );
    }

    #[test]
    fn unauth_response_dispatch() {
        let r1 = nginx_unauth_response("/");
        assert_eq!(r1.status(), StatusCode::OK);
        let r2 = nginx_unauth_response("/favicon.ico");
        assert_eq!(r2.status(), StatusCode::NOT_FOUND);
        let r3 = nginx_unauth_response("");
        assert_eq!(r3.status(), StatusCode::OK);
    }

    #[test]
    fn read_stealth_env_parses_truthy_values() {
        // Save current value to restore after.
        let prev = std::env::var("KS_STEALTH").ok();

        for v in ["1", "true", "TRUE", "Yes", "on"] {
            std::env::set_var("KS_STEALTH", v);
            assert!(read_stealth_env(), "expected {v:?} truthy");
        }
        for v in ["0", "false", "no", "off", "", "garbage"] {
            std::env::set_var("KS_STEALTH", v);
            assert!(!read_stealth_env(), "expected {v:?} falsy");
        }
        std::env::remove_var("KS_STEALTH");
        assert!(!read_stealth_env());

        match prev {
            Some(v) => std::env::set_var("KS_STEALTH", v),
            None => std::env::remove_var("KS_STEALTH"),
        }
    }
}
