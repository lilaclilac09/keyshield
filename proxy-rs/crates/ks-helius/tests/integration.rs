/// Wiremock integration tests for HeliusClient.
///
/// Each test creates its own tempdir-backed disk cache so that parallel test
/// runs don't collide on the redb file (redb disallows multiple handles to the
/// same path).

use std::time::Duration;

use serde_json::json;
use wiremock::matchers::method;
use wiremock::{Mock, MockServer, ResponseTemplate};

use ks_helius::{HeliusClient, HeliusConfig, HeliusError};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Build a `HeliusClient` with a fresh per-test tmpdir cache.
/// Returns (client, TempDir) — caller must hold TempDir alive for test duration.
async fn make_client(server: &MockServer) -> (HeliusClient, tempfile::TempDir) {
    make_client_with_extra_cfg(server, |_| {}).await
}

async fn make_client_with_extra_cfg(
    server: &MockServer,
    mutate: impl FnOnce(&mut HeliusConfig),
) -> (HeliusClient, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    let mut cfg = HeliusConfig::default();
    cfg.disk_cache_path = dir.path().join("test.redb");
    mutate(&mut cfg);
    let client = HeliusClient::new("test_api_key", cfg, None)
        .await
        .expect("client init")
        .with_base_url(server.uri().as_str());
    (client, dir)
}

/// A minimal JSON-RPC success envelope wrapping `result`.
fn rpc_ok(result: serde_json::Value) -> serde_json::Value {
    json!({
        "jsonrpc": "2.0",
        "id": 1,
        "result": result
    })
}

// ─── getBalance ─────────────────────────────────────────────────────────────

#[tokio::test]
async fn get_balance_parses_lamports() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(rpc_ok(json!({"value": 999_000_000u64, "context": {}}))),
        )
        .expect(1)
        .mount(&server)
        .await;

    let (client, _dir) = make_client(&server).await;
    let bal = client.get_balance("9Wz...AWWM").await.unwrap();
    assert_eq!(bal, 999_000_000);
}

#[tokio::test]
async fn get_balance_second_call_hits_cache_not_upstream() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(rpc_ok(json!({"value": 500u64, "context": {}}))),
        )
        .expect(1) // only ONE upstream hit expected
        .mount(&server)
        .await;

    let (client, _dir) = make_client(&server).await;
    let _first  = client.get_balance("CacheMe").await.unwrap();
    let _second = client.get_balance("CacheMe").await.unwrap();
    // wiremock asserts .expect(1) at drop — test fails if server received >1 hit
}

// ─── getAsset ────────────────────────────────────────────────────────────────

#[tokio::test]
async fn get_asset_returns_typed_struct() {
    let server = MockServer::start().await;

    let asset_json = json!({
        "id": "NFT123",
        "interface": "V1_NFT",
        "content": {"uri": "https://example.com/nft.json"},
        "mutable": true,
        "burnt": false
    });

    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(200).set_body_json(rpc_ok(asset_json)))
        .expect(1)
        .mount(&server)
        .await;

    let (client, _dir) = make_client(&server).await;
    let asset = client.get_asset("NFT123").await.unwrap();
    assert_eq!(asset.id, "NFT123");
    assert_eq!(asset.interface.as_deref(), Some("V1_NFT"));
    assert_eq!(asset.mutable, Some(true));
}

// ─── getAssetsByOwner ────────────────────────────────────────────────────────

#[tokio::test]
async fn get_assets_by_owner_returns_items_vec() {
    let server = MockServer::start().await;

    let resp = json!({
        "total": 2,
        "limit": 10,
        "page": 1,
        "items": [
            {"id": "A1", "interface": "V1_NFT"},
            {"id": "A2", "interface": "FungibleToken"}
        ]
    });

    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(200).set_body_json(rpc_ok(resp)))
        .expect(1)
        .mount(&server)
        .await;

    let (client, _dir) = make_client(&server).await;
    let assets = client.get_assets_by_owner("OwnerAddr", 10).await.unwrap();
    assert_eq!(assets.len(), 2);
    assert_eq!(assets[0].id, "A1");
    assert_eq!(assets[1].id, "A2");
}

// ─── getPriorityFeeEstimate ──────────────────────────────────────────────────

#[tokio::test]
async fn get_priority_fee_estimate_parses_levels() {
    let server = MockServer::start().await;

    let resp = json!({
        "priorityFeeEstimate": 5000.0,
        "priorityFeeLevels": {
            "min": 1.0,
            "low": 100.0,
            "medium": 5000.0,
            "high": 50000.0,
            "veryHigh": 500000.0,
            "unsafeMax": 5000000.0
        }
    });

    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(200).set_body_json(rpc_ok(resp)))
        .expect(1)
        .mount(&server)
        .await;

    let (client, _dir) = make_client(&server).await;
    let fee = client
        .get_priority_fee_estimate(&["SomeProgram111"])
        .await
        .unwrap();
    assert_eq!(fee.priority_fee_estimate, Some(5000.0));
    let levels = fee.priority_fee_levels.unwrap();
    assert_eq!(levels.medium, Some(5000.0));
}

