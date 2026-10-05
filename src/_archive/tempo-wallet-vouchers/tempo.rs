//! ARCHIVE ONLY — not compiled into ks-proxy.
//! Live 402 skip is an open Solana USDC MPP stream. See README.md in this folder.
//!
//! Tempo wallet session vouchers skip the x402 402 round trip.
//!
//! Current payment specs this follows:
//! - draft-httpauth-payment-01: the session bearer stays in `Authorization`,
//!   and the wallet credential travels in `Payment-Authorization` because
//!   the challenge sets `header="Payment-Authorization"`.
//! - draft-tempo-session-00, `sessionProtocol: "v2"`: TIP-1034 channel
//!   reserve. Domain `"TIP20 Channel Reserve"`, voucher type
//!   `Voucher(bytes32 channelId,uint96 cumulativeAmount)`.
//!
//! A wallet opens the channel once, then sends a cumulative EIP-712 voucher
//! on later calls. The proxy checks method, echoed header, payee, escrow,
//! currency, chain, channel id, low-s signature, and monotonic amount, then
//! forwards on that same request.
//!
//! `KS_TEMPO_PAYEE` is required. Escrow defaults to the TIP-1034 precompile
//! `0x4D50500000000000000000000000000000000000`. Currency defaults to
//! pathUSD `0x20c0000000000000000000000000000000000000`. Chain defaults to
//! Tempo mainnet `4217`.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use k256::ecdsa::{RecoveryId, Signature, VerifyingKey};
use serde_json::Value;
use sha3::{Digest, Keccak256};

const DOMAIN_TYPE: &str = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";
const VOUCHER_TYPE: &str = "Voucher(bytes32 channelId,uint96 cumulativeAmount)";
const DOMAIN_NAME: &str = "TIP20 Channel Reserve";
const DOMAIN_VERSION: &str = "1";
const MAX_U96: u128 = (1u128 << 96) - 1;
/// TIP-1034 channel reserve precompile (ASCII `MPP`).
pub const CANONICAL_ESCROW: &str = "0x4d50500000000000000000000000000000000000";
/// pathUSD on Tempo, the currency advertised in the session challenge.
pub const PATH_USD: &str = "0x20c0000000000000000000000000000000000000";
pub const TEMPO_CHAIN_ID: u64 = 4217;
/// secp256k1 n/2. A signature with s above this is not low-s.
const SECP256K1_HALF_N: [u8; 32] = [
    0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0x5d, 0x57, 0x6e, 0x73, 0x57, 0xa4, 0x50, 0x1d, 0xdf, 0xe9, 0x2f, 0x46, 0x68, 0x1b, 0x20, 0xa0,
];

/// What this proxy will accept as a Tempo session payment.
#[derive(Clone, Debug)]
pub struct TempoLane {
    pub payee: String,
    pub escrow: String,
    pub currency: String,
    pub chain_id: u64,
}

/// `KS_TEMPO_PAYEE` turns the lane on. The other fields fall back to the
/// current TIP-1034 / pathUSD / chain 4217 defaults.
pub fn config_from_env() -> Option<TempoLane> {
    let payee = std::env::var("KS_TEMPO_PAYEE").ok().filter(|s| !s.is_empty())?;
    let escrow = std::env::var("KS_TEMPO_ESCROW")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| CANONICAL_ESCROW.to_string());
    let currency = std::env::var("KS_TEMPO_CURRENCY")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| PATH_USD.to_string());
    let chain_id = std::env::var("KS_TEMPO_CHAIN_ID")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(TEMPO_CHAIN_ID);
    Some(TempoLane {
        payee,
        escrow,
        currency,
        chain_id,
    })
}

/// `WWW-Authenticate` challenge a Tempo wallet answers with a v2 voucher.
/// `header="Payment-Authorization"` keeps the KeyShield bearer in `Authorization`.
pub fn www_authenticate(lane: &TempoLane) -> String {
    let request = serde_json::json!({
        "amount": "10000",
        "currency": lane.currency,
        "recipient": lane.payee,
        "methodDetails": {
            "escrowContract": lane.escrow,
            "chainId": lane.chain_id,
            "sessionProtocol": "v2"
        }
    });
    let request_b64 = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&request).unwrap_or_default());
    format!(
        "Payment id=\"ks-tempo-session\", method=\"tempo\", intent=\"session\", header=\"Payment-Authorization\", request=\"{request_b64}\""
    )
}

