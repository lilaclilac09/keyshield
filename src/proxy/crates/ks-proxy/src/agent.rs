//! POST /agent/execute — run one Claude Code turn under the caller's vault key.
//!
//! Flow:
//!   1. Bearer token → session → user_id
//!   2. Vault lookup: user's Anthropic key (sqlite fast-path)
//!   3. Spawn `claude` subprocess with real key in env (key never crosses the wire)
//!   4. Harness loop (ks-agent): write stdin, read NDJSON stdout, normalise
//!   5. Return { session_id, events } as JSON
//!
//! The claude binary reads its API key from ANTHROPIC_API_KEY, which we inject
//! per-spawn — exactly the iron-proxy / centaur credential-injection pattern,
//! without needing a MITM TLS layer.

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

// ── Request / response ────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ExecuteRequest {
    /// Natural-language prompt for this turn.
    pub prompt: String,
    /// Working directory for the claude subprocess.
    /// Defaults to the proxy's own cwd if omitted.
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
    // 1. Auth
    let Some(token) = bearer_token(&headers) else {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    };
    let session = match state.sessions.get(&token) {
        Ok(Some(s)) => s,
        Ok(None) => return (StatusCode::UNAUTHORIZED, "unauthorized").into_response(),
        Err(e) => {
            tracing::warn!(error = %e, "session lookup failed");
            return (StatusCode::INTERNAL_SERVER_ERROR, "session lookup failed").into_response();
        }
    };

    // 2. Resolve Anthropic key from vault
    let api_key = match ks_vault::sqlite::lookup_upstream_key(
        &state.vault_db_path,
        &session.user_id,
        "anthropic",
    ) {
        Ok(k) => k,
        Err(ks_vault::SqliteVaultError::NotFound { .. }) => {
            // Fall back to platform env key
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
            tracing::warn!(error = %e, user = %session.user_id, "vault lookup failed");
            return (StatusCode::INTERNAL_SERVER_ERROR, "vault lookup failed").into_response();
        }
    };

    // 3. Build ThreadState
    let cwd: PathBuf = req
        .cwd
        .as_deref()
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/")));

    // Use the caller-supplied session_id for resume; otherwise mint a new one
    // from user_id + timestamp so it's stable across retries.
    let ks_session_id = req
        .session_id
        .clone()
        .unwrap_or_else(|| format!("ks-{}", session.user_id));

    let mut thread_state = ThreadState::new(ks_session_id, cwd);
    thread_state.model = req.model.clone();

    // If the caller passed session_id, treat it as the harness (claude-native) session
    // so we send --resume on the very first turn of this HTTP request.
    if let Some(ref sid) = req.session_id {
        thread_state.harness_session_id = Some(sid.clone());
    }

    // 4. Run the harness turn
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
