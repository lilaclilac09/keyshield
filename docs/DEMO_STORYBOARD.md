# Demo storyboard

Canonical English shot list for Cursor / Screen Studio:
**[CURSOR_LIVE_STORYBOARD.md](CURSOR_LIVE_STORYBOARD.md)**.

This table is the **harness** take (`bash scripts/record_demo.sh`).
It uses local mock SSE + Unix-socket OpenClaw IPC + **live Devnet RPC**.
It does not unlock a real WebAuthn authenticator. Scene 5’s 502 is a
**labeled mock**. A new on-chain micro-settle is Scene 5 of the Cursor
storyboard, not this table, unless you run the live capture curls.

| ID | Time | Screen | Action | Expected visible result | Caption | Evidence | Fallback |
|---|---|---|---|---|---|---|---|
| S0 | 0:00–0:12 | Browser / curl | `GET /mpp/status` ×2 | Handshake `cached=false` ~200ms; then `cached=true` ~0.00x ms; SOL+USDC | Funded wallet, not faucet | `/mpp/status` | restart uvicorn with `env.sh` |
| S1 | 0:12–0:40 | Chrome + extension | Open `openrouter.ai` ; scan `sk-or-` ; Save | Toast OR; `/demo/openrouter` model id, no secret | Human in a browser | extension log | fixture scan (Linux) |
| S2 | 0:40–1:00 | Dashboard + curl | One-click permit → `/vproxy/openrouter` | Masked `key_prefix`; `latency_ms` this take | Agent holds `KS_TOKEN` | `/keychain/call` | mock if no key |
| S3 | 1:00–1:22 | Terminal | OpenClaw IPC inject | `KS_TOKEN=ksv2_sess_…`; spec `blanks=0`; clipboard 0 | Not Pyth Hermes | openclaw log | sock in workdir |
| S4 | 1:22–1:42 | Terminal | HOLD → record → CAPTURE | `settle_mode` honest | How agents consume | capture JSON | skip if no stream |
| S5 | 1:42–2:08 | Terminal + Explorer | 1 micro-USDC live settle | `submitted` + `getTransaction` err=null; strip updates | Real buy | Explorer | do not fake receipt |
| S6 | 2:08–2:22 | Terminal | Labeled `fault_502` | Clawback; settled does not advance | MOCK banner on | `test:fault` | — |
| S7 | 2:22–2:38 | Terminal | Status cache + `ks-helius` stampede | MISS then JOIN/HIT; `upstream_fires=1` | redb not live | cargo `--nocapture` | skip rust |
| S8 | 2:38–2:50 | `/talk` or Cursor diff | Draft → review → accept | Method A open | Permit after inspect | `/talk` on pay stack | Cursor UI |

Voiceover: [CURSOR_LIVE_STORYBOARD.md](CURSOR_LIVE_STORYBOARD.md).
Harness words: [DEMO_RECORDING_SCRIPT.md](DEMO_RECORDING_SCRIPT.md).
Playback files: [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md).