/// Highest accepted cumulative amount per channel, remembered on disk so a
/// restart cannot treat an old voucher as a new payment.
pub struct VoucherBook {
    mem: std::sync::Mutex<std::collections::HashMap<String, u128>>,
    db_path: std::path::PathBuf,
}

impl VoucherBook {
    pub fn new(db_path: std::path::PathBuf) -> Self {
        Self {
            mem: std::sync::Mutex::new(std::collections::HashMap::new()),
            db_path,
        }
    }

    fn accept(&self, channel: &str, amount: u128) -> bool {
        let Ok(mut mem) = self.mem.lock() else {
            return false;
        };
        let known = mem.get(channel).copied().or_else(|| read_cumulative(&self.db_path, channel));
        if let Some(prev) = known {
            if amount < prev {
                mem.insert(channel.to_string(), prev);
                return false;
            }
            if amount == prev {
                mem.insert(channel.to_string(), prev);
                return true;
            }
        }
        if !write_cumulative(&self.db_path, channel, amount) {
            return false;
        }
        mem.insert(channel.to_string(), amount);
        true
    }
}

/// `true` when `header_value` is a v2 Tempo session voucher for `lane`.
/// A later voucher for the same channel must not go backwards.
pub fn session_voucher_pays(header_value: &str, lane: &TempoLane, book: &VoucherBook) -> bool {
    let Some(cred) = decode_credential(header_value) else {
        return false;
    };
    let Some(checked) = check_voucher(&cred, lane) else {
        return false;
    };
    book.accept(&checked.channel_key, checked.amount)
}

struct Checked {
    channel_key: String,
    amount: u128,
}

fn check_voucher(cred: &Value, lane: &TempoLane) -> Option<Checked> {
    let challenge = cred.get("challenge")?;
    if challenge.get("method")?.as_str()? != "tempo" {
        return None;
    }
    if challenge.get("intent")?.as_str()? != "session" {
        return None;
    }
    // draft-httpauth-payment-01: the client echoes the header the challenge selected.
    if challenge.get("header").and_then(|v| v.as_str()) != Some("Payment-Authorization") {
        return None;
    }
    let payload = cred.get("payload")?;
    if payload.get("action")?.as_str()? != "voucher" {
        return None;
    }

    let request = decode_request(challenge.get("request")?.as_str()?)?;
    let details = request.get("methodDetails")?;
    if details.get("sessionProtocol").and_then(|v| v.as_str()) != Some("v2") {
        return None;
    }
    let escrow = parse_address(details.get("escrowContract")?.as_str()?)?;
    let chain_id = details.get("chainId").and_then(|v| v.as_u64())?;
    if chain_id != lane.chain_id || !addr_eq(&escrow, &lane.escrow) {
        return None;
    }

    let descriptor = payload.get("descriptor")?;
    let payer = parse_address(descriptor.get("payer")?.as_str()?)?;
    let payee = parse_address(descriptor.get("payee")?.as_str()?)?;
    let operator = parse_address(descriptor.get("operator")?.as_str()?)?;
    let token = parse_address(descriptor.get("token")?.as_str()?)?;
    let salt = parse_bytes32(descriptor.get("salt")?.as_str()?)?;
    let signer = parse_address(descriptor.get("authorizedSigner")?.as_str()?)?;
    let nonce = parse_bytes32(descriptor.get("expiringNonceHash")?.as_str()?)?;
    // No operator is advertised, so the descriptor operator is the zero address.
    if operator != [0u8; 20] || !addr_eq(&payee, &lane.payee) {
        return None;
    }
    let currency = parse_address(request.get("currency")?.as_str()?)?;
    if currency != token || !addr_eq(&currency, &lane.currency) {
        return None;
    }

    let channel = parse_bytes32(payload.get("channelId")?.as_str()?)?;
    let derived = channel_id(
        &payer, &payee, &operator, &token, &salt, &signer, &nonce, &escrow, chain_id,
    );
    if channel != derived {
        return None;
    }

    let amount = parse_u96(payload.get("cumulativeAmount")?.as_str()?)?;
    let signature = parse_signature(payload.get("signature")?.as_str()?)?;
    if !low_s(&signature) {
        return None;
    }
    let digest = voucher_signing_hash(&channel, amount, &escrow, chain_id);
    let recovered = recover_address(&digest, &signature)?;
    let expected_signer = if signer == [0u8; 20] { payer } else { signer };
    if recovered != expected_signer {
        return None;
    }

    Some(Checked {
        channel_key: hex_encode(&channel),
        amount,
    })
}

