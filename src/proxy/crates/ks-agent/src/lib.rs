pub mod normalizer;
pub mod runner;
pub mod types;

pub use runner::{run_turn, TurnOutput};
pub use types::{InputContent, NormalizedEvent, NormalizedContent, NormalizedToolResult, ThreadState};

#[derive(thiserror::Error, Debug)]
pub enum AgentError {
    #[error("I/O: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("process: {0}")]
    Process(String),
    #[error("turn timed out after {secs}s")]
    Timeout { secs: u64 },
}

pub type Result<T> = std::result::Result<T, AgentError>;
