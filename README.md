<p align="center">
  <img src="src/web/public/keyshield.svg" alt="KeyShield" width="64" height="64" style="filter: brightness(0) invert(1);" />
</p>

<h1 align="center">KeyShield</h1>

<p align="center">
  Zero-trust API key proxy: encrypt keys in your vault, call providers through KeyShield — agents hold a session token, not raw <code>sk-</code>.
</p>

<p align="center">
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://solana.com"><img src="https://img.shields.io/badge/Solana-wallet-9945ff?logo=solana&logoColor=white" alt="Solana" /></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/Python-3.12-3776ab?logo=python&logoColor=white" alt="Python" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
</p>

---

## How it fits together

- **Dashboard** encrypts vault entries on your machine and ties them to your wallet + session.
- **API** verifies your session (`Authorization: Bearer …`), looks up ciphertext in the vault registry, decrypts once per outbound request, and forwards upstream with **`X-Upstream-API-Key`** — plaintext is never written to proxy disk.
- **Agents** only configure **`KS_TOKEN`** (and **`KS_BASE`**). They never see your OpenAI/Helius keys.

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

## Agents — one hook to your vault

Your job is two env vars plus the SDK or raw HTTP:

| Variable | Meaning |
|----------|---------|
| `KS_TOKEN` | Session token minted after you sign in (`ksv2_…`). Copy from the dashboard **Developer** section (same place you’d paste for curl). |
| `KS_BASE` | API origin, e.g. `https://api.ks.aileena.xyz` (local dev usually `http://127.0.0.1:8001`). |

**Python** (canonical module shipped with the repo backend is `keyshield_sdk`; see [`src/backend/keyshield_sdk.py`](src/backend/keyshield_sdk.py); PyPI sibling in [`python-sdk/README.md`](python-sdk/README.md)):

```bash
export KS_TOKEN="ksv2_..."           # from dashboard Developer
export KS_BASE="https://api.ks.aileena.xyz"
```

```python
import os
from keyshield_sdk import KeyShield

ks = KeyShield(
    base_url=os.environ["KS_BASE"],
    token=os.environ["KS_TOKEN"],
)
# Keys are fetched from YOUR vault server-side — not pasted in code:
client = ks.openai_client()
client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "ping"}],
)
```

PyPI: `pip install keyshield` → `from keyshield import KeyShield` (same token + vault flow; see [`python-sdk/README.md`](python-sdk/README.md)).

**Without Python:** **[`docs/API.md`](docs/API.md)** walks **wallet/token → `/manage/store` → `/proxy/{upstream}/...`** with paste-ready curl (same token model agents use).

**Delegated bots:** register an agent pubkey in the UI (Agents tab / API), ship an ed25519 key to your process — **`AgentKeyShield`** in [`python-sdk/README.md`](python-sdk/README.md).

**CLI / scripted bootstrap:** `curl -fsSL https://api.ks.aileena.xyz/install.sh | bash` (script is served by the API; use `http://127.0.0.1:8001/install.sh` when running backend locally). The dashboard **Docs** tab shows the same pattern with `$API_BASE` for your deployment. Put `KS_TOKEN` from **Developer** into `.env`.

Flow in one sentence: **store upstream keys once in the dashboard (or extension), paste `KS_TOKEN` into every runtime that should call upstreams through KeyShield.**

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

**Local dev** (`node dev.cjs`): prefer `KS_BASE=http://127.0.0.1:8000` so traffic hits the **Rust proxy** (HeliusClient cache + single-flight dedup). Python agents: `keyshield_sdk` / PyPI `keyshield`. Reference: [`docs/API.md`](docs/API.md).

---

## One-click bootstrap & deploy

| Goal | Where |
|------|--------|
| **CLI / env on your machine** | `curl -fsSL https://api.ks.aileena.xyz/install.sh \| bash` — then put `KS_TOKEN` from **Developer** into `.env` (local API: `http://127.0.0.1:8001/install.sh`). |
| **Full stack locally** | `node dev.cjs` → [DEVELOPMENT.md](DEVELOPMENT.md) |
| **Production** (Vercel, Railway, Cloudflare, DNS) | [DEPLOY.md](DEPLOY.md) |

---

## Architecture (one diagram)

Encrypted vault payloads sync via the **Cloudflare Worker** (`/vault/:id`). Proxy, billing, agents, sessions live on **Python FastAPI** (`KS_BASE`). Full ASCII + split-brain rationale used to live in this README — now summarized in **`docs/architecture/system-design.md`** and **`docs/technical/SYNC_VAULT_ARCHITECTURE.md`**.

---

## Security extras (extension crypto, autofil, backups)

Historical deep dive — browser extension ciphertext to `/manage/store`, fingerprint UX, backups — remains in **`docs/`** + git history under `README` before 2026-05. Start with **`src/extension/README.md`**.

Short model: encrypted at storage boundary; proxy uses keys in memory only for the upstream hop.

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
| [**docs/zh/path-a-plain-language.md**](docs/zh/path-a-plain-language.md) | Path A 密码学科普（中文人话） |
| [**AGENTS.md**](AGENTS.md) | Trading/agent stack design guide |
| [**CHANGELOG.md**](CHANGELOG.md) | What shipped when |
| [**DEVELOPMENT.md**](DEVELOPMENT.md) | Maintainer setup |

---

## License

MIT