fn read_cumulative(path: &std::path::Path, channel: &str) -> Option<u128> {
    let conn = rusqlite::Connection::open(path).ok()?;
    let text: String = conn
        .query_row(
            "SELECT cumulative FROM tempo_vouchers WHERE channel_id = ?1",
            [channel],
            |row| row.get(0),
        )
        .ok()?;
    text.parse().ok()
}

fn write_cumulative(path: &std::path::Path, channel: &str, amount: u128) -> bool {
    if let Some(parent) = path.parent() {
        if std::fs::create_dir_all(parent).is_err() {
            return false;
        }
    }
    let Ok(conn) = rusqlite::Connection::open(path) else {
        return false;
    };
    if conn
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS tempo_vouchers (
                channel_id TEXT PRIMARY KEY,
                cumulative TEXT NOT NULL
            );",
        )
        .is_err()
    {
        return false;
    }
    conn.execute(
        "INSERT INTO tempo_vouchers (channel_id, cumulative) VALUES (?1, ?2)
         ON CONFLICT(channel_id) DO UPDATE SET cumulative = excluded.cumulative",
        rusqlite::params![channel, amount.to_string()],
    )
    .is_ok()
}

fn low_s(signature: &[u8; 65]) -> bool {
    let s = &signature[32..64];
    s <= &SECP256K1_HALF_N[..]
}

/// EIP-712 signing hash for a v2 Tempo session voucher.
pub fn voucher_signing_hash(
    channel_id_bytes: &[u8; 32],
    amount: u128,
    escrow: &[u8; 20],
    chain_id: u64,
) -> [u8; 32] {
    let domain = keccak(&abi_words(&[
        keccak(DOMAIN_TYPE.as_bytes()),
        keccak(DOMAIN_NAME.as_bytes()),
        keccak(DOMAIN_VERSION.as_bytes()),
        word_u256(chain_id),
        word_address(escrow),
    ]));
    let struct_hash = keccak(&abi_words(&[
        keccak(VOUCHER_TYPE.as_bytes()),
        *channel_id_bytes,
        word_u128(amount),
    ]));
    let mut preimage = [0u8; 66];
    preimage[0] = 0x19;
    preimage[1] = 0x01;
    preimage[2..34].copy_from_slice(&domain);
    preimage[34..].copy_from_slice(&struct_hash);
    keccak(&preimage)
}

fn channel_id(
    payer: &[u8; 20],
    payee: &[u8; 20],
    operator: &[u8; 20],
    token: &[u8; 20],
    salt: &[u8; 32],
    signer: &[u8; 20],
    nonce: &[u8; 32],
    escrow: &[u8; 20],
    chain_id: u64,
) -> [u8; 32] {
    keccak(&abi_words(&[
        word_address(payer),
        word_address(payee),
        word_address(operator),
        word_address(token),
        *salt,
        word_address(signer),
        *nonce,
        word_address(escrow),
        word_u256(chain_id),
    ]))
}

fn decode_credential(header_value: &str) -> Option<Value> {
    let token = header_value.trim().strip_prefix("Payment ")?;
    if token.len() > 8192 {
        return None;
    }
    let raw = URL_SAFE_NO_PAD.decode(token).ok()?;
    serde_json::from_slice(&raw).ok()
}

fn decode_request(b64: &str) -> Option<Value> {
    let raw = URL_SAFE_NO_PAD.decode(b64).ok()?;
    serde_json::from_slice(&raw).ok()
}

