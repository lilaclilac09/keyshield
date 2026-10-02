# KeyShield Documentation

Operator guides, get-started flows, and architecture notes.

---

## 🚀 Start here

**[`API.md`](API.md)** — single reference for every endpoint + auth flow + curl/Python/JS examples + extension install. If you're calling the API or writing code against KeyShield, this is the only doc you need to open first.

---

## Structure

| Path | Contents |
|------|----------|
| **[API.md](API.md)** | **Single API reference (auth → token → vault → proxy)** |
| [get-started/](get-started/) | CLI install, local dev, self-host, top-up with SOL, frontend integration |
| [architecture/](architecture/) | System design + architecture overview |
| [DEVNET.md](DEVNET.md) | Devnet deployment guide |
| [EXTENSION.md](EXTENSION.md) | Browser extension build + install |
| [OPERATOR.md](OPERATOR.md) | Operator runbook |
| [PAYMENT-FLOWS.md](PAYMENT-FLOWS.md) | x402 + MPP payment flow walkthrough |
| [technical/cryptography.md](technical/cryptography.md) | Crypto map: Path A PRF, extension HKDF/AES-GCM, proxy hot path |
| [technical/SYNC_VAULT_ARCHITECTURE.md](technical/SYNC_VAULT_ARCHITECTURE.md) | Path A sync vault (wire format, JWT, CAS) |

## Repo root

- [README.md](../README.md) — project overview + quick start
- [AGENTS.md](../AGENTS.md) — agent design guide
- [DEVELOPMENT.md](../DEVELOPMENT.md) — dev environment setup

## Internal

- [internal/](internal/) — roadmap, status, todos, GitNexus attach/validate ([GITNEXUS.md](internal/GITNEXUS.md)), migration history, demo scripts

## Engineering specs

[src/proxy/specs/](../src/proxy/specs/) — numbered specs for each subsystem
(vault format, session, cache, helius routing/client, embedded wallet, etc).
