use std::process::Stdio;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter};

use crate::{
    normalizer::ClaudeNormalizer,
    types::{AnthropicStreamEvent, InputContent, NormalizedEvent, ThreadState},
    AgentError, Result,
};

const TURN_TIMEOUT_SECS: u64 = 1800;

pub struct TurnOutput {
    pub events: Vec<NormalizedEvent>,
    /// Claude's native session ID from the first SessionStarted event.
    pub session_id: Option<String>,
}

/// Run one turn of Claude Code through the harness.
///
/// - `api_key`: real Anthropic key from the vault (injected into subprocess env)
/// - `state`: per-session state; updated in-place with new session_id + turn count
/// - `content`: user input for this turn
pub async fn run_turn(
    api_key: &str,
    state: &mut ThreadState,
    content: Vec<InputContent>,
) -> Result<TurnOutput> {
    let mut cmd = build_command(api_key, state);

    let mut child = cmd.spawn()?;

    let stdin = child.stdin.take().ok_or_else(|| AgentError::Process("no stdin".into()))?;
    let stdout = child.stdout.take().ok_or_else(|| AgentError::Process("no stdout".into()))?;

    // Write NDJSON input then close stdin so claude sees EOF.
    {
        let mut w = BufWriter::new(stdin);
        let payload = build_stdin_payload(&content)?;
        w.write_all(&payload).await?;
        w.flush().await?;
    }

    let events = tokio::time::timeout(
        Duration::from_secs(TURN_TIMEOUT_SECS),
        collect_events(stdout),
    )
    .await
    .map_err(|_| AgentError::Timeout { secs: TURN_TIMEOUT_SECS })??;

    let _ = child.wait().await;

    let session_id = events.iter().find_map(|e| e.session_id().map(str::to_string));
    if let Some(ref sid) = session_id {
        state.harness_session_id = Some(sid.clone());
    }
    state.completed_turns += 1;

    Ok(TurnOutput { events, session_id })
}

// ─── helpers ─────────────────────────────────────────────────────────────────

fn build_command(api_key: &str, state: &ThreadState) -> tokio::process::Command {
    let mut cmd = tokio::process::Command::new("claude");
    cmd.current_dir(&state.cwd)
        .env("ANTHROPIC_API_KEY", api_key)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        // Discard stderr to prevent pipe backpressure (mirrors centaur drain_stderr).
        .stderr(Stdio::null())
        // Core flags: non-interactive streaming JSON mode
        .arg("--print")
        .arg("--input-format").arg("stream-json")
        .arg("--output-format").arg("stream-json")
        .arg("--verbose")
        .arg("--include-partial-messages")
        .arg("--dangerously-skip-permissions");

    if let Some(ref model) = state.model {
        cmd.arg("--model").arg(model);
    }

    // First turn: set --session-id so the CLI tracks this conversation.
    // Subsequent turns: use --resume <native_session_id> to continue.
    match &state.harness_session_id {
        Some(sid) => {
            cmd.arg("--resume").arg(sid);
        }
        None => {
            cmd.arg("--session-id").arg(&state.session_id);
        }
    }

    cmd
}

fn build_stdin_payload(content: &[InputContent]) -> Result<Vec<u8>> {
    // claude --input-format stream-json expects one JSON object per line.
    // We write a single user turn: {"role":"user","content":[...]}
    let turn = serde_json::json!({
        "role": "user",
        "content": content,
    });
    let mut payload = serde_json::to_vec(&turn)?;
    payload.push(b'\n');
    Ok(payload)
}

async fn collect_events(stdout: tokio::process::ChildStdout) -> Result<Vec<NormalizedEvent>> {
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    let mut normalizer = ClaudeNormalizer::default();
    let mut all_events = Vec::new();

    loop {
        line.clear();
        let n = reader.read_line(&mut line).await?;
        if n == 0 {
            break;
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let event: AnthropicStreamEvent = match serde_json::from_str(trimmed) {
            Ok(e) => e,
            Err(err) => {
                tracing::warn!("ks-agent: JSON parse error: {err}");
                continue;
            }
        };

        let normalized = normalizer.normalize(event);
        let is_terminal = normalized.iter().any(|e| e.is_terminal());
        all_events.extend(normalized);

        if is_terminal {
            break;
        }
    }

    Ok(all_events)
}
