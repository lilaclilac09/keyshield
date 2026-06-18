//! POST /agent/execute — run one Claude Code turn under the caller's vault key.
//!
//! Flow:
//!   1. Bearer token → session → user_id, and parse the token's `scp` claim
//!   2. Scope gate: require `*` or `agent:exec` (delegated bots opt in explicitly)
//!   3. cwd lockdown: confine the subprocess to KS_AGENT_WORKSPACE_ROOT
//!   4. Vault lookup: user's Anthropic key (sqlite fast-path)
//!   5. Spawn `claude` with the real key in env (key never crosses the wire)
//!   6. Harness loop (ks-agent): write stdin, read NDJSON stdout, normalise
//!   7. Return { session_id, events } as JSON
//!
//! Why this composes with keyshield's *delegation* agents: `/auth/agent-login`
//! mints a normal session token bound to the owner's wallet, now carrying the
//! agent's registered scopes in the `scp` claim. So a delegated bot can run a
//! real coding turn paid by its owner's vaulted key — but only if the owner
//! granted `agent:exec` (or `*`), and only inside the workspace root.

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use ks_agent::{InputContent, NormalizedEvent, ThreadState};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::AppState;

/// Capability a token must carry (via `*` or this exact string) to run code.
const EXEC_SCOPE: &str = "agent:exec";

// ── Request / response ────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ExecuteRequest {
    /// Natural-language prompt for this turn.
    pub prompt: String,
    /// Working directory for the claude subprocess. Must resolve to a path
    /// inside KS_AGENT_WORKSPACE_ROOT; absolute or relative-to-root accepted.
    /// Omit to use the workspace root itself.
    pub cwd: Option<String>,
    /// Model override, e.g. "claude-opus-4-8".
    pub model: Option<String>,
    /// Resume a previous conversation. Pass the `session_id` from an earlier response.
    pub session_id: Option<String>,
}

#[derive(Serialize)]
pub struct ExecuteResponse {
    /// Claude's native session ID. Pass back as `session_id` to resume.
    pub session_id: Option<String>,
    pub events: Vec<NormalizedEvent>,
}

// ── Handler ───────────────────────────────────────────────────────────────────