fn recover_address(digest: &[u8; 32], signature: &[u8; 65]) -> Option<[u8; 20]> {
    let v = signature[64];
    if v != 27 && v != 28 {
        return None;
    }
    let sig = Signature::from_slice(&signature[..64]).ok()?;
    let recid = RecoveryId::from_byte(v - 27)?;
    let vk = VerifyingKey::recover_from_prehash(digest, &sig, recid).ok()?;
    let encoded = vk.to_encoded_point(false);
    let hash = keccak(&encoded.as_bytes()[1..]);
    let mut addr = [0u8; 20];
    addr.copy_from_slice(&hash[12..]);
    Some(addr)
}

fn parse_signature(s: &str) -> Option<[u8; 65]> {
    let bytes = decode_hex(s)?;
    if bytes.len() != 65 {
        return None;
    }
    let mut out = [0u8; 65];
    out.copy_from_slice(&bytes);
    Some(out)
}

fn parse_address(s: &str) -> Option<[u8; 20]> {
    let bytes = decode_hex(s)?;
    if bytes.len() != 20 {
        return None;
    }
    let mut out = [0u8; 20];
    out.copy_from_slice(&bytes);
    Some(out)
}

fn parse_bytes32(s: &str) -> Option<[u8; 32]> {
    let bytes = decode_hex(s)?;
    if bytes.len() != 32 {
        return None;
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes);
    Some(out)
}

fn parse_u96(s: &str) -> Option<u128> {
    let n: u128 = s.parse().ok()?;
    if n == 0 || n > MAX_U96 {
        return None;
    }
    Some(n)
}

fn addr_eq(addr: &[u8; 20], expected: &str) -> bool {
    parse_address(expected).is_some_and(|e| e == *addr)
}

fn decode_hex(s: &str) -> Option<Vec<u8>> {
    let hex = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X"))?;
    if hex.len() % 2 != 0 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).ok())
        .collect()
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(2 + bytes.len() * 2);
    out.push_str("0x");
    for b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

fn keccak(data: &[u8]) -> [u8; 32] {
    let mut hasher = Keccak256::new();
    hasher.update(data);
    hasher.finalize().into()
}

fn abi_words(words: &[[u8; 32]]) -> Vec<u8> {
    let mut out = Vec::with_capacity(words.len() * 32);
    for word in words {
        out.extend_from_slice(word);
    }
    out
}

fn word_address(addr: &[u8; 20]) -> [u8; 32] {
    let mut word = [0u8; 32];
    word[12..].copy_from_slice(addr);
    word
}

fn word_u256(n: u64) -> [u8; 32] {
    let mut word = [0u8; 32];
    word[24..].copy_from_slice(&n.to_be_bytes());
    word
}

fn word_u128(n: u128) -> [u8; 32] {
    let mut word = [0u8; 32];
    word[16..].copy_from_slice(&n.to_be_bytes());
    word
}

