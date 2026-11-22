# KeyShield Protocol Specification

**Version:** 0.2  
**Status:** Complete draft, waiting for Aileen's approval. Building waits on this spec.  
**Full design:** [docs/architecture/system-design.md](docs/architecture/system-design.md)

This spec has two parts:

- **Part I (sections 1 to 9): protocol.** What KeyShield is and how keys, tokens and the proxy work. Unchanged from 0.1.
- **Part II (sections 10 to 17): product, acceptance and delivery.** What a person must be able to do with each thing we hand them, and how an agent proves it. Every acceptance rule in Part II comes from Aileen's own workflow files (section 10) and cites the file and line. Where her files say nothing, section 16 says so instead of inventing a standard.

---

## 1. Problem

AI agents require API credentials to call upstream providers (OpenAI, Anthropic, Helius, …). The current default — pasting raw keys into `.env` files or agent configs — means:

- Keys are copied across machines, tools, and teammates
- Revoking access requires rotating the key at the provider, breaking every consumer
- There is no per-agent spending cap or audit trail

KeyShield defines a protocol for **agent credential delegation**: agents receive scoped session tokens, not raw keys. Raw keys never leave the vault.

---

## 2. Core Primitives

| Primitive | Description |
|---|---|
| **Vault** | Two kinds. The **Device Vault** and **ZK mode** rows are encrypted with AES-256-GCM before leaving the device; the server stores ciphertext only (zero-knowledge). The default **hosted vault** (`/manage/store`) keeps a server-readable copy so the hosted proxy can inject it; it is **not** zero-knowledge. See §3. |
| **Session token** | Short-lived bearer token (`ksv2_…`). Scoped to a provider, an optional spending cap, and a TTL. Issued to humans and agents alike. |
| **Proxy** | Hosted proxy (not ZK): accepts a proxy-scope session token, loads the raw key in memory, injects it into the upstream request, then discards it. The key is never written to logs or returned to the agent. ZK-mode keys are refused here (`409 zk_item`) and are injected by a local proxy instead (`keyshield-proxy`, the extension). |

---

## 3. Vault Encryption Model

Keys are encrypted in the user's browser before transmission:

```
passphrase / WebAuthn PRF output / wallet signature
    │
    └── HKDF-SHA256 → 32-byte key
            │
            └── AES-256-GCM encrypt(api_key, nonce) → ciphertext + tag
```

This applies to the **Device Vault** (Cloudflare sync worker) and to **ZK mode**. The server receives and stores only `{ ciphertext, nonce, tag }`. Decryption requires the user's device credential, so the server cannot decrypt at rest.

### 3.1 Which paths are zero-knowledge

| Path | Server can read the key? |
|---|---|
| Device Vault (sync worker) | No: ciphertext only |
| ZK mode, `cipher_v=2` rows (opt-in) | No: ciphertext plus a per-key server share. The client unlocks with the passkey-derived root and the share, then injects locally |
| Hosted vault, `/manage/store` default | **Yes** (not ZK): stored so the hosted `/vproxy` can inject |
| `/proxy` with `X-Upstream-API-Key` | The key passes through the hosted proxy for that request (not ZK at rest or in transit) |

### 3.2 ZK mode (zk-v1)

Full spec and test vectors are in [`docs/zk/ZK-MODE.md`](docs/zk/ZK-MODE.md) and `docs/zk/vectors.json`.

```
R        = HKDF-SHA256(passkey PRF output, info "keyshield/zk/v1/root")
item key = HKDF-SHA256(ikm R, salt S, info "keyshield/zk/v1/item:<id>:<upstream>")
row      = AES-256-GCM(item key, iv, key, aad "<id>|<upstream>")
```

