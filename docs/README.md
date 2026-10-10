# KeyShield Documentation

Operator guides, get-started flows, and architecture notes.

---

## 🚀 Start here

**[`API.md`](API.md)** — single reference for every endpoint + auth flow + curl/Python/JS examples + extension install. If you're calling the API or writing code against KeyShield, this is the only doc you need to open first.

**[repository-index/](repository-index/README.md)** — numbered folders that **link** every tracked file (`KS-00-001` …). Originals stay in place.

---

## Structure

| Path | Contents |
|------|----------|
| **[API.md](API.md)** | **Single API reference (auth → token → vault → proxy)** |
| **[repository-index/](repository-index/README.md)** | **Numbered file index (00–12, 90). Originals stay put.** |
| [get-started/](get-started/) | CLI install, local dev, self-host, top-up with SOL, frontend integration |
| [architecture/](architecture/) | System design + architecture overview |
| [DEVNET.md](DEVNET.md) | Devnet deployment guide |
| [DEMO_RECORDING_SCRIPT.md](DEMO_RECORDING_SCRIPT.md) | Record-demo voiceover |
| [DEMO_STORYBOARD.md](DEMO_STORYBOARD.md) | Recorded-take scene table |
| [REVIEWER_QUICKSTART.md](REVIEWER_QUICKSTART.md) | Re-run matrix + Stage 4 gate |
| [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md) | Artifact IDs and verdicts |
| [PROJECT_RESUME.md](PROJECT_RESUME.md) | Submission summary |
| [BUILDING_KEYSHIELD.md](BUILDING_KEYSHIELD.md) | Spec-first essay; e2e journey, goal, and lessons at the bottom |
| [STRESS_TEST_PLAN.md](STRESS_TEST_PLAN.md) / [STRESS_TEST_RESULTS.md](STRESS_TEST_RESULTS.md) | Bounded local stress |
| [EXTENSION.md](EXTENSION.md) | Browser extension build + install |
| [OPERATOR.md](OPERATOR.md) | Operator runbook |
| [PAYMENT-FLOWS.md](PAYMENT-FLOWS.md) | Solana USDC MPP core + x402 / prepaid paths (Tempo vouchers are archived, not live) |
| [technical/cryptography.md](technical/cryptography.md) | Crypto map: Path A PRF, extension HKDF/AES-GCM, proxy hot path |
| [technical/SYNC_VAULT_ARCHITECTURE.md](technical/SYNC_VAULT_ARCHITECTURE.md) | Path A sync vault (wire format, JWT, CAS) |

## Repo root

- [README.md](../README.md) — project overview + quick start
- [keyshield.md](../keyshield.md) — on-chain verification, failure boundaries, 4-stage test matrix
- [AGENTS.md](../AGENTS.md) — agent design guide
- [DEVELOPMENT.md](../DEVELOPMENT.md) — dev environment setup

## Internal

- [internal/](internal/) — roadmap, status, todos, migration history, demo scripts

## Engineering specs

[src/proxy/specs/](../src/proxy/specs/) — numbered specs for each subsystem
(vault format, session, cache, helius routing/client, embedded wallet, etc).
