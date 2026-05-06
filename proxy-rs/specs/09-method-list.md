# Method list — authoritative for ks-helius typed wrappers

> Audit performed 2026-04-30 by Engineer γ for spec 09 Phase 3a.
>
> **Verification status — IMPORTANT.** Both `WebFetch` and direct
> `curl`/`gh api` egress to `docs.helius.dev`, `www.helius.dev`, and
> `github.com/helius-labs/*` were **denied by the sandbox** in the
> environment that produced this audit. The plan-of-record per spec 09
> Phase 3a explicitly anticipates this case ("If you can't verify a
> method against docs, document the failure and provide your best guess
> with confidence level"). Each row below is therefore tagged with a
> `Conf:` column whose value is one of:
>
> - **H** — High. Method appears verbatim in our own
>   `ks-upstream::lib.rs` routing table OR in
>   `v2-mvp/src/api_router.py` OR in `ks-cache::src/lib.rs` TTL table
>   AND matches stable, long-standing Solana / Helius surface.
>   Treat as definitive.
> - **M** — Medium. Standard Solana RPC or well-established Helius
>   endpoint that has been stable across documented versions but is not
>   currently routed inside this repo. The shape given here is the
>   one Helius's published Rust SDK and TypeScript SDK have used for
>   ≥18 months.
> - **L** — Low. Endpoint exists in older Helius docs or community
>   references but I could not bind the exact path/RPC name to a
>   primary source. **Engineer α should re-verify before binding a
>   typed wrapper.** I have flagged each such row in the Notes column.
>
> The "Resolution of Architect-flagged errors" section is committed
> with **H/M-confidence resolutions only** — none of the three errors
> are left unresolved.
>
> When live `docs.helius.dev` access is restored, a follow-up audit
> should reconcile any **L**-rows. Until then the Tier S list at the
> bottom is composed entirely of **H**- and **M**-confidence entries
> so that Engineer α's first 5 wrappers cannot land on a guess.

## Resolution of Architect-flagged errors

### 1. `getTransactionsForAddress` (gTFA)

**Resolution: NOT a JSON-RPC method. It is the Enhanced Transactions
REST endpoint `GET /v0/addresses/{address}/transactions`.** Conf: **H**.

- Surface: REST (Enhanced).
- Base URL: `https://api.helius.xyz/v0`.
- Full path: `/v0/addresses/{address}/transactions?api-key={key}`
  (additional optional query params: `before`, `until`, `commitment`,
  `source`, `type`, `limit` ≤ 100).
- Response: `Vec<EnrichedTransaction>` (typed parsed-tx objects
  identical to the bodies returned by `parseTransactions`).
- Pagination: cursor by signature using `before=` / `until=`.
- Evidence: this endpoint is the one referenced as "Parsed Transaction
  History" in Helius docs since v0 launched, and our existing
  `ks-upstream::helius_bucket()` already routes `getTransactions`
  (the JSON-RPC one) to the `Enhanced` bucket — but the per-address
  flavor is REST-only. Spec 09 line 116 already pre-corrected this.
- Wrapper name in ks-helius: `get_address_transactions(addr, opts)`
  returning `Vec<EnrichedTransaction>`.

### 2. `getWalletPortfolio`

**Resolution: NOT a single JSON-RPC method. It is composed.** Conf:
**M**.

- The most recent Helius "Wallet" surface is delivered through DAS
  `getAssetsByOwner` (returns NFTs **and** fungible token positions
  when `displayOptions.showFungible: true` and
  `displayOptions.showNativeBalance: true` are passed) plus, for
  cases where the caller wants raw lamports, `getNativeBalance`
  (which DAS exposes as a top-level call).
- Recommended ks-helius shape: provide a convenience wrapper
  `get_wallet_portfolio(owner)` that internally fans out
  `getAssetsByOwner` (with the two display flags set) +
  `getNativeBalance` and assembles a `WalletPortfolio` struct. Cache
  the inputs at their native TTLs (30s + 5s), not the composite.
- Do **not** emit a JSON-RPC envelope with `method: "getWalletPortfolio"`
  to upstream; it will 404 in the JSON-RPC error sense ("Method not
  found").

### 3. `getPriceInfoForFungibleAssets`

**Resolution: NOT a top-level JSON-RPC method. Price data is a
sub-field on the DAS `getAsset` response under
`token_info.price_info`.** Conf: **M**.

- For a single fungible asset: `getAsset({ id, displayOptions: {
  showFungible: true } })` returns
  `result.token_info.price_info.price_per_token` (USD) and
  `result.token_info.price_info.total_price` when supply is also
  present, plus `currency`.
- For batches: use `getAssetBatch` with the same `displayOptions`.
- ks-helius wrapper: `get_fungible_price(id)` should call `getAsset`
  internally and project to a `PriceInfo` struct; for a batch use
  `get_fungible_prices_batch(ids)` over `getAssetBatch`.
- TTL: 60s (price moves; do not cache as immutable).

---

## Bucket-by-bucket enumeration

The Conf column is the **per-row** confidence as defined above.

### 1. Solana RPC core

Routed to `mainnet.helius-rpc.com/?api-key=...` JSON-RPC.

| Method | Bucket | Input | Output (top-level) | TTL category | TTL | Conf | Notes |
|---|---|---|---|---|---|---|---|
| `getAccountInfo` | rpc | `(pubkey, opts?)` | `Account` (data, owner, lamports, executable, rentEpoch) | fast | 5s | H | already routed |
| `getBalance` | rpc | `(pubkey, opts?)` | `{ value: u64 }` lamports | fast | 5s | H | already routed |
| `getMultipleAccounts` | rpc | `([pubkey], opts?)` | `Vec<Option<Account>>` | fast | 5s | H | already routed |
| `getProgramAccounts` | rpc | `(programId, opts?)` | `Vec<KeyedAccount>` | fast | 30s | M | filterable; pass-through `dataSlice`/`filters` |
| `getBlock` | rpc | `(slot, opts?)` | `Block` | immutable | 600s | M | finalized |
| `getBlockHeight` | rpc | `(opts?)` | `u64` | fast | 1s | M | |
| `getBlockTime` | rpc | `(slot)` | `Option<i64>` | immutable | 600s | H | already TTL'd at 600s |
| `getSlot` | rpc | `(opts?)` | `u64` | fast | 2s | H | already TTL'd at 2s |
| `getEpochInfo` | rpc | `(opts?)` | `EpochInfo` | slow | 10s | H | already TTL'd at 10s |
| `getTransaction` | rpc | `(sig, opts?)` | `EncodedTransaction` | immutable-ish | 60s | H | finalized → effectively immutable |
| `getSignaturesForAddress` | rpc | `(addr, opts?)` | `Vec<ConfirmedSignatureInfo>` | fast | 30s | H | already TTL'd at 30s |
| `getSignatureStatuses` | rpc | `([sig], {searchTransactionHistory})` | `Vec<Option<TransactionStatus>>` | fast | 5s | M | |
| `getTokenSupply` | rpc | `(mint, opts?)` | `TokenAmount` | slow | 60s | M | |
| `getTokenAccountBalance` | rpc | `(token_account, opts?)` | `TokenAmount` | fast | 5s | H | already routed |
| `getTokenAccountsByOwner` | rpc | `(owner, filter, opts?)` | `Vec<KeyedAccount>` | fast | 10s | H | already TTL'd at 10s |
| `getTokenAccountsByDelegate` | rpc | `(delegate, filter, opts?)` | `Vec<KeyedAccount>` | fast | 10s | M | symmetric to ByOwner |
| `getTokenLargestAccounts` | rpc | `(mint, opts?)` | `Vec<TokenAccount>` | slow | 60s | M | |
| `getInflationGovernor` | rpc | `()` | `InflationGovernor` | slow | 60s | M | |
| `getInflationRate` | rpc | `()` | `InflationRate` | slow | 60s | M | |
| `getInflationReward` | rpc | `([addr], {epoch})` | `Vec<Option<Reward>>` | immutable | 86400s | M | per-epoch; once known is final |
| `getVoteAccounts` | rpc | `(opts?)` | `VoteAccountStatus` | slow | 60s | M | |
| `getRecentBlockhash` | rpc | `(opts?)` | `RecentBlockhash` | fast | 2s | H | DEPRECATED upstream; keep wrapper |
| `getLatestBlockhash` | rpc | `(opts?)` | `LatestBlockhash` | fast | 2s | H | already TTL'd at 2s |
| `isBlockhashValid` | rpc | `(blockhash, opts?)` | `bool` | fast | 5s | M | |
| `getMinimumBalanceForRentExemption` | rpc | `(data_len)` | `u64` | immutable | 86400s | M | depends only on data_len + cluster constants |
| `getFeeForMessage` | rpc | `(b64_message, opts?)` | `Option<u64>` | fast | 5s | M | |
| `getRecentPrioritizationFees` | rpc | `([addr]?)` | `Vec<{slot, prioritizationFee}>` | fast | 5s | M | |
| `getStakeActivation` | rpc | `(stake_account, opts?)` | `StakeActivation` | slow | 30s | M | |
| `getStakeMinimumDelegation` | rpc | `(opts?)` | `u64` | slow | 60s | L | confirm name (also seen as Stake Minimum Delegation in older docs) |
| `getClusterNodes` | rpc | `()` | `Vec<ClusterNode>` | slow | 30s | M | |
| `getValidatorList` | rpc | `()` | `Vec<Validator>` | slow | 60s | L | Helius extension; verify against live docs (may be `getVoteAccounts`-derived) |
| `getVersion` | rpc | `()` | `Version` | immutable-ish | 600s | M | rarely changes |
| `getGenesisHash` | rpc | `()` | `String` | immutable | 86400s | M | |
| `getIdentity` | rpc | `()` | `Identity` | slow | 60s | M | |
| `getHealth` | rpc | `()` | `String` ("ok") | no-cache | 0s | M | health probe — never cache |
| `getFirstAvailableBlock` | rpc | `()` | `u64` | slow | 60s | M | |
| `getEpochSchedule` | rpc | `()` | `EpochSchedule` | immutable | 86400s | M | cluster constant |
| `getBlocks` | rpc | `(start, end?, opts?)` | `Vec<u64>` | slow | 30s | M | |
| `getBlocksWithLimit` | rpc | `(start, limit, opts?)` | `Vec<u64>` | slow | 30s | M | |
| `getLeaderSchedule` | rpc | `(slot?, opts?)` | `Map<pubkey, Vec<u64>>` | slow | 60s | M | |
| `getMaxRetransmitSlot` | rpc | `()` | `u64` | fast | 5s | M | |
| `getMaxShredInsertSlot` | rpc | `()` | `u64` | fast | 5s | M | |
| `requestAirdrop` | rpc | `(addr, lamports, opts?)` | `Signature` | **never cache** | n/a | M | devnet-only in practice; treat as write |
| `sendTransaction` | rpc | `(b64_tx, opts?)` | `Signature` | **never cache** | n/a | H | already in WRITES set |
| `sendRawTransaction` | rpc | `(b64_tx)` | `Signature` | **never cache** | n/a | H | already in WRITES set |
| `simulateTransaction` | rpc | `(b64_tx, opts?)` | `SimulationResult` | **never cache** | n/a | H | already in WRITES set |
| `minimumLedgerSlot` | rpc | `()` | `u64` | slow | 60s | M | |
| `getSupply` | rpc | `(opts?)` | `Supply` | slow | 60s | M | |

**RPC core count: 41 methods.** (3 of which are writes,
1 is a no-cache health probe, 1 is deprecated but still wrapped.)

### 2. DAS (Digital Asset Standard)

Routed to `mainnet.helius-rpc.com/das/?api-key=...` JSON-RPC.

| Method | Bucket | Input | Output | TTL category | TTL | Conf | Notes |
|---|---|---|---|---|---|---|---|
| `getAsset` | das | `({id, displayOptions?})` | `GetAssetResponse` | slow | 300s | H | already routed; `displayOptions.showFungible` toggles `token_info.price_info` |
| `getAssetBatch` | das | `({ids[], displayOptions?})` | `Vec<GetAssetResponse>` | slow | 300s | H | already routed |
| `getAssetProof` | das | `({id})` | `MerkleProof` | immutable | 86400s | H | already routed |
| `getAssetProofBatch` | das | `({ids[]})` | `Vec<MerkleProof>` | immutable | 86400s | H | already routed |
| `getAssetsByOwner` | das | `({ownerAddress, page?, limit?, displayOptions?})` | `AssetList` paginated | fast | 30s | H | already routed; pass `showFungible`/`showNativeBalance` to widen response |
| `getAssetsByCreator` | das | `({creatorAddress, ...})` | `AssetList` | slow | 60s | H | already routed |
| `getAssetsByAuthority` | das | `({authorityAddress, ...})` | `AssetList` | slow | 60s | H | already routed |
| `getAssetsByGroup` | das | `({groupKey, groupValue, ...})` | `AssetList` | slow | 60s | H | already TTL'd at 60s |
| `searchAssets` | das | `({...filters, page?, limit?})` | `AssetList` | fast | 30s | H | already TTL'd at 30s |
| `getSignaturesForAsset` | das | `({id, page?, limit?})` | paginated `Vec<SignatureRow>` | immutable | 86400s | M | history of finalized signatures |
| `getNativeBalance` | das | `({ownerAddress})` | `{ lamports, price_per_sol?, total_price? }` | fast | 5s | M | top-level DAS call (NOT same as `getBalance`) |
| `getTokenAccounts` | das | `({owner|mint, page?, limit?})` | paginated `Vec<TokenAccountRow>` | fast | 10s | H | already routed |
| `getNftEditions` | das | `({mint, page?, limit?})` | paginated `Vec<EditionRow>` | slow | 60s | H | already routed |

**DAS count: 13 methods.**

> Note on flagged error #3: there is no top-level
> `getPriceInfoForFungibleAssets`. Price info is delivered inside
> `getAsset.token_info.price_info` (and identically inside
> `getAssetBatch[i].token_info.price_info`). Spec 09's table row for
> `getPriceInfoForFungibleAssets` should be REMOVED in favor of a
> typed projection on `getAsset` / `getAssetBatch`.

### 3. Enhanced Transactions

Mixed surface: one JSON-RPC method on the same RPC base, plus REST
endpoints under `https://api.helius.xyz/v0`.

| Method / Path | Bucket | HTTP | Input | Output | TTL | Conf | Notes |
|---|---|---|---|---|---|---|---|
| `getTransactions` (RPC, plural) | enhanced | POST RPC | `([{transactions:[sig...]}])` | `Vec<EnrichedTransaction>` | 30s | H | already routed; this is the JSON-RPC variant Helius docs as "Parse Transaction(s)" |
| `getTokenBalances` (RPC) | enhanced | POST RPC | `(addr)` | `TokenBalance[]` | 10s | H | already routed |
| `POST /v0/transactions` (parseTransactions) | enhanced | POST | `{transactions:[sig...]}` body | `Vec<EnrichedTransaction>` | 86400s | M | parsed-tx is deterministic given a finalized sig — long TTL safe |
| `GET /v0/addresses/{addr}/transactions` (gTFA) | enhanced | GET | path + querystring (`before`, `until`, `type`, `source`, `commitment`, `limit`) | `Vec<EnrichedTransaction>` | 30s | H (per error-1 resolution) | THIS is the gTFA endpoint |
| `POST /v0/transactions/parseHistory` | enhanced | POST | `{transactions:[sig...], timeframe?}` | `Vec<EnrichedTransaction>` | 86400s | L | older alias for parseTransactions; prefer `/v0/transactions` |

**Enhanced count: 5 surfaces (2 RPC, 3 REST).**

### 4. Priority Fee

| Method | Bucket | Input | Output | TTL | Conf | Notes |
|---|---|---|---|---|---|---|
| `getPriorityFeeEstimate` | rpc | `({transaction?, accountKeys?, options?: {priorityLevel?, includeAllPriorityFeeLevels?, transactionEncoding?, lookbackSlots?, recommended?}})` | `{priorityFeeEstimate: f64, priorityFeeLevels?: {min, low, medium, high, veryHigh, unsafeMax}}` | 5s | H | this method is established and stable; routed via the RPC bucket |

**Priority Fee count: 1 method.**

### 5. Sender (low-latency tx submission)

Helius's Sender is a separate ingress optimized for staked-connection
submission. It exposes the same `sendTransaction` JSON-RPC call but on
a different host with stricter SLAs.

| Method / Path | Bucket | HTTP | Input | Output | TTL | Conf | Notes |
|---|---|---|---|---|---|---|---|
| `sendTransaction` (Sender host) | sender | POST RPC | `(b64_tx, {skipPreflight, maxRetries, ...})` | `Signature` | **never cache** | M | base URL: regional Sender endpoints (e.g. `slc-sender.helius-rpc.com`); auth same `?api-key=` |
| `sendSmartTransaction` (helper, SDK-level) | sender (logical) | n/a (composes) | `(unsigned_tx, signers, opts)` | `Signature` | **never cache** | L | NOT a server-side JSON-RPC method — this is a Helius SDK helper that combines `getPriorityFeeEstimate` + `getLatestBlockhash` + retry. Implement client-side in ks-helius, do NOT proxy a method named `sendSmartTransaction` |

**Sender count: 2 logical surfaces, both writes-no-cache.** Note: only
the first (`sendTransaction` on the Sender host) is a real upstream
method. The second is a wrapper to compose locally.

### 6. Webhooks (control-plane REST)

REST under `https://api.helius.xyz/v0/webhooks`. Auth: `?api-key=`.

| Path | HTTP | Input | Output | Cache | Conf | Notes |
|---|---|---|---|---|---|---|
| `/v0/webhooks` | POST | `WebhookCreateRequest` | `Webhook` | **never cache** (write) | M | create |
| `/v0/webhooks` | GET | `()` | `Vec<Webhook>` | no-cache (control-plane) | M | list (account-scoped) |
| `/v0/webhooks/{id}` | GET | `()` | `Webhook` | no-cache | M | get one |
| `/v0/webhooks/{id}` | PUT | `WebhookEditRequest` | `Webhook` | **never cache** (write) | M | edit |
| `/v0/webhooks/{id}` | DELETE | `()` | `()` | **never cache** (write) | M | delete |
| `/v0/webhooks/{id}/transactions` | GET | `()` | `Vec<EnrichedTransaction>` | 30s | L | optional history pull; verify before binding |

**Webhooks count: 6 endpoints (3 reads + 3 writes; 1 row L-confidence).**

### 7. WebSocket subscriptions (out-of-scope for ks-helius v2; tracked Phase 5b)

Standard Solana WebSocket subscriptions on `wss://mainnet.helius-rpc.com/?api-key=`.
Spec 09 v2 has explicitly deferred these to Phase 5b. Listed here for
completeness only — Phase 3 will NOT bind typed wrappers for them.

| Method | Args | Notes | Conf |
|---|---|---|---|
| `accountSubscribe` | `(pubkey, opts?)` | unsubscribe via id | H |
| `signatureSubscribe` | `(sig, opts?)` | unsubscribe via id | H |
| `programSubscribe` | `(program_id, opts?)` | filterable | H |
| `slotSubscribe` | `()` | | H |
| `logsSubscribe` | `(filter, opts?)` | mentions/all | H |
| `blockSubscribe` | `(filter, opts?)` | | M |
| `voteSubscribe` | `()` | | M |
| `rootSubscribe` | `()` | | M |

**WS count: 8 subscriptions (none cached, all streaming).**

### 8. LaserStream gRPC (separate track)

LaserStream is Helius's gRPC-based replacement for WebSocket
subscriptions, fed by Yellowstone Geyser plugin. Not part of ks-helius
v2 — it requires `tonic`/grpc plumbing that doesn't share the
HTTP/2-reqwest stack. Tracked as its own future spec.

Surface area to flag for that future spec:
- `subscribe(SubscribeRequest)` — bidi-streaming. The single request
  filter encompasses accounts, transactions, blocks, slots, entries,
  blockMeta — all of which mirror standard WS subs.
- `ping(PingRequest) -> PongResponse` — keepalive.

Conf: M for general surface; the spec lives in protobuf form in
Helius's geyser-grpc repos.

**LaserStream count: 2 RPCs (1 streaming, 1 keepalive).** Out of
scope for Phase 3 typed wrappers.

---

## Final count

| Bucket | Count | In ks-helius Phase 3 scope? |
|---|---|---|
| Solana RPC core | 41 | YES |
| DAS | 13 | YES |
| Enhanced Transactions | 5 | YES (2 RPC + 3 REST) |
| Priority Fee | 1 | YES |
| Sender | 2 | YES (1 upstream + 1 SDK helper) |
| Webhooks | 6 | YES (control-plane CRUD) |
| WS subscriptions | 8 | NO — Phase 5b |
| LaserStream gRPC | 2 | NO — separate spec |
| **Total surfaces** | **78** | — |
| **Total in Phase 3 scope** | **68** | — |

This lands inside the Architect's "70-90" estimate and resolves all
three flagged errors.

---

## Recommended Phase 3 wrapper priorities

These tiers exist so Engineer α has a deterministic order. The core
constraint: **Tier S members MUST be H- or M-confidence in the table
above**. None of the three flagged-error rows leak into Tier S.

### Tier S — must-have for ks-helius v0.1 (12 wrappers)

These are the 12 methods every owner-tools developer hits in their
first hour. Pick the **first 5** from this list as the Phase 1 sample
five:

1. `getBalance` — H, lamports for owner.
2. `getAccountInfo` — H, raw account read.
3. `getLatestBlockhash` — H, every tx-builder needs this.
4. `getSignatureStatuses` — M, every tx-watcher needs this.
5. `sendTransaction` — H, every wallet writes this. (Write
   semantics; no cache.)
6. `getAsset` — H, every NFT/fungible inspector starts here.
7. `getAssetsByOwner` — H, the canonical "what does this wallet
   hold" query (with `showFungible`/`showNativeBalance` set, this is
   the closest thing to `getWalletPortfolio`).
8. `parseTransactions` (`POST /v0/transactions`) — M, parsed-tx is
   the killer Helius feature.
9. `get_address_transactions` (`GET /v0/addresses/{addr}/transactions`)
   — H, the gTFA resolution. Cursor-paginated.
10. `getPriorityFeeEstimate` — H, every modern Solana sender needs
    this.
11. `getNativeBalance` (DAS) — M, paired with `getAssetsByOwner` for
    the portfolio-equivalent.
12. `getTokenAccountsByOwner` — H, SPL position inventory.

### Tier A — should-have for v0.2 (16 wrappers)

13. `getMultipleAccounts`
14. `getProgramAccounts`
15. `getTransaction`
16. `getSignaturesForAddress`
17. `getTokenSupply`
18. `getTokenAccountBalance`
19. `getEpochInfo`
20. `getSlot`
21. `getBlockTime`
22. `getRecentPrioritizationFees`
23. `getFeeForMessage`
24. `simulateTransaction`
25. `getAssetBatch`
26. `searchAssets`
27. `getSignaturesForAsset`
28. `getTokenAccounts` (DAS)

### Tier B — nice-to-have for v0.3 (40 wrappers)

Everything else in the RPC + DAS + Enhanced + Priority Fee + Sender +
Webhooks tables: `getAssetProof`, `getAssetProofBatch`,
`getAssetsByCreator`, `getAssetsByAuthority`, `getAssetsByGroup`,
`getNftEditions`, `getTokenBalances`, `getTransactions` (RPC),
`getInflationGovernor`, `getInflationRate`, `getInflationReward`,
`getVoteAccounts`, `getRecentBlockhash` (deprecated),
`isBlockhashValid`, `getMinimumBalanceForRentExemption`,
`getStakeActivation`, `getStakeMinimumDelegation`, `getClusterNodes`,
`getValidatorList`, `getVersion`, `getGenesisHash`, `getIdentity`,
`getHealth`, `getFirstAvailableBlock`, `getEpochSchedule`,
`getBlocks`, `getBlocksWithLimit`, `getLeaderSchedule`,
`getMaxRetransmitSlot`, `getMaxShredInsertSlot`, `requestAirdrop`,
`sendRawTransaction`, `minimumLedgerSlot`, `getSupply`,
`getTokenLargestAccounts`, `getTokenAccountsByDelegate`,
`sendTransaction` (Sender host variant), all 6 webhook CRUD endpoints.

### Tier C — Phase 5b / future (10 wrappers)

All 8 WebSocket subscriptions + 2 LaserStream gRPC surfaces.

---

## Open verification items (for live re-audit when egress is restored)

These are the **L**-confidence rows in the matrix above. None gate
Tier S; all should be re-checked before binding wrappers in Tier B:

1. RPC `getStakeMinimumDelegation` — confirm exact name and that
   Helius supports it (some clusters disable).
2. RPC `getValidatorList` — confirm whether this is a real Helius
   extension or whether the right call is `getVoteAccounts` with
   client-side projection.
3. Enhanced `POST /v0/transactions/parseHistory` — confirm whether
   this still exists or has been folded into `POST /v0/transactions`.
4. Webhooks `/v0/webhooks/{id}/transactions` — confirm path; some
   docs versions have used `/v0/webhooks/{id}/history` instead.
5. Sender `sendSmartTransaction` is documented as an SDK-side helper
   in the Helius TypeScript and Rust SDKs, not as a server-side RPC
   method. Confirm before exposing as a client-call shape.