`S` is 32 random bytes per key, kept only by the server and released by `GET /zk/share/{id}` to a valid owner or proxy token. Revoking the token stops new unlocks; clients cache shares for at most 60 s. Once ZK mode is on, `/manage/store` accepts ciphertext only (`409 zk_mode` for plaintext). Migrating means re-saving each key in ZK mode, purging the old rows (`POST /zk/purge-plaintext`) and **rotating the provider keys**, because the old copies were server-readable. The operator can turn ZK mode off globally with `KS_ZK_DISABLED=1`.

---

## 4. Session Token

Format: `ksv2_<base58(random_32_bytes)>`

Token payload (server-side, opaque to caller):

```json
{
  "sub": "<user_id>",
  "vault_key_id": "<provider_key_ref>",
  "provider": "openai",
  "scope": ["chat.completions"],
  "spend_cap_usd": 10.00,
  "exp": 1700000000,
  "iat": 1699996400
}
```

Every token carries a signed scope:

| Scope | Issued to | Allowed |
|---|---|---|
| `owner` | Dashboard passkey / wallet sign-in | Everything, including the vault, decrypt, sessions and agents |
| `proxy` | Agents (`/auth/agent-login`) and developer tokens (`POST /sessions/proxy-token`) | Proxy routes and `/zk/share` only. Vault, decrypt and management routes return `403 insufficient_scope` |

Tokens are verified on every hosted proxy request. A revoked token is rejected within one request cycle (no stale cache window). Local ZK unlocks stop within the 60 s share cache.

---

## 5. Delegation

A human user may issue a **delegated token** to an agent:

- Scope is a strict subset of the user's own permissions
- Spending cap is enforced by the proxy against accumulated usage
- The delegated token can be revoked independently of the parent token
- Revocation is immediate: the next request using the token returns `401`

Agent code receives only the delegated token, never the vault key or raw API key.

```python
from keyshield import KeyShield

ks = KeyShield(token=os.environ["KS_TOKEN"])
client = ks.openai_client()          # raw key never in this process
response = client.chat.completions.create(...)
```

---

## 6. Proxy Request Flow

```
Agent → POST /proxy/openai/v1/chat/completions
         Authorization: Bearer ksv2_…

Proxy:
  1. Verify token signature + expiry
  2. Check revocation list
  3. Check spending cap
  4. Fetch encrypted vault entry
  5. Decrypt raw key (in memory, this request only)
  6. Forward request to upstream with raw key injected
  7. Return upstream response to agent
  8. Record usage against spending cap
```

Raw key exists in memory for the duration of one upstream HTTP round-trip.

---

## 7. Revocation

- Tokens are stored server-side with a `revoked` flag
- Setting the flag takes effect on the next hosted proxy request, with no TTL lag. In ZK mode the server also stops releasing key shares; local proxies stop within their 60 s share cache
- Delegated tokens are independently revocable without affecting the parent
- Users can revoke all tokens for a provider in one action (key rotation equivalent)

---

## 8. Supported Providers (v0.1)

| Provider | Proxy path prefix | Cache eligible |
|---|---|---|
| OpenAI | `/proxy/openai/` | No (stateful completions) |
| Anthropic | `/proxy/anthropic/` | No |
| Helius (Solana RPC) | `/proxy/helius/` | Yes — read-only methods |

Cache uses two-tier memory + disk with single-flight deduplication. Cacheable requests are idempotent, read-only RPC calls (e.g. `getBalance`, `getAccountInfo`).

---

## 9. Out of Scope (v0.1)

- Streaming beyond SSE passthrough
- Webhook endpoints
- Multi-hop delegation chains (depth > 1)
- Cross-user key sharing

---

# Part II: Product, acceptance and delivery

## 10. Sources of the acceptance rules

Aileen decided (2026-11-22) that acceptance follows her own workflow files, not standards written by agents. These are the files, pinned to exact commits. Each rule below cites them by tag and line.