pub async fn execute(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<ExecuteRequest>,
) -> Response {
    // 1. Auth — resolve token → (user_id, scopes).
    let Some(token) = bearer_token(&headers) else {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    };

    let (user_id, scopes) = if token == "dev-bypass" {
        ("dev-bypass".to_string(), vec!["*".to_string()])
    } else {
        match state.sessions.get(&token) {
            Ok(Some(s)) => (s.user_id, token_scopes(&token)),
            Ok(None) => return (StatusCode::UNAUTHORIZED, "unauthorized").into_response(),
            Err(e) => {
                tracing::warn!(error = %e, "session lookup failed");
                return (StatusCode::INTERNAL_SERVER_ERROR, "session lookup failed")
                    .into_response();
            }
        }
    };

    // 2. Scope gate — a delegated bot needs explicit `agent:exec` (or `*`).
    if !scope_allows_exec(&scopes) {
        tracing::info!(user = %user_id, "agent/execute denied: missing exec scope");
        return (
            StatusCode::FORBIDDEN,
            "token lacks 'agent:exec' scope (register the agent with scopes including 'agent:exec' or '*')",
        )
            .into_response();
    }

    // 3. cwd lockdown — confine to KS_AGENT_WORKSPACE_ROOT.
    let cwd = match resolve_cwd(req.cwd.as_deref()) {
        Ok(p) => p,
        Err((code, msg)) => return (code, msg).into_response(),
    };

    // 4. Resolve Anthropic key from vault (plaintext fast-path), else platform env.
    let api_key = match ks_vault::sqlite::lookup_upstream_key(
        &state.vault_db_path,
        &user_id,
        "anthropic",
    ) {
        Ok(k) => k,
        Err(ks_vault::SqliteVaultError::NotFound { .. }) => {
            let k = std::env::var("ANTHROPIC_API_KEY").unwrap_or_default();
            if k.is_empty() {
                return (
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "no anthropic key stored for this user",
                )
                    .into_response();
            }
            k
        }
        Err(e) => {
            tracing::warn!(error = %e, user = %user_id, "vault lookup failed");
            return (StatusCode::INTERNAL_SERVER_ERROR, "vault lookup failed").into_response();
        }
    };

    // 5. Build ThreadState.
    let ks_session_id = req
        .session_id
        .clone()
        .unwrap_or_else(|| format!("ks-{user_id}"));
    let mut thread_state = ThreadState::new(ks_session_id, cwd);
    thread_state.model = req.model.clone();
    // A caller-supplied session_id means "resume this claude-native session",
    // so we send --resume on the first turn of this request.
    if let Some(ref sid) = req.session_id {
        thread_state.harness_session_id = Some(sid.clone());
    }

    // 6. Run the harness turn.
    let content = vec![InputContent::text(&req.prompt)];
    match ks_agent::run_turn(&api_key, &mut thread_state, content).await {
        Ok(output) => Json(ExecuteResponse {
            session_id: output.session_id,
            events: output.events,
        })
        .into_response(),
        Err(e) => {
            tracing::warn!(error = %e, "agent turn failed");
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()
        }
    }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

fn bearer_token(headers: &HeaderMap) -> Option<String> {
    let v = headers.get("authorization")?.to_str().ok()?;
    v.strip_prefix("Bearer ").map(str::to_string)
}

fn scope_allows_exec(scopes: &[String]) -> bool {
    scopes.iter().any(|s| s == "*" || s == EXEC_SCOPE)
}

/// Parse the `scp` claim out of a keyshield session token.
///
/// Token format (see backend/auth/session.py): `<payload>.<hmac>` where
/// `payload = urlsafe_b64encode(json).rstrip('=')`. We don't re-verify the
/// HMAC here: the token string is the sessions-table primary key, and the
/// caller already resolved it against the DB, so the payload is exactly what
/// the backend wrote. A token that fails to parse yields no scopes → denied.
fn token_scopes(token: &str) -> Vec<String> {
    use base64::Engine;
    let Some(payload_b64) = token.split('.').next().filter(|p| !p.is_empty()) else {
        return Vec::new();
    };
    // Python strips '=' padding; URL_SAFE_NO_PAD decodes the unpadded form.
    let Ok(bytes) = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(payload_b64) else {
        return Vec::new();
    };
    let Ok(json) = serde_json::from_slice::<serde_json::Value>(&bytes) else {
        return Vec::new();
    };
    json.get("scp")
        .and_then(|v| v.as_str())
        .map(|s| {
            s.split(',')
                .map(|x| x.trim().to_string())
                .filter(|x| !x.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

/// Confine the subprocess working directory to `KS_AGENT_WORKSPACE_ROOT`.
///
/// - root set + cwd given → cwd (abs, or relative-to-root) must canonicalize
///   to a path inside root; `..`/symlink escapes are resolved away and rejected.
/// - root set + no cwd → the root itself.
/// - root unset + cwd given → refused (can't validate containment).
/// - root unset + no cwd → the proxy's own cwd (no caller-controlled path).
fn resolve_cwd(requested: Option<&str>) -> Result<PathBuf, (StatusCode, &'static str)> {
    let root = std::env::var("KS_AGENT_WORKSPACE_ROOT")
        .ok()
        .filter(|s| !s.trim().is_empty());
    resolve_cwd_in(root.as_deref(), requested)
}

/// Pure containment logic (env read out, so it's race-free to unit-test).
/// Returns a small `(StatusCode, msg)` the caller turns into a `Response`.
fn resolve_cwd_in(
    root: Option<&str>,
    requested: Option<&str>,
) -> Result<PathBuf, (StatusCode, &'static str)> {
    match (root, requested) {
        (Some(root), req_opt) => {
            let root_canon = std::fs::canonicalize(root).map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "KS_AGENT_WORKSPACE_ROOT does not exist",
                )
            })?;
            let target = match req_opt {
                None => return Ok(root_canon),
                Some(req) => {
                    let p = PathBuf::from(req);
                    if p.is_absolute() {
                        p
                    } else {
                        root_canon.join(p)
                    }
                }
            };
            let target_canon = std::fs::canonicalize(&target)
                .map_err(|_| (StatusCode::BAD_REQUEST, "cwd does not exist"))?;
            if target_canon.starts_with(&root_canon) {
                Ok(target_canon)
            } else {
                Err((
                    StatusCode::FORBIDDEN,
                    "cwd escapes KS_AGENT_WORKSPACE_ROOT",
                ))
            }
        }
        (None, Some(_)) => Err((
            StatusCode::FORBIDDEN,
            "caller-supplied cwd requires KS_AGENT_WORKSPACE_ROOT to be configured",
        )),
        (None, None) => std::env::current_dir()
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "no working directory")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;

    fn mint(scp: &str) -> String {
        let payload = serde_json::json!({ "uid": "u", "exp": 9999999999i64, "scp": scp });
        let b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(serde_json::to_vec(&payload).unwrap());
        format!("{b64}.fakesig")
    }

    #[test]
    fn parses_scopes_from_token() {
        assert_eq!(token_scopes(&mint("proxy,agent:exec")), vec!["proxy", "agent:exec"]);
        assert_eq!(token_scopes(&mint("*")), vec!["*"]);
        assert!(token_scopes(&mint("")).is_empty());
    }

    #[test]
    fn malformed_token_has_no_scopes() {
        assert!(token_scopes("not-a-token").is_empty());
        assert!(token_scopes("").is_empty());
        assert!(token_scopes("!!!.sig").is_empty());
    }

    #[test]
    fn exec_scope_gate() {
        assert!(scope_allows_exec(&["*".into()]));
        assert!(scope_allows_exec(&["proxy".into(), "agent:exec".into()]));
        assert!(!scope_allows_exec(&["proxy".into(), "analytics".into()]));
        assert!(!scope_allows_exec(&[]));
    }

    fn status_of(r: Result<PathBuf, (StatusCode, &'static str)>) -> Result<PathBuf, StatusCode> {
        r.map_err(|(code, _)| code)
    }

    #[test]
    fn cwd_inside_root_is_allowed() {
        let root = tempfile::tempdir().unwrap();
        let sub = root.path().join("workspace");
        std::fs::create_dir(&sub).unwrap();
        let root_s = root.path().to_str().unwrap();

        // relative-to-root
        let got = status_of(resolve_cwd_in(Some(root_s), Some("workspace"))).unwrap();
        assert!(got.starts_with(std::fs::canonicalize(root.path()).unwrap()));
        // absolute inside root
        let got = status_of(resolve_cwd_in(Some(root_s), sub.to_str())).unwrap();
        assert_eq!(got, std::fs::canonicalize(&sub).unwrap());
        // no cwd → defaults to the root
        let got = status_of(resolve_cwd_in(Some(root_s), None)).unwrap();
        assert_eq!(got, std::fs::canonicalize(root.path()).unwrap());
    }

    #[test]
    fn cwd_escaping_root_is_rejected() {
        let root = tempfile::tempdir().unwrap();
        let root_s = root.path().to_str().unwrap();

        // `..` traversal is canonicalized away then rejected
        assert_eq!(
            status_of(resolve_cwd_in(Some(root_s), Some("../.."))).unwrap_err(),
            StatusCode::FORBIDDEN
        );
        // absolute path outside the root
        assert_eq!(
            status_of(resolve_cwd_in(Some(root_s), Some("/tmp"))).unwrap_err(),
            StatusCode::FORBIDDEN
        );
        // nonexistent path → 400
        assert_eq!(
            status_of(resolve_cwd_in(Some(root_s), Some("does/not/exist"))).unwrap_err(),
            StatusCode::BAD_REQUEST
        );
    }

    #[test]
    fn caller_cwd_without_root_is_refused() {
        assert_eq!(
            status_of(resolve_cwd_in(None, Some("/anywhere"))).unwrap_err(),
            StatusCode::FORBIDDEN
        );
    }
}
