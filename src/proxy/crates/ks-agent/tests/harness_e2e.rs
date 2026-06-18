//! End-to-end harness test with a fake `claude`.
//!
//! Validates the full `run_turn` loop — write NDJSON stdin, read stream-json
//! stdout, normalise to events, extract session_id, and send `--resume` on the
//! second turn — without a real claude install or API key. The fake binary is
//! a shell script that records its argv and emits a fixed stream-json reply.

use std::io::Write;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;

use ks_agent::{InputContent, NormalizedEvent, ThreadState};

/// Write an executable fake `claude` that:
///   1. appends its argv to $KS_FAKE_ARGS_FILE (so we can assert on --resume)
///   2. drains stdin (the user turn)
///   3. emits system → assistant → result stream-json
fn write_fake_claude(dir: &Path) -> std::path::PathBuf {
    let path = dir.join("claude");
    let mut f = std::fs::File::create(&path).unwrap();
    f.write_all(
        br#"#!/usr/bin/env bash
echo "$@" >> "$KS_FAKE_ARGS_FILE"
cat > /dev/null
echo '{"type":"system","session_id":"sess-abc"}'
echo '{"type":"assistant","message":{"id":"msg_1","content":[{"type":"text","text":"hello from fake claude"}],"stop_reason":"end_turn"}}'
echo '{"type":"result","subtype":"success"}'
"#,
    )
    .unwrap();
    let mut perms = std::fs::metadata(&path).unwrap().permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(&path, perms).unwrap();
    path
}

#[tokio::test]
async fn run_turn_normalizes_and_resumes() {
    let dir = tempfile::tempdir().unwrap();
    let fake = write_fake_claude(dir.path());
    let args_file = dir.path().join("args.log");

    // Point the runner at the fake; the fake records argv here.
    std::env::set_var("KS_CLAUDE_BIN", &fake);
    std::env::set_var("KS_FAKE_ARGS_FILE", &args_file);

    let mut state = ThreadState::new("ks-session-1", dir.path().to_path_buf());

    // ── Turn 1 (cold): expects --session-id, not --resume ──────────────────
    let out = ks_agent::run_turn(
        "fake-key",
        &mut state,
        vec![InputContent::text("explain this repo")],
    )
    .await
    .expect("turn 1 runs");

    assert_eq!(out.session_id.as_deref(), Some("sess-abc"));
    assert_eq!(state.harness_session_id.as_deref(), Some("sess-abc"));
    assert_eq!(state.completed_turns, 1);

    // The assistant text made it through normalization.
    let text = out.events.iter().find_map(|e| match e {
        NormalizedEvent::AgentTextDelta { delta, .. } => Some(delta.clone()),
        _ => None,
    });
    assert_eq!(text.as_deref(), Some("hello from fake claude"));
    // Terminal result event present.
    assert!(out.events.iter().any(|e| matches!(e, NormalizedEvent::Result { .. })));

    // ── Turn 2 (warm): must carry --resume sess-abc ────────────────────────
    let _ = ks_agent::run_turn(
        "fake-key",
        &mut state,
        vec![InputContent::text("now write tests")],
    )
    .await
    .expect("turn 2 runs");
    assert_eq!(state.completed_turns, 2);

    let logged = std::fs::read_to_string(&args_file).unwrap();
    let lines: Vec<&str> = logged.lines().collect();
    assert_eq!(lines.len(), 2, "two invocations recorded");
    assert!(
        lines[0].contains("--session-id ks-session-1"),
        "cold turn sets --session-id, got: {}",
        lines[0]
    );
    assert!(
        lines[1].contains("--resume sess-abc"),
        "warm turn resumes the native session, got: {}",
        lines[1]
    );

    std::env::remove_var("KS_CLAUDE_BIN");
    std::env::remove_var("KS_FAKE_ARGS_FILE");
}
