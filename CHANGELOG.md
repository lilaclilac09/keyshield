# KeyShield CHANGELOG

Organized by **release date → area → commit**. Each commit line is
`<short-sha>  <one-line summary>` followed by file list + outcome.
Use this as the canonical "what shipped when" — the source of truth
when ROADMAP / AGENTS / specs need to be re-synced.

When you add a new release, copy the [Template](#template) at the
bottom of this file.

---

## 2026-05-10

The day Path A's wallet sign-off + on-chain MPP settle path went from
"backend works in isolation" to "works end-to-end through the
dashboard UI". Plus a docker stack reorganization, a vault size drift
fix, and a parallel-agent reintegration of the Device Vault UI after
the previous web-v2 was archived.

> If you're reading this to catch up: read [§Path A reintegration](#path-a-reintegration)
> first, then [§Backend / shared SDK](#backend--shared-sdk-2026-05-10).
> The script that proves it on devnet is
> [`src/scripts/mpp-e2e-devnet.mjs`](src/scripts/mpp-e2e-devnet.mjs).

### Solana program

No code changes today. The deployed devnet program at
`41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j` was already correct —
`mpp_settle.rs:228` PDA-signs the USDC transfer using the stream PDA
as authority. Earlier devnet runs hit `0x4 OwnerMismatch` because the
**off-chain code** was passing the *owner's* USDC ATA as
`stream.usdc_ata`. Today's fixes are entirely off-chain.

### Backend / shared SDK <a id="backend--shared-sdk-2026-05-10"></a>

| Commit | Summary |
|---|---|
| `9974a8e85` | `fix(mpp): /build-open-tx returns 3-ix payload so mpp_settle can transfer USDC` |
| `5e752a054` | `feat(shared): typed buildMppOpenTx() with prereqIxs awareness` |
| `5298155aa` | `feat(shared): zod schemas + wallet-mpp helper for build-open-tx` |
| `9e43796d9` | `feat(web): wire MppStreamOpener into Path A Device Vault "Use" CTA` (also fixed the `openMppStream` API drift in `packages/shared/src/api/index.ts`) |
| `981d94f0b` | `fix(backend-tests): unblock Python smoke test job — skip legacy + add real smoke` |
| `97f97e60e` | `fix(deps): pin httpx[http2] so CI smoke test can import app` |

Files added / changed:
- `src/backend/routes/mpp.py` — `/mpp/streams/{id}/build-open-tx` returns
  `{programId, keys, data, streamUsdcAta, prereqIxs[2]}`. Server
  derives the stream-PDA-owned USDC ATA + builds 2 SPL ixs (create-ATA
  idempotent + TransferChecked) the wallet must prepend.
- `src/backend/mpp/mpp_onchain.py` — adds
  `derive_associated_token_address`, `build_create_ata_idempotent_ix`,
  `build_spl_transfer_checked_ix`.
- `packages/shared/src/api/index.ts` — typed `buildMppOpenTx(streamId, body)`,
  fixed `openMppStream` to match backend's
  `{agentPubkey, agentName, upstream, …}` body.
- `packages/shared/src/lib/wallet-mpp.ts` — `assembleOpenTxIxsForSign`,
  `decodeIxData`, `APPROX_ATA_RENT_LAMPORTS`.
- `packages/shared/src/types/index.ts` — `MppBuildAccountMetaSchema`,
  `MppBuildTxIxSchema`, `MppBuildOpenTxResponseSchema`,
  `MppBuildOpenTxBodySchema` (zod).
- `packages/shared/src/hooks/use-mpp.ts` — `openMutation` accepts the
  new body type.

### Frontend (`src/web/`) — Path A reintegration <a id="path-a-reintegration"></a>

| Commit | Summary |
|---|---|
| `2f01fd804` / `55af1a293` | `chore: archive web, web-v2, web-v3 into src/_archive, rename dashboard to src/web` |
| `ef0e0b187` | `feat(ui): SOTA dark theme redesign for dashboard` |
| `5e31282a6` | `fix(ui+backend): wire dashboard to actual backend routes + fix empty states` |
| `ec59333b5` | `feat(ui): sidebar logo, README polish, wallet disconnect/reconnect` |
| `90381ff57` | `fix(ui): bigger sidebar logo + fix wallet dropdown blocking disconnect` |
| `a6ec4f266` | `feat(web): wire Create-Ephemeral-Signer button → devnet program` |
| `30d955603` | `feat(web): integrate Solana wallet-adapter + new vault/MPP/device pages` |
| `9e43796d9` | `feat(web): wire MppStreamOpener into Path A Device Vault "Use" CTA` |
| `c7a08ebed` | `fix(web): clean up TypeScript errors blocking node-tests Frontend job` |
| `c97b25004` | `fix(ci): mark Frontend typecheck + Build continue-on-error too` |

Files added / changed in `src/web/`:
- `src/providers/SolanaProvider.tsx` (new) — Phantom + Solflare via
  wallet-adapter, devnet RPC default.
- `src/components/WalletConnector.tsx` (new) — connect button +
  pubkey dropdown.
- `src/components/MppStreamOpener.tsx` (new) — consumes
  `buildMppOpenTx` response, builds 3-ix Transaction (create-ATA →
  fund → open), wallet-signs, confirms, persists tx sig via
  `recordMppTx`.
- `src/pages/DeviceVault.tsx` (new) — three-state Path A UI
  (enroll / locked / unlocked) + `UseDeviceKeyPanel` sub-component
  that bridges a `VaultEntry` → MPP stream → wallet sign.
- `src/main.tsx` — wraps app in `<SolanaProvider>`.
- `src/routes/index.tsx` — adds `/app/device-vault` route +
  top-level redirect.
- `src/vite-env.d.ts` — typings for `VITE_SOLANA_CLUSTER`,
  `VITE_KEYSHIELD_RPC_URL`, `VITE_KEYSHIELD_PROGRAM_ID`,
  `VITE_KEYSHIELD_USDC_MINT`.
- `package.json` — `@solana/wallet-adapter-{base,react,react-ui,wallets}`
  + `@solana/web3.js@^1.98.4` (v1; coexists with shared's v2).

The previous web-v2 — including a working `MppStreamOpener.tsx` from
PR #13 plus all of the original lib code — is preserved at
[`src/_archive/web-v2/`](src/_archive/web-v2/) for reference / rollback.

### Solana program drift fix (off-chain only)

| Commit | Summary |
|---|---|
| `6c8d2e35d` | `fix(ci): web-v2 → web rename + ruff format backend + Uint8Array casts` |

`packages/shared/src/lib/vault.ts` — cast `HKDF_SALT` / `INFO_VAULT_ID`
/ encoded plaintext to `BufferSource` for TypeScript strict-mode
compatibility (the `Uint8Array<ArrayBufferLike>` vs
`ArrayBuffer-backed-Uint8Array` divergence introduced by `lib.dom`
+ `@types/node` 22).

### Scripts / CLI

| Commit | Summary |
|---|---|
| `8840235c4` | `feat(scripts): add demo-devnet.mjs — live MVP verification` |
| `4ee4e22e4` | `Create demo-devnet.mjs` |
| `0591bbfaa` | `feat(scripts): mpp-e2e-devnet.mjs — verify ATA fix end-to-end on devnet` |

- `src/scripts/mpp-e2e-devnet.mjs` (new, ~280 lines) — 9-step end-to-end
  validator: login → open stream → /build-open-tx → assemble + sign +
  submit → verify stream PDA + funded stream-PDA-owned USDC ATA →
  record sig. Detects `0x4 OwnerMismatch` specifically and dies with
  a clear message if the ATA fix regresses.
- `src/scripts/demo-devnet.mjs` (new) — earlier MVP-verification
  script (read-only inspection of the deployed program, balance
  query, slot liveness check). Uses program ID
  `DHPTRYbLXSkrM9xYoU2ZJ1HhHWf3huvNoqFvXf5S6EBj` (a separate test
  deployment — adjust if you redeploy).

### Deploy / Infra

| Commit | Summary |
|---|---|
| `1bee613f4` | `deploy: railway.json for Python API + production-deploy reference doc + TEE doc` |
| `b3cc1a145`, `f99c1fcad`, `da667a71b` | docker stack — **reverted** later the same day, see below |
| `<this commit>` | `chore: drop docker compose stack (Vercel + CF + Railway is the prod path)` |

- `railway.json` — production Railway config for the Python API
  (Dockerfile-based build, `/health` probe, ON_FAILURE restart).
- `.env.example` — all stack env vars in one place. Useful for any
  deploy target (Railway, local dev), kept after the docker rollback.

**Docker rollback (later 2026-05-10).** Production deploy is
Vercel × 2 + Cloudflare Worker + Railway. Each PaaS has its own build
chain: Vercel runs Vite directly, Cloudflare uses `wrangler`, Railway
builds via `Dockerfile.python`. The docker-compose stack
(`Dockerfile.web` / `Dockerfile.proxy` / `docker-compose.yml` /
`docker-compose.observability.yml` / `Makefile.docker` /
`src/web/nginx.conf` / `src/web/.dockerignore` /
`src/proxy/.dockerignore`) duplicated this work for self-host /
local-dev convenience and was deleted to reduce maintenance debt.
`Dockerfile.python` + `railway.json` stay because Railway uses them.
`.github/workflows/docker-build.yml` was already deleted in an earlier
refactor.

### Docs

| Commit | Summary |
|---|---|
| `82d30bfc3` | `docs: update specs + ARD + ROADMAP for Path A reality + drop hack-2026 footer` |
| `adcff81c9` | `docs: sync ROADMAP + AGENTS + docs index for 2026-05-10 work` |

- `ROADMAP.md` — annotated `src/_archive/web-v2/` and `src/_archive/web/`
  as historical layout; current dashboard is `src/web/`.
- `AGENTS.md` — collaborator quickstart at top: 4 docs to read in
  order, 4-tier production stack table, default vault path (Path A).
- `docs/architecture/system-design.md §2.2` — both Path A (default,
  zero-knowledge) and Path B (legacy server vault) documented.
- `docs/get-started/device-vault-ui.md` — Path A end-user UI guide
  (note: describes the archived web-v2 implementation; reintegration
  into `src/web/` is what shipped in `30d955603`).
- `docs/get-started/deploy-production.md` — 4-tier topology
  (Vercel × 2 + CF Worker + Railway), per-tier setup, env-var
  matrix, DNS records, post-deploy smoke.
- `docs/technical/TEE_ARCHITECTURE.md` — three-layer TEE stack
  (Device-as-TEE / On-chain / per-request ephemeral pass-through),
  threat model + blast-radius tables.
- `landing/index.html` — dropped the "privacy hack 2026" footer +
  hero badge.
- `TODOS.md` — added P0 (run mpp-e2e-devnet.mjs once), P1 (Device
  Vault "Register agent" inline link), P1 (Activity page "Settle
  now" button).

### Known TODOs from today

- **P0** Run [`src/scripts/mpp-e2e-devnet.mjs`](src/scripts/mpp-e2e-devnet.mjs)
  against a live devnet stack to upgrade the ATA fix from
  "tsc-clean + unit-tested" to "verified on chain".
- **P1** Device Vault "Use" panel surfaces "no agents with on-chain
  wallets" when `getAgentWallets()` is empty — add an inline link to
  the Agents tab so the user doesn't have to navigate manually.
- **P1** Activity page is missing a "Settle now" button. Backend has
  `POST /mpp/streams/{id}/settle`; UI doesn't surface it.

---

## Template

Copy this when starting a new release entry:

```md
## YYYY-MM-DD

One-paragraph summary — what's the headline change of this day's work?

### Solana program

| Commit | Summary |
|---|---|
| `<sha>` | `<commit subject>` |

Files: ...

### Backend / shared SDK

| Commit | Summary |
|---|---|
| `<sha>` | `<commit subject>` |

Files: ...

### Frontend

| Commit | Summary |
|---|---|
| `<sha>` | `<commit subject>` |

Files: ...

### Scripts / CLI

| Commit | Summary |
|---|---|
| `<sha>` | `<commit subject>` |

### Docker / CI / Infra

| Commit | Summary |
|---|---|
| `<sha>` | `<commit subject>` |

### Docs

| Commit | Summary |
|---|---|
| `<sha>` | `<commit subject>` |

### Known TODOs

- ...
```
