<p align="center">
  <img src="src/web/public/keyshield.svg" alt="KeyShield" width="64" height="64" style="filter: brightness(0) invert(1);" />
</p>

<h1 align="center">KeyShield</h1>

<p align="center">
  Zero-trust API key vault: encrypt on your device, route calls through KeyShield — one dashboard, optional extension, no raw keys on our disks.
</p>

<p align="center">
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://solana.com"><img src="https://img.shields.io/badge/Solana-wallet-9945ff?logo=solana&logoColor=white" alt="Solana" /></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/Python-3.12-3776ab?logo=python&logoColor=white" alt="Python" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
</p>

---

## How it fits together

- **Dashboard (+ optional extension)** stores provider keys encrypted on your side; ciphertext syncs where Path A applies.
- **API** verifies your session (`Authorization: Bearer …`), resolves vault ciphertext, decrypts once per outbound request, and forwards upstream — plaintext is only in memory for that hop.
- **Scripts and apps** talk to **`docs/API.md`** (REST + Bearer token). An optional Python package exists for convenience; **the contract is HTTP**, not a required SDK.

---

## Production URLs

| What | URL |
|------|-----|
| Marketing | https://ks.aileena.xyz |
| App (vault, Developer token) | https://app.ks.aileena.xyz |
| API (proxy + auth) | https://api.ks.aileena.xyz |
| Vault sync worker (encrypted blob storage) | Cloudflare Worker (`src/infra/sync-worker`) |

---

## You — browser + vault (human)

1. Open **https://app.ks.aileena.xyz** → connect Solana wallet → unlock vault (signature / passkey flow in the UI).
2. Add secrets under **Vault** or **Device vault** — they stay encrypted relative to Path A sync + your credentials.
3. **Optional:** load the unpacked extension (**Chrome** → `chrome://extensions` → Developer mode → **Load unpacked** → choose `src/extension/` — must contain `manifest.json`). Steps and troubleshooting → [`src/extension/README.md`](src/extension/README.md).  
   Same browser profile: finish login on the dashboard so the extension can receive your session, then provider sites can show **Save to vault** prompts.
4. In-app **Docs** tab also summarizes extension install next to the terminal quickstart.

---

## Integrators — REST first

Copy **`KS_TOKEN`** (`ksv2_…`) from the dashboard **Developer** tab and **`KS_BASE`** (e.g. `https://api.ks.aileena.xyz`). Every flow is spelled out in **[`docs/API.md`](docs/API.md)** (`/proxy/{upstream}/…`, wallet auth, vault storage).

Optional conveniences (same vault, same token):

- **Python:** in-repo **[`src/backend/keyshield_sdk.py`](src/backend/keyshield_sdk.py)** or PyPI **[`python-sdk/README.md`](python-sdk/README.md)** — wrapper only; not required for HTTP callers.
- **CLI / bootstrap:** `curl -fsSL https://api.ks.aileena.xyz/install.sh | bash` (local API: `http://127.0.0.1:8001/install.sh`).

Delegated automation (registered pubkey, scoped token) lives in **`docs/API.md`** and **`python-sdk/README.md`** — see **`AGENTS.md`** only if you are wiring the trading / bot stack described there.

---

## Run locally

```bash
bash src/scripts/dev.sh
```

Frontend alone: `cd src/web && npm install && npm run dev` • API alone: [`DEVELOPMENT.md`](DEVELOPMENT.md)

---

## Helius RPC — fast path

Store your **Helius** API key once (`upstream: helius` via dashboard **Vault** or `POST /manage/store`). Then call Solana JSON-RPC **with only** `KS_TOKEN` — no raw Helius key in your script.

```bash
export KS_BASE="https://api.ks.aileena.xyz"   # production
export KS_TOKEN="ksv2_..."                    # Dashboard → Developer

curl -s -X POST "$KS_BASE/proxy/helius/" \
  -H "Authorization: Bearer $KS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["YOUR_WALLET_PUBKEY"]}'
```

**Local dev** (`node dev.cjs`): prefer `KS_BASE=http://127.0.0.1:8000` so traffic hits the **Rust proxy** (HeliusClient cache + single-flight dedup). Full curl patterns: **[`docs/API.md`](docs/API.md)**.

---

## One-click bootstrap & deploy

| Goal | Where |
|------|--------|
| **CLI bootstrap** | `curl -fsSL https://api.ks.aileena.xyz/install.sh \| bash` — then add `KS_TOKEN` from **Developer** to `.env` if you use the scripted helpers (local API: `http://127.0.0.1:8001/install.sh`). |
| **Full stack locally** | `node dev.cjs` → [DEVELOPMENT.md](DEVELOPMENT.md) |
| **Production** (Vercel, Railway, Cloudflare, DNS) | [DEPLOY.md](DEPLOY.md) |

---

## Architecture (one diagram)

Encrypted vault payloads sync via the **Cloudflare Worker** (`/vault/:id`). Proxy, billing, sessions, and automation features live on **Python FastAPI** (`KS_BASE`). Full ASCII + split-brain rationale: **`docs/architecture/system-design.md`**, Path A wire format: **`docs/technical/SYNC_VAULT_ARCHITECTURE.md`**, crypto overview: **`docs/technical/cryptography.md`**.

---

## Cryptography

**Primitives + threat model (Path A sync vault, extension HKDF, proxy hot path):** **[`docs/technical/cryptography.md`](docs/technical/cryptography.md)**.  
Path A wire format and JWT flow: **[`docs/technical/SYNC_VAULT_ARCHITECTURE.md`](docs/technical/SYNC_VAULT_ARCHITECTURE.md)**.  
Chinese overview: **[`docs/zh/path-a-plain-language.md`](docs/zh/path-a-plain-language.md)**.  
Extension ciphertext, fingerprint UX, backups: **`src/extension/README.md`**.

Short model: ciphertext at the storage boundary; API decrypts upstream keys in RAM only for the proxy hop; callers use a token, not pasted provider secrets.

---

## Repo map (short)

- `src/backend/` — FastAPI (`keyshield_sdk.py`, proxy, auth).
- `src/web/` — Vite/React dashboard hosted at **app.ks.aileena.xyz**.
- `src/extension/` — unpacked Chrome/Firefox extension.
- `src/infra/sync-worker/` — Worker + R2 for Path A ciphertext.
- `docs/API.md` — single reference for integrators.

---

## More reading

| Doc | Purpose |
|-----|---------|
| [**docs/API.md**](docs/API.md) | Tokens, endpoints, curl |
| [**docs/technical/cryptography.md**](docs/technical/cryptography.md) | Primitives, Path A vs extension, who sees plaintext |
| [**docs/zh/path-a-plain-language.md**](docs/zh/path-a-plain-language.md) | Path A 密码学科普（中文人话） |
| [**AGENTS.md**](AGENTS.md) | Optional: trading/agent stack patterns (advanced) |
| [**CHANGELOG.md**](CHANGELOG.md) | What shipped when |
| [**DEVELOPMENT.md**](DEVELOPMENT.md) | Maintainer setup |

---

## License

MIT
