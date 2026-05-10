# 14 — Dashboard → On-Chain: how the "Create on-chain signer" button works

> **Status: spec v1.** Written 2026-05-10. Companion to spec 10
> (EphemeralSigner) and spec 13 (Agent Access). Covers the **dashboard
> CTA path** — the user clicks a button on `/app/agents`, and an
> on-chain `CreateEphemeralSigner` instruction lands on Solana devnet
> within ~5 seconds. No CLI, no SDK. This is the demo path.

---

## What the user does

1. Logs into the dashboard (Path A passkey unlock or wallet-adapter).
2. Navigates to `/app/agents` — the agent list page.
3. Clicks **"Create on-chain signer"** in the **On-chain** column for
   any agent that doesn't yet have an embedded wallet.
4. Phantom or Solflare pops the sign-tx modal. User clicks **Approve**.
5. The button cycles through `connect → build → sign → confirm`,
   then renders an **Explorer link** to the confirmed tx.

End state: the agent has an `EphemeralSigner` PDA owned by the live
program `DHPTRYbLXSkrM9xYoU2ZJ1HhHWf3huvNoqFvXf5S6EBj`, ready to
authenticate `/proxy/*` calls without the user re-signing.

---

## Where it lives

| Layer | File | What runs here |
|---|---|---|
| **Frontend (`src/web/`)** | `components/CreateAgentSignerButton.tsx` | 277-line stateful button — connect / build / sign / confirm / Explorer-link UI |
| | `pages/Agents.tsx` | renders the button per agent row in the "On-chain" column |
| | `providers/SolanaProvider.tsx` | `<ConnectionProvider><WalletProvider>` wrapping the whole app, devnet RPC, Phantom + Solflare adapters |
| | `main.tsx` | wraps `<App>` in `<SolanaProvider>` |
| **Shared (`packages/shared/`)** | `api/index.ts:buildAgentSignerTx()` | typed fetch to backend; returns `{programId, keys, data, rpcUrl, cluster}` |
| | `auth/auth-pathA.ts:detectWallets()` + `connectWalletByKey()` | lower-level `window.phantom`/`window.solflare` detection (no wallet-adapter dep needed for the actual sign call) |
| **Python (`src/backend/`)** | `routes/agents.py` — `POST /agents/{agent_id}/wallet/build-tx` | builds the unsigned ix via `agent_wallet.py`; returns the wire shape |
| | `agents/agent_wallet.py` | builds `CreateEphemeralSigner` ix using settler keypair + agent pubkey + program ID |
| **On-chain (`src/programs/keyshield/`)** | `instructions/create_ephemeral_signer.rs` (#23) | initialises the `EphemeralSigner` PDA seeded by `[b"signer", agent_pubkey]` |

---

## Wire shape

### Request

```http
POST /agents/{agent_id}/wallet/build-tx
Authorization: Bearer <session_token>
Content-Type: application/json

{
  "owner_pubkey": "F6AhYT67tiCkY8we5MJRNiUJCBLQNiaFjeQvYxTpJ52R"
}
```

### Response

```json
{
  "programId": "DHPTRYbLXSkrM9xYoU2ZJ1HhHWf3huvNoqFvXf5S6EBj",
  "keys": [
    {"pubkey": "...", "isSigner": true,  "isWritable": true},
    {"pubkey": "...", "isSigner": false, "isWritable": true},
    {"pubkey": "11111111111111111111111111111111", "isSigner": false, "isWritable": false}
  ],
  "data": "BASE64_ENCODED_IX_DATA",
  "rpcUrl": "https://api.devnet.solana.com",
  "cluster": "devnet"
}
```

### Error states

| HTTP | Body | Cause | Frontend handles |
|---|---|---|---|
| 401 | `{detail: "..."}` | session expired | redirect `/auth/login` |
| 404 | `{detail: "agent not found"}` | invalid `agent_id` | inline error |
| 409 | `{detail: "signer already exists"}` | re-run | hide button, show existing PDA |
| 500 | `{detail: "..."}` | settler env not wired | inline error + retry CTA |

### Frontend tx assembly

```ts
const resp = await buildAgentSignerTx({ agent_id, owner_pubkey });

const programDataBytes = Uint8Array.from(atob(resp.data), c => c.charCodeAt(0));
const ix = new TransactionInstruction({
  programId: new PublicKey(resp.programId),
  keys: resp.keys.map(k => ({
    pubkey: new PublicKey(k.pubkey),
    isSigner: k.isSigner,
    isWritable: k.isWritable,
  })),
  data: programDataBytes,
});

const conn = new Connection(resp.rpcUrl, 'confirmed');
const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
const tx = new Transaction({ feePayer: ownerPubkey, blockhash, lastValidBlockHeight }).add(ix);

const sig = await wallet.signAndSendTransaction(tx);  // window.phantom / window.solflare
await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

// Render Explorer link:
// https://explorer.solana.com/tx/${sig}?cluster=devnet
```

---

## Why these choices (alternatives considered)

### Why a `build-tx` endpoint, not "send the signed tx through the backend"

The button could have called `/agents/{id}/wallet/create` (a
hypothetical "do everything" endpoint that takes a signature, builds
+ submits, and returns the tx hash). That was rejected because:

1. **Server doesn't need to know the user's keypair.** Returning an
   unsigned ix and letting the wallet sign keeps the trust boundary
   tight — backend never sees a private key.
2. **The wallet sees what it's signing.** A trusted-server-builds-and-
   submits flow gives the wallet adapter a binary "sign anything"
   prompt; this flow gives a structured tx with keys + data the wallet
   UI can decode.
3. **Devnet RPC URL travels with the response.** The backend dictates
   which cluster (devnet for the demo, mainnet later); the frontend
   doesn't have to hardcode it. One env variable change in the backend
   moves the whole demo to a different cluster.

### Why `window.solana` detection, not `useWallet()` from wallet-adapter-react

`packages/shared/src/auth/auth-pathA.ts` already has
`detectWallets()` + `connectWalletByKey()` for the passkey login flow.
Reusing them here means:

- No second `<WalletProvider>` context (we have one for the modal in
  `SolanaProvider.tsx`, but the button doesn't read from it).
- One source of truth for wallet adapters (Phantom / Solflare /
  Backpack get added to `auth-pathA.ts`'s registry, both the login and
  this button pick them up automatically).
- `signAndSendTransaction()` on `window.solana` is the lowest-level
  primitive — works in any browser the user has the wallet extension
  installed in, no adapter shim needed.

The wallet-adapter-react setup in `SolanaProvider.tsx` is kept for the
**connect modal** (UI for "click here to choose Phantom or Solflare"
when the user has neither installed). The button's actual sign-call
goes through the lower-level path.

### Why we synthesize a devnet `MppConfig` if env isn't wired

`agent_wallet.py` looks at `KS_MPP_CONFIG_*` env vars to know which
program ID + RPC to use. For the demo we want this to **just work**
without operator setup. So if those env vars are absent, the route
falls back to a hardcoded devnet config:

```python
MppConfig(
    program_id="DHPTRYbLXSkrM9xYoU2ZJ1HhHWf3huvNoqFvXf5S6EBj",
    rpc_url="https://api.devnet.solana.com",
    cluster="devnet",
)
```

Production deployments must set those env vars. The fallback is
explicitly logged as a warning so it's visible in operator logs.

---

## Demo verification

End-to-end check, no UI:

```bash
node src/scripts/demo-devnet.mjs
```

This script connects to devnet, loads `~/.config/solana/id.json`,
queries the deployed program account, and prints the deploy slot +
ProgramData PDA size. Exit 0 means the on-chain piece is healthy.

For the UI path, see `landing/DEMO-SCRIPT.md` for the 60s + 90s
walkthrough scripts that drive the dashboard CTA + show the Explorer
link.

---

## Out of scope (future specs)

- **`/app/agents` permission gating.** Currently any logged-in user
  sees the button on every agent row; spec 17 will cover the access
  matrix (owner vs collaborator vs viewer).
- **Mainnet promotion.** When the program migrates from devnet to
  mainnet, the backend's `MppConfig` fallback flips and a new build
  hash gets pinned. Document the cutover.
- **MPP stream open from this same flow.** The `MppStreamOpener.tsx`
  component (added alongside this button) covers the next on-chain
  step (`OpenStream` ix) — see spec 15 (TBD) for the full agent
  lifecycle on-chain.
