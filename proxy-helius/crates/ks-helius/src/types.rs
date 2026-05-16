///! Typed response structs for Helius + Solana RPC methods.
///!
///! Only the fields used by callers are included. Helius often returns
///! extra fields — `#[serde(default)]` + `flatten` absorbs them.

use serde::{Deserialize, Serialize};

// ─── Solana RPC core ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenAmount {
    pub amount: String,
    pub decimals: u8,
    #[serde(rename = "uiAmount")]
    pub ui_amount: Option<f64>,
    #[serde(rename = "uiAmountString")]
    pub ui_amount_string: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfirmedSignatureInfo {
    pub signature: String,
    pub slot: u64,
    #[serde(rename = "blockTime")]
    pub block_time: Option<i64>,
    pub err: Option<serde_json::Value>,
    pub memo: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Blockhash {
    pub blockhash: String,
    #[serde(rename = "lastValidBlockHeight")]
    pub last_valid_block_height: Option<u64>,
}

// ─── Helius DAS ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Asset {
    pub id: String,
    pub interface: Option<String>,
    pub content: Option<serde_json::Value>,
    pub authorities: Option<Vec<serde_json::Value>>,
    pub compression: Option<serde_json::Value>,
    pub grouping: Option<Vec<serde_json::Value>>,
    pub royalty: Option<serde_json::Value>,
    pub creators: Option<Vec<serde_json::Value>>,
    pub ownership: Option<serde_json::Value>,
    pub supply: Option<serde_json::Value>,
    pub mutable: Option<bool>,
    pub burnt: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetAssetResponse {
    pub result: Asset,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetAssetsByOwnerResponse {
    pub total: u64,
    pub limit: u64,
    pub page: u64,
    pub items: Vec<Asset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchAssetsResponse {
    pub total: u64,
    pub limit: u64,
    pub page: Option<u64>,
    pub cursor: Option<String>,
    pub items: Vec<Asset>,
}

// ─── Helius Enhanced APIs ───────────────────────────────────────────────────

/// A parsed / enriched transaction from `getTransactionsForAddress`
/// or `parseTransactions`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnrichedTransaction {
    pub signature: String,
    pub slot: Option<u64>,
    #[serde(rename = "blockTime")]
    pub block_time: Option<i64>,
    #[serde(rename = "type")]
    pub tx_type: Option<String>,
    pub description: Option<String>,
    pub fee: Option<u64>,
    #[serde(rename = "feePayer")]
    pub fee_payer: Option<String>,
    #[serde(rename = "nativeTransfers")]
    pub native_transfers: Option<Vec<serde_json::Value>>,
    #[serde(rename = "tokenTransfers")]
    pub token_transfers: Option<Vec<serde_json::Value>>,
    #[serde(rename = "accountData")]
    pub account_data: Option<Vec<serde_json::Value>>,
    pub instructions: Option<Vec<serde_json::Value>>,
    pub events: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriorityFeeEstimate {
    #[serde(rename = "priorityFeeEstimate")]
    pub priority_fee_estimate: Option<f64>,
    #[serde(rename = "priorityFeeLevels")]
    pub priority_fee_levels: Option<PriorityFeeLevels>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriorityFeeLevels {
    pub min: Option<f64>,
    pub low: Option<f64>,
    pub medium: Option<f64>,
    pub high: Option<f64>,
    #[serde(rename = "veryHigh")]
    pub very_high: Option<f64>,
    #[serde(rename = "unsafeMax")]
    pub unsafe_max: Option<f64>,
}
