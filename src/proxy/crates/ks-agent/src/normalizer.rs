use std::collections::HashMap;
use serde_json::Value;

use crate::types::{
    AnthropicStreamEvent, AssistantContentBlock, NormalizedContent, NormalizedEvent,
    NormalizedToolResult, UserContentBlock,
};

/// Stateful normalizer for claude --output-format stream-json.
///
/// claude emits complete assistant/user messages (not incremental deltas),
/// so normalizer state is minimal: track the current message id for item_id
/// stability across partial vs final flush.
#[derive(Default)]
pub struct ClaudeNormalizer {
    seen_message_ids: HashMap<String, u32>,
}

impl ClaudeNormalizer {
    pub fn normalize(&mut self, event: AnthropicStreamEvent) -> Vec<NormalizedEvent> {
        match event {
            AnthropicStreamEvent::System(s) => {
                vec![NormalizedEvent::SessionStarted { session_id: s.session_id }]
            }

            AnthropicStreamEvent::Assistant(a) => {
                let msg = a.message;
                let raw_id = msg.id.unwrap_or_default();
                let item_id = stable_item_id(&raw_id);

                let count = self.seen_message_ids.entry(item_id.clone()).or_insert(0);
                let partial = *count == 0; // first time = streaming partial
                *count += 1;

                let mut content = Vec::new();
                for block in msg.content {
                    match block {
                        AssistantContentBlock::Text { text } => {
                            content.push(NormalizedContent::AgentText {
                                item_id: item_id.clone(),
                                text,
                            });
                        }
                        AssistantContentBlock::Thinking { thinking } => {
                            content.push(NormalizedContent::ReasoningText {
                                item_id: item_id.clone(),
                                text: thinking,
                            });
                        }
                        AssistantContentBlock::ToolUse { id, name, input } => {
                            content.push(NormalizedContent::ToolUse {
                                raw_id: id,
                                tool: name,
                                arguments: input,
                            });
                        }
                        AssistantContentBlock::Unknown => {}
                    }
                }

                let mut out = vec![NormalizedEvent::AgentMessageStarted {
                    item_id: item_id.clone(),
                    stop_reason: msg.stop_reason.clone(),
                }];

                // Emit text deltas as individual AgentTextDelta events
                for c in &content {
                    if let NormalizedContent::AgentText { item_id: id, text } = c {
                        out.push(NormalizedEvent::AgentTextDelta {
                            item_id: id.clone(),
                            delta: text.clone(),
                        });
                    }
                    if let NormalizedContent::ReasoningText { item_id: id, text } = c {
                        out.push(NormalizedEvent::ReasoningTextDelta {
                            item_id: id.clone(),
                            delta: text.clone(),
                        });
                    }
                }

                out.push(NormalizedEvent::AssistantMessage {
                    partial,
                    stop_reason: msg.stop_reason,
                    content,
                });

                out
            }

            AnthropicStreamEvent::User(u) => {
                let results: Vec<NormalizedToolResult> = u
                    .message
                    .content
                    .into_iter()
                    .filter_map(|block| match block {
                        UserContentBlock::ToolResult { tool_use_id, content, is_error } => {
                            let text = content_to_string(content);
                            let exit_code = parse_exit_code(&text);
                            Some(NormalizedToolResult {
                                tool_use_id,
                                content: text,
                                is_error: is_error.unwrap_or(false),
                                exit_code,
                            })
                        }
                        UserContentBlock::Unknown => None,
                    })
                    .collect();

                if results.is_empty() {
                    vec![NormalizedEvent::Ignored]
                } else {
                    vec![NormalizedEvent::ToolResults { results }]
                }
            }

            AnthropicStreamEvent::Result(r) => {
                let is_error = r.subtype.as_deref() == Some("error");
                vec![NormalizedEvent::Result {
                    error: if is_error { r.error } else { None },
                }]
            }

            AnthropicStreamEvent::Unknown => vec![NormalizedEvent::Ignored],
        }
    }
}

fn stable_item_id(raw: &str) -> String {
    raw.replace(['/', ' ', ':'], "_")
}

fn content_to_string(v: Value) -> String {
    match v {
        Value::String(s) => s,
        Value::Array(arr) => arr
            .into_iter()
            .filter_map(|item| {
                if let Value::Object(o) = item {
                    o.get("text").and_then(|t| t.as_str()).map(str::to_string)
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join(""),
        other => other.to_string(),
    }
}

fn parse_exit_code(text: &str) -> Option<i32> {
    // Claude Code encodes exit code in tool result text as "Exit code: N"
    for line in text.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("Exit code: ") {
            return rest.trim().parse().ok();
        }
    }
    None
}
