//! Delegated-token ACL — mirrors `src/backend/auth/delegation.py`.
//!
//! Missing usage/agents DBs fail open (so integration tests and a
//! standalone ks-proxy still work). When the file is present, unknown or
//! revoked agents fail closed.

use std::path::Path;

use axum::http::StatusCode;
use rusqlite::OptionalExtension;

use crate::AppState;

const HELIUS_ALIASES: &[&str] = &["helius", "helius-rpc", "helius-das", "helius-enhanced"];

pub fn check_proxy_access(
    state: &AppState,
    session: &ks_session::Session,
    upstream: &str,
    path: &str,
) -> Result<(), (StatusCode, String)> {
    if let Some(aid) = session.aid {
        if agent_is_revoked(state, aid) {
            return Err((StatusCode::UNAUTHORIZED, "agent revoked".into()));
        }
    }

    if let Some(ref provider) = session.provider {
        if !upstream_matches(provider, upstream) {
            return Err((
                StatusCode::FORBIDDEN,
                format!("token scoped to provider {provider}"),
            ));
        }
    }

    if let Some(ref scopes) = session.scope {
        if !scope_allows(scopes, upstream, path) {
            return Err((
                StatusCode::FORBIDDEN,
                "token scope does not allow this upstream".into(),
            ));
        }
    }

    if let Some(cap) = session.spend_cap_usd {
        let spent = spent_usd(state, &session.user_id, session.aid, session.iat);
        if spent >= cap {
            return Err((StatusCode::TOO_MANY_REQUESTS, "spend cap exceeded".into()));
        }
    }

    Ok(())
}

fn upstream_matches(constraint: &str, upstream: &str) -> bool {
    let c = constraint.trim().to_ascii_lowercase();
    let u = upstream.trim().to_ascii_lowercase();
    if c == "*" || c == "all" {
        return true;
    }
    if c == u {
        return true;
    }
    c == "helius" && HELIUS_ALIASES.contains(&u.as_str())
}

fn is_path_scope(item: &str) -> bool {
    item.contains('/') || item.contains('.') || item.contains(':')
}

pub fn scope_allows(scopes: &[String], upstream: &str, path: &str) -> bool {
    if scopes.is_empty() || scopes.iter().any(|s| s == "*") {
        return true;
    }
    let path_l = format!("/{}", path.trim_start_matches('/')).to_ascii_lowercase();
    for item in scopes {
        if upstream_matches(item, upstream) {
            return true;
        }
        let needle = item.trim().to_ascii_lowercase();
        if !needle.is_empty() && is_path_scope(&needle) && path_l.contains(&needle) {
            return true;
        }
    }
    false
}

fn open_ro(path: &Path) -> Option<rusqlite::Connection> {
    if !path.exists() {
        return None;
    }
    rusqlite::Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).ok()
}

fn agent_is_revoked(state: &AppState, aid: i64) -> bool {
    let Some(ref db_path) = state.agents_db_path else {
        return false;
    };
    let Some(conn) = open_ro(db_path) else {
        return false;
    };
    let row: Option<(String, String)> = conn
        .query_row(
            "SELECT owner_wallet, pubkey_b58 FROM agent_keys WHERE id = ?",
            [aid],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .ok()
        .flatten();
    let Some((owner, pubkey)) = row else {
        return true;
    };
    let crl: Option<i32> = conn
        .query_row(
            "SELECT 1 FROM agent_revocations WHERE owner_wallet = ? AND pubkey_b58 = ? LIMIT 1",
            rusqlite::params![owner, pubkey],
            |r| r.get(0),
        )
        .optional()
        .ok()
        .flatten();
    crl.is_some()
}

fn spent_usd(state: &AppState, user_id: &str, aid: Option<i64>, since: Option<i64>) -> f64 {
    let Some(ref db_path) = state.usage_db_path else {
        return 0.0;
    };
    let Some(conn) = open_ro(db_path) else {
        return 0.0;
    };
    let mut sql = String::from("SELECT COALESCE(SUM(cost_usd), 0) FROM usage_log WHERE user_id = ?");
    let mut vals: Vec<rusqlite::types::Value> = vec![user_id.to_string().into()];
    if let Some(agent_id) = aid {
        sql.push_str(" AND agent_id = ?");
        vals.push(agent_id.into());
    }
    if let Some(ts) = since {
        sql.push_str(" AND ts >= ?");
        vals.push(ts.into());
    }
    match conn.query_row(&sql, rusqlite::params_from_iter(vals), |r| r.get::<_, f64>(0)) {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!(error = %e, "spend-cap usage lookup failed; treating as 0");
            0.0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_scope_requires_delimiter() {
        let scopes = vec!["v1".to_string()];
        assert!(!scope_allows(&scopes, "openai", "v1/models"));
        let scopes = vec!["/v1/models".to_string()];
        assert!(scope_allows(&scopes, "openai", "v1/models"));
        let scopes = vec!["openai".to_string()];
        assert!(scope_allows(&scopes, "openai", "v1/models"));
    }
}