/// A Tempo `Payment-Authorization` value signed by a fixed test key.
/// Returns the header and the lane it pays.
#[doc(hidden)]
pub fn dev_session_voucher(amount: u128) -> (String, TempoLane) {
    use k256::ecdsa::{Signature as Sig, SigningKey};

    let payer = SigningKey::from_slice(&[0x11; 32]).expect("test key");
    let encoded = payer.verifying_key().to_encoded_point(false);
    let hash = keccak(&encoded.as_bytes()[1..]);
    let mut payer_addr = [0u8; 20];
    payer_addr.copy_from_slice(&hash[12..]);

    let payee = [0x22u8; 20];
    let operator = [0u8; 20];
    let token = [0x20u8; 20];
    let salt = [0xaau8; 32];
    let signer = [0u8; 20];
    let nonce = [0xbbu8; 32];
    let escrow = [0x33u8; 20];
    let chain_id = 4217u64;
    let channel = channel_id(
        &payer_addr, &payee, &operator, &token, &salt, &signer, &nonce, &escrow, chain_id,
    );
    let digest = voucher_signing_hash(&channel, amount, &escrow, chain_id);
    let (sig, recid): (Sig, RecoveryId) = payer.sign_prehash_recoverable(&digest).expect("sign");
    let mut sig_bytes = [0u8; 65];
    sig_bytes[..64].copy_from_slice(&sig.to_bytes());
    sig_bytes[64] = 27 + recid.to_byte();

    let request = serde_json::json!({
        "amount": "25",
        "currency": hex_encode(&token),
        "recipient": hex_encode(&payee),
        "methodDetails": {
            "escrowContract": hex_encode(&escrow),
            "chainId": chain_id,
            "sessionProtocol": "v2"
        }
    });
    let request_b64 = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&request).expect("request"));
    let cred = serde_json::json!({
        "challenge": {
            "id": "abc",
            "method": "tempo",
            "intent": "session",
            "header": "Payment-Authorization",
            "request": request_b64
        },
        "payload": {
            "action": "voucher",
            "channelId": hex_encode(&channel),
            "descriptor": {
                "payer": hex_encode(&payer_addr),
                "payee": hex_encode(&payee),
                "operator": hex_encode(&operator),
                "token": hex_encode(&token),
                "salt": hex_encode(&salt),
                "authorizedSigner": hex_encode(&signer),
                "expiringNonceHash": hex_encode(&nonce)
            },
            "cumulativeAmount": amount.to_string(),
            "signature": hex_encode(&sig_bytes)
        }
    });
    (
        format!(
            "Payment {}",
            URL_SAFE_NO_PAD.encode(serde_json::to_vec(&cred).expect("credential"))
        ),
        TempoLane {
            payee: hex_encode(&payee),
            escrow: hex_encode(&escrow),
            currency: hex_encode(&token),
            chain_id,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;

    fn book() -> (tempfile::TempDir, VoucherBook) {
        let dir = tempfile::tempdir().unwrap();
        let book = VoucherBook::new(dir.path().join("tempo_vouchers.db"));
        (dir, book)
    }

    #[test]
    fn signed_session_voucher_pays_and_rejects_a_lower_replay() {
        let (header, lane) = dev_session_voucher(250_000);
        let (_dir, book) = book();
        assert!(session_voucher_pays(&header, &lane, &book));
        assert!(session_voucher_pays(&header, &lane, &book));
        let (smaller, slane) = dev_session_voucher(100);
        assert!(!session_voucher_pays(&smaller, &slane, &book));
    }

    #[test]
    fn accepted_amount_survives_a_new_book_on_the_same_file() {
        let (header, lane) = dev_session_voucher(250_000);
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tempo_vouchers.db");
        assert!(session_voucher_pays(&header, &lane, &VoucherBook::new(path.clone())));
        let (smaller, slane) = dev_session_voucher(100);
        assert!(!session_voucher_pays(&smaller, &slane, &VoucherBook::new(path)));
    }

    #[test]
    fn wrong_payee_or_garbage_does_not_pay() {
        let (header, lane) = dev_session_voucher(250_000);
        let (_dir, book) = book();
        let mut wrong = lane.clone();
        wrong.payee = "0x0000000000000000000000000000000000000001".to_string();
        assert!(!session_voucher_pays(&header, &wrong, &book));
        assert!(!session_voucher_pays("Payment not-json", &lane, &book));
        assert!(!session_voucher_pays("Bearer nope", &lane, &book));
    }

    #[test]
    fn challenge_uses_v2_and_the_payment_authorization_header() {
        let lane = TempoLane {
            payee: "0x2222222222222222222222222222222222222222".to_string(),
            escrow: CANONICAL_ESCROW.to_string(),
            currency: PATH_USD.to_string(),
            chain_id: TEMPO_CHAIN_ID,
        };
        let header = www_authenticate(&lane);
        assert!(header.contains("method=\"tempo\""));
        assert!(header.contains("intent=\"session\""));
        assert!(header.contains("header=\"Payment-Authorization\""));
        let b64 = header.split("request=\"").nth(1).unwrap().trim_end_matches('"');
        let raw = URL_SAFE_NO_PAD.decode(b64).unwrap();
        let request: serde_json::Value = serde_json::from_slice(&raw).unwrap();
        assert_eq!(request["methodDetails"]["sessionProtocol"], "v2");
        assert_eq!(request["methodDetails"]["chainId"], TEMPO_CHAIN_ID);
        assert_eq!(request["currency"], PATH_USD);
        assert_eq!(request["methodDetails"]["escrowContract"], CANONICAL_ESCROW);
    }
}