// ─── getSignaturesForAddress ─────────────────────────────────────────────────

#[tokio::test]
async fn get_signatures_for_address_returns_sigs() {
    let server = MockServer::start().await;

    let sigs = json!([
        {"signature": "sig111", "slot": 100, "blockTime": 1000, "err": null, "memo": null},
        {"signature": "sig222", "slot": 101, "blockTime": 1001, "err": null, "memo": null}
    ]);

    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(200).set_body_json(rpc_ok(sigs)))
        .expect(1)
        .mount(&server)
        .await;

    let (client, _dir) = make_client(&server).await;
    let sigs = client
        .get_signatures_for_address("SomeAddr", 10)
        .await
        .unwrap();
    assert_eq!(sigs.len(), 2);
    assert_eq!(sigs[0].signature, "sig111");
    assert_eq!(sigs[1].slot, 101);
}

// ─── getLatestBlockhash ──────────────────────────────────────────────────────

#[tokio::test]
async fn get_latest_blockhash_returns_hash() {
    let server = MockServer::start().await;

    let resp = json!({
        "value": {
            "blockhash": "BLOCKHASH_XYZ",
            "lastValidBlockHeight": 999999
        },
        "context": {"slot": 42}
    });

    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(200).set_body_json(rpc_ok(resp)))
        .expect(1)
        .mount(&server)
        .await;

    let (client, _dir) = make_client(&server).await;
    let bh = client.get_latest_blockhash().await.unwrap();
    assert_eq!(bh.blockhash, "BLOCKHASH_XYZ");
    assert_eq!(bh.last_valid_block_height, Some(999999));
}

// ─── getTokenAccountBalance ──────────────────────────────────────────────────

#[tokio::test]
async fn get_token_account_balance_parses_amount() {
    let server = MockServer::start().await;

    let resp = json!({
        "value": {
            "amount": "1000000",
            "decimals": 6,
            "uiAmount": 1.0,
            "uiAmountString": "1.0"
        },
        "context": {}
    });

    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(200).set_body_json(rpc_ok(resp)))
        .expect(1)
        .mount(&server)
        .await;

    let (client, _dir) = make_client(&server).await;
    let tok = client
        .get_token_account_balance("TokenAcct111")
        .await
        .unwrap();
    assert_eq!(tok.amount, "1000000");
    assert_eq!(tok.decimals, 6);
    assert_eq!(tok.ui_amount, Some(1.0));
}

// ─── x402 — no wallet configured ────────────────────────────────────────────

#[tokio::test]
async fn no_wallet_on_402_returns_unpaid() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .respond_with(
            ResponseTemplate::new(402).set_body_json(json!({
                "required_amount_usdc": 500,
                "payment_address": "PayAddr",
                "memo": "helius-getBalance"
            })),
        )
        .mount(&server)
        .await;

    let (client, _dir) = make_client(&server).await; // no wallet
    let err = client.get_balance("PaidAddr").await.unwrap_err();
    assert!(
        matches!(err, HeliusError::Unpaid),
        "expected Unpaid, got {:?}",
        err
    );
}

// ─── upstream 500 ────────────────────────────────────────────────────────────

#[tokio::test]
async fn upstream_500_returns_upstream_error() {
    let server = MockServer::start().await;

    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(500).set_body_string("internal server error"))
        .mount(&server)
        .await;

    let (client, _dir) = make_client(&server).await;
    let err = client.get_balance("Addr").await.unwrap_err();
    assert!(
        matches!(err, HeliusError::Upstream { status: 500, .. }),
        "expected Upstream 500, got {:?}",
        err
    );
}

// ─── TTL = 0 skips cache ─────────────────────────────────────────────────────

#[tokio::test]
async fn ttl_zero_method_skips_cache() {
    let server = MockServer::start().await;

    // Both calls must hit the server — TTL=0 means no caching.
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(200).set_body_json(rpc_ok(json!({
            "value": {"blockhash": "BH1", "lastValidBlockHeight": 1},
            "context": {}
        }))))
        .expect(2)
        .mount(&server)
        .await;

    let (client, _dir) = make_client_with_extra_cfg(&server, |cfg| {
        cfg.method_ttls.insert("getLatestBlockhash".to_string(), Duration::ZERO);
    })
    .await;

    let _ = client.get_latest_blockhash().await.unwrap();
    let _ = client.get_latest_blockhash().await.unwrap();
}
