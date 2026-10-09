# How an agent pays — x402 vs Cloudflare vs MPP, and SCVD

Three different tracks. Mixing them is why `settle_on_chain` looked
like “chain 0”.

| Track | What it is | Money? | This repo |
|---|---|---|---|
| **Cloudflare sync-worker** | Zero-knowledge **vault ciphertext** (`PUT/GET /vault/:id`) | No. Server cannot decrypt. | `src/infra/sync-worker/` |
| **x402** | HTTP **402 Payment Required** per call (Coinbase body). Agent or extension pays, retries with a proof. | Intended: Base USDC. **Proof verify is stub** unless `KS_X402_VERIFY_REQUIRED=1` and RPC env is set. | `src/backend/proxy/x402_verify.py`, extension `content.js` |
| **MPP** | Solana **metered stream**. Hold → verify artifact → capture HMAC → `mpp_settle` (Pinocchio ix 26). | Devnet USDC when settler env is loaded. Missing env = **stub ledger**, on-chain 0. | `src/backend/mpp/`, `src/programs/keyshield/` |

Cloudflare is **storage**. x402 is **one-shot HTTP pay**. MPP is **a tab** (open once, meter many calls). An agent can use the vault (CF) and still pay with MPP. They are not substitutes.

## Why settle was stub (fixed)

`.keyshield-devnet/` is gitignored and was empty on this VM.

`devnet-setup.sh` used to export `KS_MPP_SETTLER_KEY=/path/to.json`.
Python `load_mpp_config` only accepted **base58 64-byte** secrets, so
a path failed closed → `SettleOutcome(0, "stub")`.

Now:

1. `python3 src/scripts/devnet-keys.py` writes the keypair + `env.sh`
   (no `solana-cli` required). Program id defaults to the live Devnet
   Pinocchio program `41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j`.
2. `load_mpp_config` accepts **either** base58 **or** the JSON path.
3. `eval "$(python3 src/scripts/devnet-keys.py)"` then restart the
   control plane. Config loads. Submit can still fail if the stream
   PDA/ATA was never opened on-chain — that is `failed` /
   `indeterminate`, not silent stub.

This does **not** create the ATA on-chain or airdrop SOL. For a live
`TransferChecked` you still fund the settler and wallet-sign
`OpenPaymentStream` ([DEVNET.md](DEVNET.md)).

## How the agent pays (MPP on Devnet)

```bash
eval "$(python3 src/scripts/devnet-keys.py)"
export KS_TOKEN="ksv2_..."          # dashboard Developer token
export KS_BASE="http://127.0.0.1:8001"

# 1. Open a stream row (DB). Wallet must still sign build-open-tx
#    before the chain knows the PDA.
curl -s -X POST "$KS_BASE/mpp/streams" \
  -H "Authorization: Bearer $KS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agentPubkey":"<agent>","upstream":"openai","ratePerCallMicroUsdc":800,"maxTotalMicroUsdc":50000}'

# 2. Call through the proxy. Header binds the hold.
curl -s -X POST "$KS_BASE/proxy/openai/v1/chat/completions" \
  -H "Authorization: Bearer $KS_TOKEN" \
  -H "X-Mpp-Stream-Id: $STREAM_ID" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"ping"}]}'

# 3. Capture: HMAC-SHA256(session_token_utf8, artifact_hash)
#    POST /mpp/streams/{id}/capture
```

SDK shape:

```python
from keyshield import KeyShield
ks = KeyShield(token=os.environ["KS_TOKEN"])
client = ks.openai_client()   # no raw provider key
```

x402 path (different rail): call without balance → 402 body → pay /
extension prompt → retry. Do not treat a random `X-Payment-Proof` as
paid until verify is `real`.

## Problems the agent hits (SCVD) and the fix

**SCVD** = shopping-cart analog we used for the audit
(`docs/security/SCVD_SEVERITY_MATRIX.md`). Same shape as a bad
checkout: receipt without goods.

| Code | What the agent sees | Fix |
|---|---|---|
| **BUY-001** blank delivery | 402 / UI says $X, compiled ix says something else; empty upstream body | Integer micro-USDC + DOM = wire (`dom-intent.js`). Empty/5xx → hold released, **no capture** |
| **BUY-005** stale cache | RPC timeout, then “already failed”, but tx later lands and they are asked to pay again | `mode=indeterminate`. No debit, cache does not block retry |
| **BUY-034** receipt without order | Empty / truncated ix still session-signed | `assert_instruction_envelope` + packed 113-byte `mpp_settle` |
| Replay | Same body billed twice | Unique `(stream_id, artifact_hash)` → `NonceReused` |
| Path-as-key | Env set but still stub 0 | Accept keypair JSON path; `devnet-keys.py` writes base58 |

Invariant: a session HMAC never increments `settled` unless verify
returns `submitted` (or explicit stub-ledger `stub`). Timeout ≠ paid.
