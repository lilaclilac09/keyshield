# Deploying the KeyShield Solana program to devnet / mainnet

The Rust program in this directory compiles to a Solana SBF
binary (`keyshield.so`, ~62 KB stripped) that runs on any Solana
cluster. This walkthrough covers the path from a clean checkout
to a deployed program ID you can wire into the SDKs.

## 0. One-time prerequisites

```bash
# 1. Solana CLI 2.1+ (any recent stable works)
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana --version  # expect: solana-cli 2.x.x

# 2. Rust + SBF toolchain (cargo-build-sbf installs the platform
# tools the first time you run it)
cargo-build-sbf --version

# 3. A Solana keypair you control. Either generate a new one:
solana-keygen new --outfile ~/.config/solana/id.json
# ...or import an existing seed-phrase keypair via solana-keygen recover.

solana config set --keypair ~/.config/solana/id.json
solana config set --url devnet
solana address  # confirm
```

## 1. Build the program

From the repo root:

```bash
cargo-build-sbf --manifest-path programs/keyshield/Cargo.toml
```

You'll see one harmless warning about Rust version mismatch
between the host toolchain and the platform-tools toolchain
(the latter is intentionally pinned). The build succeeds and
writes:

```
target/deploy/keyshield.so          ← the program binary
target/deploy/keyshield-keypair.json ← the program's address keypair (already committed)
```

The `keyshield-keypair.json` is checked into the repo at
`target/deploy/keyshield-keypair.json` (note: target/ is normally
gitignored but this one file was deliberately tracked back when
the program got its address). On first deploy you'll use this
keypair to claim the address; subsequent deploys upgrade in
place.

## 2. Fund your wallet on devnet

A first deploy of this program currently costs ~3 SOL of rent
(the binary is small, but the BPF loader pre-allocates a buffer).
Devnet airdrops are usually capped at 2 SOL per request, so:

```bash
solana airdrop 2
solana airdrop 2  # repeat until you have ~5 SOL
solana balance
```

If devnet airdrop is rate-limiting you (frequent), the
[devnet faucet web UI](https://faucet.solana.com/) can hand out a
single 5-SOL drop per IP per day.

## 3. Deploy

```bash
solana program deploy \
  --program-id target/deploy/keyshield-keypair.json \
  target/deploy/keyshield.so
```

On success the CLI prints:

```
Program Id: <some-base58-address>
```

That `<address>` is your program ID. Save it — you'll wire it
into the SDK config.

## 4. Verify

```bash
solana program show <address>
# Should print: ProgramData address, last deploy slot, current
# size + balance. The "Authority" field shows your keypair.

# Health check via raw RPC:
curl -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["<address>"]}' \
  https://api.devnet.solana.com | jq
```

If `executable: true` shows up in the response, you're live.

## 5. Wire into the SDKs

Anywhere a `programId` is read from env or config, point at the
new ID. The places that matter:

```bash
# extension-sync popup (Vite env)
echo "VITE_KEYSHIELD_PROGRAM_ID=<address>" >> extension-sync/.env.local

# scripts/demo-streaming-payment.ts reads from process.env
export KEYSHIELD_PROGRAM_ID=<address>

# packages/agent-sdk and packages/goat-wallet both accept a
# programId in their config — pass <address> there at construction.
```

The on-chain Program ID is the same shape on devnet and mainnet
— deploying to mainnet is a separate `solana program deploy`
call against `mainnet-beta`, with mainnet rent (still ~3 SOL but
real money).

## 6. Upgrades

The program is upgradable as long as the `Authority` field in
`solana program show` is your keypair. To push a new version of
the same code:

```bash
cargo-build-sbf --manifest-path programs/keyshield/Cargo.toml
solana program deploy target/deploy/keyshield.so
# (no --program-id flag needed — solana detects the existing one
# from the keypair)
```

Upgrades reuse the rent-paid buffer; you only pay transaction
fees.

To freeze the program (forbid future upgrades), assign authority
to a null pubkey:

```bash
solana program set-upgrade-authority <address> --final
```

This is irreversible.

## 7. What's NOT covered here

- **Anchoring against a custom Anchor IDL** — this program is
  pinocchio + raw byte instruction handlers, not Anchor. The TS
  SDKs in `packages/agent-sdk` build instructions manually.
- **Mainnet deploy ceremony** — for production you'd want a multi-
  sig deploy authority + a deploy-from-CI flow. That's V1.2.
- **Stake-weighted RPC for deploys** — if devnet airdrop is
  failing, switch your `solana config` to a paid devnet RPC
  (Helius / Triton both offer free devnet tiers).

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `cargo-build-sbf: command not found` | toolchain not on PATH | re-run the install one-liner; restart shell |
| `Stack offset of XXXX exceeded max offset of 4096` | a function builds a >4 KB struct on the stack | this should NOT happen on current `keyshield` (we fixed it in commit 85996b0); if it returns, see `programs/keyshield/src/state.rs` and avoid `Self { ... }` literals on the SBF target |
| `Insufficient funds for instruction` on deploy | wallet balance too low | airdrop more SOL (you need ~3 for first deploy, ~0.001 per upgrade) |
| `Account in use` mid-deploy | a previous deploy left a buffer; resume with `solana program deploy --buffer <buffer-pubkey>` from the error log | follow the CLI's suggestion |
| `Program failed to verify: Provided program does not match account size` | trying to upgrade with a binary too big for the existing buffer | extend the buffer: `solana program extend <address> <delta-bytes>` |

## 9. What the build produced this session

For reference, when the runbook was written:

```
$ ls -la target/deploy/keyshield.so
-rwxr-xr-x 1 root root 62416 ... target/deploy/keyshield.so
```

A 62 KB program binary. Once deployed, this rents about 0.85 SOL
in size + the BPF loader's overhead, plus the deploy transaction
fee.

## 10. Pre-flight checklist

Before running `solana program deploy`:

- [ ] `npm test` passes (354 / 354 across all 6 workspaces)
- [ ] `cargo-build-sbf` succeeds without stack-offset errors
- [ ] `solana balance` shows ≥ 5 SOL on devnet (~12 on mainnet for safety margin)
- [ ] `solana config get` confirms the right cluster + keypair
- [ ] If mainnet: review the program one more time. There is no undo on mainnet.
