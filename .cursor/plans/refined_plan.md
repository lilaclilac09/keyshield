---
name: KeyShield Refined Plan
overview: Executable plan: (1) Hybrid onchain list — merge on load, keep search, add/update/delete (steps 4–6); (2) Local and devnet testing (Mollusk, Surfpool, CI, devnet smoke); (3) Roadmap for multi-browser and Vault Audit Report.
todos:
  - id: merge-on-load
    content: Merge on load in useVaults (onchain fetch + local metadata)
  - id: keep-search
    content: Keep search as-is in useVaults (no code change)
  - id: add-update-delete
    content: Add/update/delete with onchain + metadata
  - id: unit-tests
    content: Mollusk unit tests (fixtures, store_key, access_key, share_key)
  - id: integration-surfpool
    content: Surfpool integration script + devnet README
  - id: roadmap
    content: Multi-browser detection/paste then Vault Audit Report
---

# KeyShield Refined Plan (Executable)

Steps 1–3 (wire wallet, fetch vaults, metadata store) are folded into step 4. Focus: **steps 4–6 (hybrid list)**, **local + devnet testing**, **roadmap**.

---

## Part 1 – Hybrid Search + Onchain List (Steps 4–6)

### Goal

Vault list **driven by onchain vaults** (source of truth); **searchable metadata** (name, domain, type) local/offchain. Search stays in-memory over the merged list in [frontend /hooks/useVaults.ts](frontend /hooks/useVaults.ts).

### 4. Merge on load (~45 min)

**Location**: [frontend /hooks/useVaults.ts](frontend /hooks/useVaults.ts)

**Change**:
- Replace current load (Clerk userId + localStorage only) with **onchain fetch + local metadata merge** when a Solana wallet is available.
- Use Solana wallet address as primary key (optional `walletAddress: string | null` passed into hook or from storage).
- **Fallback**: If no wallet, keep existing behavior (localStorage / chrome.storage keyed by userId).

**Logic**:
- `loadVaultList(walletAddress?)`: if wallet present, derive vault PDA (`["vault", owner]`), `connection.getAccountInfo(vaultPDA)`; if account exists, read local metadata `keyshield_meta_<vaultId>`; build merged item `{ id, onchain, pda, name, domain, type, ... }`; return `[merged]` (one vault per owner). If no wallet or no vault, return `[]` or fall back to legacy list.
- **Program ID**: Shared constant (e.g. [frontend /lib/solana.ts](frontend /lib/solana.ts) or constants) — use deploy keypair ID or env.
- **RPC**: `https://api.devnet.solana.com` or configurable.

**Search**: No change to filter logic (lines 62–72); it filters the merged `vaultItems`.

### 5. Keep search as-is

No code change. Existing `useMemo` filter on `vaultItems` (name, domain, activeFilter) now operates on the onchain-backed merged list.

### 6. Add / Update / Delete

**Add**: When user creates a key — call program (store_key) from extension or frontend; write local metadata `keyshield_meta_<vaultId>`; refresh list (refetch + merge).

**Update**: Update only local metadata (name, domain, type); no onchain call unless onchain fields are added later.

**Delete**: Remove or clear local metadata for vault id; optionally call program close_vault if supported.

---

## Part 2 – Local & Devnet Testing

### Unit tests (Mollusk) – ~1 hr

**Location**: [programs/keyshield/tests/](programs/keyshield/tests/)

**Layout**:
- `tests/common/mod.rs` or `tests/fixtures.rs` – PDA helpers, system program, Rent, account vecs.
- `tests/store_key.rs` – success, double init (VaultAlreadyExists), wrong signer.
- `tests/access_key.rs` – owner access, non-owner no proof (InvalidZKProof), non-owner with proof.
- `tests/share_key.rs` – owner creates share, non-owner reject.

**Fixtures**: `vault_pda(owner)`, `share_pda(vault, recipient)`; program ID from `target/deploy/keyshield-keypair.json` or fixed test keypair. Instruction data: discriminator byte (0/1/2) + payload (StoreKey 106 bytes, ShareKey min 41 bytes).

**Commands**:
```bash
cargo build-sbf
cargo test
```
(Not `cargo test-bpf`; use `cargo build-sbf` then `cargo test`.)

### Integration (Surfpool) – ~1 hr

**Setup**:
```bash
# Install (if needed)
cargo install surfpool
surfpool start --background
```

**Script**: [scripts/integration-surfpool.mjs](scripts/integration-surfpool.mjs) – connect to `http://localhost:8899`, deploy or use existing program, run StoreKey → AccessKey (owner) → verify vault account.

**Run**: `node scripts/integration-surfpool.mjs`

### Devnet smoke – ~30 min

**README**: Document in [README.md](README.md) or [programs/keyshield/README.md](programs/keyshield/README.md):
```bash
./scripts/deploy.sh devnet
solana account <vault-pda> --url https://api.devnet.solana.com
# Or: ./scripts/verify-vault.sh <wallet>
```

**CI**: Add GitHub Actions job (optional): unit tests (`cargo build-sbf && cargo test`); later integration (Surfpool start + script).

---

## Part 3 – Roadmap (short)

1. **Multi-browser detection/paste** (2–3 days): Test Chrome, Firefox, Safari; paste event + `navigator.clipboard.readText()`; handle `chrome.runtime.lastError` after sendMessage for inject. File: [extension/src/content/content-script.ts](extension/src/content/content-script.ts).
2. **Vault Audit Report** (3–5 days): ReportViewer + `generateReport` (vaults + metadata); html2pdf.js; dashboard report page + extension "Generate Report" button; client-side only.

---

## Order of work (next 1–2 weeks)

1. **Step 4–6 (hybrid list)** – merge on load, keep search, add/update/delete.
2. **Mollusk unit tests** – fixtures, store_key, access_key, share_key.
3. **Surfpool script + devnet README** – integration script, document deploy + verify.
4. **Multi-browser polish** – next.
5. **Report generator** – after list is stable.

Commit and push to repo when ready.