| Tag | File (pinned) | What it is |
|---|---|---|
| `[CR]` | [aileen_machina_01 `CURSOR_RULES.md`](https://github.com/lilaclilac09/aileen_machina_01/blob/624411cfa9348ee29b2a7a844501bc00ca9125a5/CURSOR_RULES.md) | Always-on index for her agents. Names the files below as required reading, in order |
| `[AC]` | [aileen_machina_01 `aileena-new/CLAUDE.md`](https://github.com/lilaclilac09/aileen_machina_01/blob/624411cfa9348ee29b2a7a844501bc00ca9125a5/aileena-new/CLAUDE.md) | Architecture rules (lines 1 to 9) and project guide |
| `[AG]` | [aileen_machina_01 `AGENTS.md`](https://github.com/lilaclilac09/aileen_machina_01/blob/624411cfa9348ee29b2a7a844501bc00ca9125a5/AGENTS.md) | Constitution named by `[CR]` line 3: workflow, evidence, blockers, production ship rules |
| `[QA]` | [`QA.md`](https://github.com/lilaclilac09/aileen_machina_01/blob/624411cfa9348ee29b2a7a844501bc00ca9125a5/QA.md) | Checklist named by `[CR]` |
| `[PR]` | [`.github/pull_request_template.md`](https://github.com/lilaclilac09/aileen_machina_01/blob/624411cfa9348ee29b2a7a844501bc00ca9125a5/.github/pull_request_template.md) | PR form named by `[CR]` |
| `[KF]` | [`docs/KNOWN_FAILURES.md`](https://github.com/lilaclilac09/aileen_machina_01/blob/624411cfa9348ee29b2a7a844501bc00ca9125a5/docs/KNOWN_FAILURES.md) | Verified pitfalls, including KeyShield ones |
| `[DOS]` | [`docs/aileena-design-os.md`](https://github.com/lilaclilac09/aileen_machina_01/blob/624411cfa9348ee29b2a7a844501bc00ca9125a5/docs/aileena-design-os.md) | Design and proof rules named by `[CR]` |
| `[PRJ]` | [`PROJECT_RULES.md`](https://github.com/lilaclilac09/aileen_machina_01/blob/624411cfa9348ee29b2a7a844501bc00ca9125a5/PROJECT_RULES.md) | Product facts, including "KeyShield live" (lines 70 to 76) |
| `[TM]` | [`docs/AGENT_TOOL_MAP.md`](https://github.com/lilaclilac09/aileen_machina_01/blob/624411cfa9348ee29b2a7a844501bc00ca9125a5/docs/AGENT_TOOL_MAP.md) | Task to required tool, including the KeyShield row (line 32) |
| `[VER]` `[DBG]` `[UI]` | [`.cursor/rules/verification.mdc`](https://github.com/lilaclilac09/aileen_machina_01/blob/624411cfa9348ee29b2a7a844501bc00ca9125a5/.cursor/rules/verification.mdc), [`debug-repro-loop.mdc`](https://github.com/lilaclilac09/aileen_machina_01/blob/624411cfa9348ee29b2a7a844501bc00ca9125a5/.cursor/rules/debug-repro-loop.mdc), [`ui-step-screenshot.mdc`](https://github.com/lilaclilac09/aileen_machina_01/blob/624411cfa9348ee29b2a7a844501bc00ca9125a5/.cursor/rules/ui-step-screenshot.mdc) | Rules `[CR]` injects into every session |
| `[HB]` | [aileena-new engineering handbook](https://github.com/lilaclilac09/aileen_machina_01/blob/624411cfa9348ee29b2a7a844501bc00ca9125a5/aileena-new/docs/%E5%B7%A5%E4%BD%9C%E5%87%86%E5%86%8C.md) | Shared engineering standard for people, Cursor and CI |
| `[KS]` | [keyshield `CLAUDE.md`](https://github.com/lilaclilac09/keyshield/blob/6c914c0b075e7f0371113eb05e7639d7f53619d0/CLAUDE.md) | This repo's code-change gates (GitNexus) |
| `[OWN]` | Aileen's chat instructions to the KeyShield agents, 2026-11-19 to 2026-11-22 | Instructions she gave directly that are not in a file. Listed separately so they are not mistaken for file rules |

Several of her files are written in Chinese. This repository rejects Chinese characters in tracked files (`tests/no_cjk.test.ts`), so those rules are quoted here as English translations, with the line to check against the original.

Her files were written for aileena.xyz. The rules below are the ones that apply to any task; rules that only concern aileena.xyz pages (the landing marquee, `/sound`, DJ, MEV, Visual) are not carried over.

---

## 11. What a person must be able to do

KeyShield's purpose, in one line from the README: store a provider key once, and give agents a session token instead of the raw key. The core journey below is the product. A delivery that does not let a person finish it is not accepted, whatever its tests say (`[AG]` line 14, `[DOS]` line 119).

### 11.1 Core journey J1: put an API key in, and let an agent use it

Taken from README "How to use this", steps 1 to 6.

| Step | The person does | The person sees |
|---|---|---|
| J1.1 | Gets KeyShield the way a user would (download and install, load the extension, or open the site) | It opens. No blank window, crash, or diagnostics screen |
| J1.2 | Signs in | A signed-in vault. On `app.ks.aileena.xyz` the door is wallet first, passkey second (`[KF]` 2026-10-05, `[PRJ]` lines 70 to 76, `[TM]` line 32) |
| J1.3 | Unlocks the Device Vault | The vault is unlocked on this device |
| J1.4 | Pastes a provider key (or saves one from the provider page with the extension) | The key appears in the vault list, masked, and is still there after closing and reopening the app |
| J1.5 | Opens Developer and copies a session token | A token for agents. Examples on screen use placeholders, never a real token or key |
| J1.6 | Puts the token in an agent and makes a call | The call reaches the provider through KeyShield. The agent never holds the raw key (Part I, section 5) |

### 11.2 Supporting journeys

| Id | Journey | Source in this repo |
|---|---|---|
| J2 | Delete and replace a stored key; the change survives a reopen and does not touch other keys | README step 4, Part I section 7 |
| J3 | Revoke an agent token; the agent's next call fails | Part I sections 5 and 7 |
| J4 | Lock and unlock again; a locked vault shows no key values | README step 2 |
| J5 | Lose the sync service or network; the app says so plainly and does not lose or silently fail a save | `[DOS]` lines 429 to 446 (status and errors) |

---

## 12. Things we hand to people

Each is a separate delivery with its own acceptance. A pass on one is never reported as a pass on another.

| Surface | Code | How a person gets it | Journeys |
|---|---|---|---|
| Web dashboard | `src/web` | `https://app.ks.aileena.xyz` | J1 to J5 |
| Mac app | `src/desktop` | Download `KeyShield.dmg`, drag to Applications, open | J1 to J5 |
| Chrome extension | `src/extension` | Load unpacked from `src/extension` (README "Chrome extension Sign in") | J1.2, J1.4, J2 |
| iPhone app | `src/ios` (not on `main` yet) | Tester build | J1.1 to J1.5, J2, J4 |
| Agent SDK, CLI, local proxy | `packages/sdk-py`, `packages/mcp-server` | Install and set `KS_TOKEN` | J1.6, J3 |

Current status (2026-11-22): Aileen reports the downloaded Mac app does not open and she could not put an API key in. Under rule A3 this is an open bug with no accepted fix. No surface is accepted under this spec yet.

---

## 13. Acceptance rules

Each rule is quoted or closely paraphrased from her files. "Done" below means done, fixed, ready, accepted or safe to merge.

### 13.1 Workflow

| # | Rule | Source |
|---|---|---|
| A1 | Never mark a task complete based only on code inspection. Reading the diff is not verification. Do not claim verified if you did not observe it | `[AG]` line 14, `[VER]`, `[CR]` lines 7 to 8 |
| A2 | Inspect, then plan, then patch, then verify. Changes that touch several systems: inspect and plan, then wait for confirmation before editing. One vertical slice at a time | `[AG]` lines 42 to 63, `[HB]` section 1 |
| A3 | Bugs: no repro and no root cause means no fix. Order: repro (URL, clicks, environment, expected versus actual), 1 to 3 ranked hypotheses, evidence, root cause, minimal fix, why safe. No "should be fixed" without evidence. No shotgun diffs | `[DBG]`, `[AG]` lines 73 to 82 |
| A4 | Smallest safe diff. No redesign unless asked. No parallel systems. Do not delete working flows. If a feature already exists in a branch or PR, only rebase, resolve and merge it; never reimplement it | `[CR]` hard rules, `[AG]` "Core rule" and production section 2 |
| A5 | Grow in layers: first the smallest version that works end to end, then each new capability on top of a product that already works. Never trade a working product for unfinished complexity. No stopgaps meant to be replaced | `[AC]` lines 4 and 8, `[AG]` line 187 |
| A6 | Use what already exists: established libraries, current dependencies, and how established products solve the problem, before writing something new | `[AC]` lines 6, 7 and 9 |
| A7 | Before changing code in this repo, run GitNexus impact on what you edit, and run change detection before committing. `risk: UNKNOWN` is unresolved, not low | `[KS]` "Always Do" |

### 13.2 Proof

| # | Rule | Source |
|---|---|---|
| A8 | Test the specific user flow that changed, on the affected surface. Run lint, type check and build where relevant | `[AG]` lines 29 to 36, `[QA]` "Before merge" |
| A9 | UI changes: screenshots and interaction proof, both. Text only, or stills without the interaction, is incomplete. Name the clicks. A recording is preferred; otherwise sequential screenshots of each state | `[UI]`, `[CR]` line 9 |
| A10 | No screenshots means not done. No owner approval means no merge | `[CR]` line 9, `[DOS]` |
| A11 | No fake UI: no button, status light, export, upload or link that pretends to work. Never leave fake UI pretending to work | `[DOS]` lines 115 to 119 |
| A12 | Errors are short and plain. No backend config dumps, stack traces or scary backend errors in what users see | `[DOS]` lines 431 to 435, `[AG]` "Never" |
| A13 | If you cannot prove it on production, do not claim it is fixed. Localhost is not production proof. Preview ready is not production ready | `[AG]` lines 203 and 241, `[VER]` "Never" |
| A14 | Before saying done on a ship: the `main` tip SHA, each PR shown as merged with its merge commit on `origin/main`, the production deployment of that SHA succeeding, screenshots taken on the real production URL, and at least one real interaction. Missing any one means not done. A draft PR is never the end of a task | `[AG]` production sections 4 to 7 and "Done definition" |

### 13.3 Reporting and blockers

| # | Rule | Source |
|---|---|---|
| A15 | Every task ends with: `root cause`, `files changed`, `checks run`, `manual QA`, `verification`, `remaining risks`, `manual steps`, `safe to merge`. `safe to merge` is `yes`, `no`, or `yes after manual env/config step`. If a check did not run, say so | `[AG]` lines 127 to 153, `[VER]`, `[HB]` section 6 |
| A16 | Every PR fills her PR form: summary, files changed, root cause or reason, checks run, manual QA, risks, safe to merge | `[PR]` |
| A17 | When blocked (missing secret, permission, failing check, usage limit): stop and fill the blocker table (`blocked_on`, `evidence`, `impact` blocked or degraded, `human_action`, `not_doing`). Never invent a bypass or call it "almost done" | `[AG]` lines 169 to 183 and production "Fail-closed blockers" |
| A18 | Environment and deployment work a person must do goes under `manual steps`, never hidden as a code problem | `[AG]`, `[QA]` "Not code failures" |
| A19 | Not code failures: a review bot usage limit, lint debt that is already red on `main`. Do not change the product to turn them green | `[QA]` "Not code failures", `[KF]` |

### 13.4 Not repeating failures

| # | Rule | Source |
|---|---|---|
| A20 | Read the known-failures list before CI, packaging or ship work. Add only entries with evidence (command output, PR or production probe), one line each, written as the correct practice | `[KF]` header and "How to append" |
| A21 | After a failure, write a lesson. Rule changes are proposed and need owner approval before they change the rules | `[AG]` lines 155 to 167 |
| A22 | KeyShield facts already recorded: `app.ks.aileena.xyz` door is wallet first (Phantom, Solflare, Backpack, OKX), passkey second, never passkey only; use `keyshield-prf-v1`; never point at `keyshield-production.up.railway.app` or `ks-prf-salt-v1` | `[KF]` 2026-10-05, `[PRJ]` lines 70 to 76, `[TM]` line 32 |
| A23 | Aileen's own instructions: a problem reported as fixed must actually be fixed for her and must not come back; repeat the regression checks on the exact candidate being handed over; use synthetic accounts and keys and mocked providers, no paid calls, no production releases unless she clears one | `[OWN]` |

---

## 14. Acceptance per surface

A surface is accepted only when every row applies and has its evidence. The journeys come from section 11; the evidence rules from section 13.

| Surface | Must pass | Evidence required |
|---|---|---|
| Web dashboard | J1 to J5 on the production URL | A8, A9, A13, A14, A15 |
| Mac app | J1 to J5 starting from the downloaded `KeyShield.dmg` | A8, A9, A15, plus the open question Q1 |
| Chrome extension | J1.2, J1.4, J2 in Chrome with the extension loaded from the delivered files | A8, A9, A15, plus Q1 |
| iPhone app | J1.1 to J1.5, J2, J4 on the delivered tester build | A8, A9, A15, plus Q1 |
| Agent SDK, CLI, local proxy | J1.6 and J3 with a token copied from a surface above | A8, A15 |

For every surface: when it was handed over before with a bug, the hand-over includes that bug's A3 record and the repeat checks from A23.

---

## 15. Build order

From A5 (grow in layers) and A2 (one slice at a time):

1. Reproduce the reported Mac app failure (A3) and record it.
2. Make J1 work end to end on one surface, and prove it per section 14.
3. Then J1 on each further surface, one at a time, each proved before the next.
4. Then J2 to J5.

Nothing else starts until this spec is approved.

---

## 16. Not covered by Aileen's files

Her files do not set a standard for the items below. This spec does not substitute one. Each needs her decision.

| # | Gap | What her files do say |
|---|---|---|
| Q1 | What counts as "production" for a download (Mac app, extension, iPhone build). Rule A13 defines production only as the deployed website | Production proof and "localhost is not proof" (A13, A14) |
| Q2 | Screenshot size for the Mac app and extension popup. Her rule names 390 x 844, a phone web viewport | `[UI]` |
| Q3 | How the Mac app signs in. Her files make wallet first the door on `app.ks.aileena.xyz`; this repo's README says the Phantom extension is not available inside the Mac app | `[KF]`, `[PRJ]` |
| Q4 | Code signing, notarization, Gatekeeper, App Store and TestFlight requirements | Nothing |
| Q5 | Security and cryptography review standards for the vault | Nothing beyond `[PRJ]` lines 75 to 76 (key derivation and ciphertext only) |
| Q6 | Performance or latency targets | Nothing. This repo's README already forbids publishing latency figures that were not measured |
| Q7 | Whether her rule "every number must be precise" (written for articles) applies to product copy and docs | `[AC]` "Writing Style" |
| Q8 | Automated test coverage required per surface | Run the slice's dedicated test when it has one (`[QA]`), nothing on coverage |

---

## 17. Approval of this spec

This spec is accepted when Aileen approves it (A10). Until then it is a draft, and no product, packaging or release work starts from it.

---

*Full API reference: [docs/API.md](docs/API.md)*  
*Architecture deep-dive: [docs/architecture/system-design.md](docs/architecture/system-design.md)*
