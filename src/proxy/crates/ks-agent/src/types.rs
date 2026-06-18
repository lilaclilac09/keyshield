use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;

// ── Wire format (stdin to claude) ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct InputContent {
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

impl InputContent {
    pub fn text(s: impl Into<String>) -> Self {
        Self { kind: "text".into(), text: Some(s.into()) }
    }
}

// ── Normalized events (what the caller receives) ─────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum NormalizedEvent {
    SessionStarted { session_id: Option<String> },
    AgentMessageStarted { item_id: String, stop_reason: Option<String> },
    AssistantMessage { partial: bool, stop_reason: Option<String>, content: Vec<NormalizedContent> },
    AgentTextDelta { item_id: String, delta: String },
    ReasoningTextDelta { item_id: String, delta: String },
    ToolResults { results: Vec<NormalizedToolResult> },
    Result { error: Option<String> },
    Error { message: String },
    Ignored,
}

impl NormalizedEvent {
    pub fn session_id(&self) -> Option<&str> {
        if let Self::SessionStarted { session_id: Some(sid) } = self { Some(sid) } else { None }
    }

    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Result { .. } | Self::Error { .. })
    }

    pub fn is_assistant_end_turn(&self) -> bool {
        matches!(
            self,
            Self::AssistantMessage { partial: false, stop_reason: Some(r), .. } if r == "end_turn"
        )
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum NormalizedContent {
    AgentText { item_id: String, text: String },
    ReasoningText { item_id: String, text: String },
    ToolUse { raw_id: String, tool: String, arguments: Value },
}

#[derive(Debug, Clone, Serialize)]
pub struct NormalizedToolResult {
    pub tool_use_id: String,
    pub content: String,
    pub is_error: bool,
    pub exit_code: Option<i32>,
}

// ── Per-turn state ────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ThreadState {
    /// Keyshield session ID used as the claude --session-id on first turn.
    pub session_id: String,
    /// Claude's own session ID, returned in SessionStarted; used with --resume.
    pub harness_session_id: Option<String>,
    pub cwd: PathBuf,
    pub model: Option<String>,
    pub completed_turns: u32,
}

impl ThreadState {
    pub fn new(session_id: impl Into<String>, cwd: PathBuf) -> Self {
        Self {
            session_id: session_id.into(),
            harness_session_id: None,
            cwd,
            model: None,
            completed_turns: 0,
        }
    }
}

// ── Anthropic stream events (claude stdout NDJSON) ────────────────────────────

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AnthropicRawStreamEvent {
    MessageStart { message: MessageStartBody },
    ContentBlockStart { index: usize, content_block: ContentBlock },
    ContentBlockDelta { index: usize, delta: ContentDelta },
    ContentBlockStop { index: usize },
    MessageDelta { delta: MessageDeltaBody },
    MessageStop,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MessageStartBody {
    pub id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentBlock {
    Text { text: String },
    ToolUse { id: String, name: String },
    Thinking { thinking: String },
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentDelta {
    TextDelta { text: String },
    InputJsonDelta { partial_json: String },
    ThinkingDelta { thinking: String },
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MessageDeltaBody {
    pub stop_reason: Option<String>,
}

// ── Top-level claude stream event ─────────────────────────────────────────────

/// claude --output-format stream-json emits one of these per stdout line.
/// The `system` variant carries the session_id on start.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AnthropicStreamEvent {
    System(SystemPayload),
    Assistant(AssistantPayload),
    User(UserPayload),
    Result(ResultPayload),
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SystemPayload {
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssistantPayload {
    pub message: AssistantMessage,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssistantMessage {
    pub id: Option<String>,
    #[serde(default)]
    pub content: Vec<AssistantContentBlock>,
    pub stop_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AssistantContentBlock {
    Text { text: String },
    ToolUse { id: String, name: String, input: Value },
    Thinking { thinking: String },
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UserPayload {
    pub message: UserMessage,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UserMessage {
    #[serde(default)]
    pub content: Vec<UserContentBlock>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum UserContentBlock {
    ToolResult { tool_use_id: String, content: Value, is_error: Option<bool> },
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ResultPayload {
    pub subtype: Option<String>,
    pub error: Option<String>,
}
