# KeyShield Devnet Operator Guide

End-to-end verification of the MPP (Metered Payment Proxy) + x402 flow
against **live Solana devnet**. Today the test suite covers Mollusk
unit tests + stub-fallback integration; this guide is the path to
proving real on-chain settlement works before mainnet.

The devnet USDC mint is the canonical Circle devnet mint:
`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`. Send a few cents of
devnet-USDC to your settler wallet from
[faucet.circle.com](https://faucet.circle.com/) before running the e2e.

---

## Pre-requisites

| Tool | Version | Install |
|------|---------|---------|
| `solana-cli` | >= 1.18 | `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"` |
| Solana SBF toolchain (`cargo build-sbf`) | matches solana-cli | shipped with solana-cli installer |
| `spl-token-cli` | latest | `cargo install spl-token-cli` |
| `jq` | any | `brew install jq` / `apt install jq` |
| Python venv at `v2-mvp/.venv` | 3.13+ | `cd v2-mvp && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt` |

You will also need:
- A funded Solana wallet on devnet (~2 SOL is enough — the script can
  airdrop it for you) — and a few cents of devnet-USDC for actually
  depositing into payment streams.
- `programs/keyshield` source tree present at the repo root (it is
  in the workspace `Cargo.toml`).

---

## First-time setup

```bash
bash scripts/devnet-setup.sh
```

That single command:

1. Generates an MPP-settler keypair under `.keyshield-devnet/mpp-settler-devnet.json`
   (or reuses one if `KS_DEVNET_KEYPAIR_PATH` is set).
2. Airdrops 2 SOL to it via `solana airdrop` (skipped if balance is
   already ≥ 1 SOL — devnet airdrops are rate-limited).
3. Builds `programs/keyshield` with `cargo build-sbf` and deploys to
   devnet via `solana program deploy`. Idempotent: the script checks
   the cached program-id with `solana program show` and skips
   redeployment if it's already on-chain.
4. Creates a USDC ATA for the platform receiver (the settler wallet
   itself, for self-contained devnet testing) on the
   `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` mint.
5. Derives the universal-vault PDA for the settler.

The script ends by printing an `eval`-able env block on stdout. Capture
it with:

```bash
eval "$(bash scripts/devnet-setup.sh --quiet)"
```

The block exports:

```
KS_MPP_SETTLER_KEY        # path to the keypair JSON
KS_MPP_SETTLER_PUBKEY     # base58 settler pubkey
KS_PLATFORM_USDC_ATA      # platform receiver USDC ATA
KS_KEYSHIELD_PROGRAM_ID   # deployed program id
KS_VAULT_PDA              # universal_vault PDA for the settler
KS_SOLANA_RPC_URL         # https://api.devnet.solana.com
KS_USDC_MINT              # 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

Cache lives at `.keyshield-devnet/`. Delete it to start completely
fresh; rotate just the settler keypair with
`bash scripts/devnet-setup.sh --refresh-keypair`.

---

## Running the e2e test

After the env is sourced:

```bash
bash scripts/devnet-e2e.sh
```

What it does:

1. Asserts the env block above is exported.
2. Invokes `bash scripts/pay.sh` (the per-call x402 + MPP harness),
   capturing its NDJSON output.
3. Parses `verified_mode`, `settled_micro_usdc`, `tx_signature`, and
   `stream_pda` from the output.
4. Confirms the settlement tx via `solana confirm <sig>` and
   reads the stream PDA via `solana account <pda>`.
5. Prints one of:
   ```
   DEVNET-E2E PASS verified=real settled=<N> tx=<sig>
   DEVNET-E2E FAIL <reason>
   ```

Exit codes: 0 pass, 1 generic failure, 2 env not set, 3 missing tooling.

For one-shot setup-then-test, run `bash scripts/devnet-e2e.sh --setup-first`.

---

## Reading on-chain state

After a successful e2e run, you can inspect the live accounts:

### AgentPaymentStream PDA

```bash
solana account "$STREAM_PDA" --url "$KS_SOLANA_RPC_URL" --output json-compact
```

The first 8 bytes are the discriminator (`AGENT_PAYMENT_STREAM_DISCRIMINATOR`,
see `programs/keyshield/src/state.rs`). The fields you want for
verification (offsets are in the `aps_offset` module of `state.rs`):

| Field | Bytes | Meaning |
|-------|-------|---------|
| `discriminator` | 0–8 | constant tag |
| `owner` | 8–40 | wallet that opened the stream |
| `agent_pubkey` | 40–72 | EphemeralSigner the stream pays for |
| `usdc_mint` | 72–104 | should equal `KS_USDC_MINT` |
| `usdc_ata` | 104–136 | the stream's USDC ATA (debit source) |
| `mpp_settler` | 136–168 | should equal `KS_MPP_SETTLER_PUBKEY` |
| `max_total` | 168–176 | budget cap (u64 LE, micro-USDC) |
| `spent_total` | 176–184 | total spent so far — **this should advance after each settle** |
| `cost_per_unit` | 184–192 | micro-USDC per token/call |
| `last_payment_ts` | 192–200 | unix timestamp of last settle |
| `is_active` | …+1 | 0 = closed, 1 = open |
| `bump` | …+1 | PDA bump |

### Settle tx

```bash
solana confirm -v "$TX_SIG" --url "$KS_SOLANA_RPC_URL"
```

The verbose flag prints the inner ix list. Look for a `TransferChecked`
CPI from the SPL Token program with `from = <stream_ata>`,
`to = <KS_PLATFORM_USDC_ATA>`, and `authority = <STREAM_PDA>`.

---

## Cleanup

When you're done with devnet testing:

```bash
# 1. Close the on-chain program (reclaims rent to the upgrade authority,
#    which is the settler keypair).
solana program close "$KS_KEYSHIELD_PROGRAM_ID" \
  --keypair "$KS_MPP_SETTLER_KEY" \
  --url "$KS_SOLANA_RPC_URL" \
  --bypass-warning

# 2. Sweep any remaining SOL out of the settler.
solana transfer <YOUR_PERSONAL_DEVNET_WALLET> ALL \
  --keypair "$KS_MPP_SETTLER_KEY" \
  --url "$KS_SOLANA_RPC_URL" \
  --allow-unfunded-recipient

# 3. Wipe the local cache.
rm -rf .keyshield-devnet target/deploy/keyshield*
```

The settler keypair JSON itself is never committed (the cache directory
is in `.gitignore` if you've added it; otherwise add
`.keyshield-devnet/` there).

---

## Blockers / known gaps (as of 2026-05-06)

1. **`scripts/pay.sh` does not yet exist.** It is the missing harness
   that drives a real per-call x402 + MPP settlement against the
   running server. `devnet-e2e.sh` will fail loudly with
   `pay.sh missing` until it lands. Implementing it is a separate
   task — see ROADMAP.md.

2. **`v2-mvp/src/mpp_onchain.py` does not yet exist.** The server
   has no real-RPC code path: every settlement is currently the
   stub-fallback, and `verified_mode` is always `"stub"`. The e2e
   script will FAIL with `verified_mode != real` until that path
   ships. The Python side needs to (a) sign an `mpp_settle` ix
   with `KS_MPP_SETTLER_KEY`, (b) submit it via `KS_SOLANA_RPC_URL`,
   (c) record the resulting signature on the stream, and (d) flip
   `verified_mode` to `"real"`.

3. **PDA derivation in `devnet-setup.sh`** uses
   `solana find-program-derived-address`, which requires solana-cli
   ≥ 1.18.18. On older CLIs the script logs a warning and leaves
   `KS_VAULT_PDA` empty — clients should derive it at runtime
   (`PublicKey.findProgramAddressSync([Buffer.from('universal_vault'), owner], programId)`).

4. **Devnet faucet rate-limit.** The 2 SOL airdrop will throttle
   to "Too many airdrops in this period" after a few uses per IP.
   Use https://faucet.solana.com/ in a browser and paste the settler
   pubkey if the CLI airdrop fails.

5. **Devnet-USDC must be funded out-of-band.** `devnet-setup.sh`
   creates the platform ATA but does NOT fund the agent stream's ATA.
   You'll need to send USDC from `https://faucet.circle.com/` to the
   stream ATA before the first `mpp_settle` will succeed (otherwise
   the SPL TransferChecked will fail with `InsufficientFunds`).
