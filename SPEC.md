# KeyShield Protocol Specification

**Version:** 0.2  
**Status:** Complete draft, waiting for Aileen's approval. Building waits on this spec.  
**Full design:** [docs/architecture/system-design.md](docs/architecture/system-design.md)

This spec has two parts:

- **Part I (sections 1 to 9): protocol.** What KeyShield is and how keys, tokens and the proxy work. Unchanged from 0.1.
- **Part II (sections 10 to 18): product, acceptance and delivery.** What a person must be able to do with each thing we hand them, and how an agent proves it. Every acceptance rule in Part II comes from Aileen's own workflow files (section 10) and cites the file and line. Section 16 separates existing practice from remaining gaps; section 18 maps existing tests without treating them as acceptance.

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

Existing tests, their limits and observed breakages are mapped in section 18; they do not replace the evidence required here.

---

## 15. Build order

From A5 (grow in layers) and A2 (one slice at a time):

1. Reproduce the reported Mac app failure (A3) and record it.
2. Make J1 work end to end on one surface, and prove it per section 14.
3. Then J1 on each further surface, one at a time, each proved before the next.
4. Then J2 to J5.

Nothing else starts until this spec is approved.

---

## 16. Gaps and where existing practice answers them

Q1 and Q2 remain open. Q3 to Q8 cite existing practice, not new owner questions; the last column preserves what that practice does not establish. Revision prefixes K and T are defined in section 18; `[AG]`, `[QA]` and `[UI]` retain section 10's pinned revisions.

| # | Topic | Existing practice and remaining gap |
|---|---|---|
| Q1 | Production proof for downloads: open | A13/A14 and `[AG]`:237-257 define website production proof; K:src/desktop/README.md:41-70 defines source/renderer revisions and final DMG checksum, :139-177 installed-app checks. A public download-to-checksum-to-installed-app acceptance chain: none found. |
| Q2 | Mac and extension screenshot size: open | `[UI]`:10-20,30-34 specifies 390 x 844 for site UI. K:src/desktop/main.cjs:479-481 defaults to a 1280 x 860 window, not a screenshot policy. Binding Mac/extension screenshot dimensions: none found. |
| Q3 | Mac sign-in | K:src/desktop/README.md:9-14 defines the shared web renderer and hosted API default; K:tests/desktop_mac_app.test.ts:239-258 checks email-first signup and session-token fallback; D5 tests local synthetic signup. Hosted Google configuration and real Mac passkey success remain unverified. |
| Q4 | Signing and distribution | K:src/desktop/README.md:72-84: Linux cannot produce the DMG; local build is unsigned/unnotarized; preserve Gatekeeper; tester distribution needs Developer ID signing and notarization. T:src/ios/README.md:5-64 separates unsigned archive, signed archive-only and explicitly authorized internal TestFlight upload. Published signed/notarized Mac and delivered TestFlight/device evidence: none found. |
| Q5 | Security and crypto review | K:docs/HARNESS.md:100-117 requires owner merge/security review and gates crypto/key-storage changes; K:docs/technical/cryptography.md:7-35,39-66 describes primitives and trust boundaries. W2/E3/B4/B5/D2 test specific properties, not an audit. Independent crypto-audit scope/sign-off: none found. |
| Q6 | Performance and latency | K:docs/technical/human-usable-ui-standards.md:6-23 requires waiting feedback within 100ms for actions taking over 400ms and readable completion timing. K:docs/STRESS_TEST_PLAN.md:48-64 separates mock/production, percentiles, sample count/method and hardware/SHA; K:docs/BUILDING_KEYSHIELD.md:293 labels unmeasured latency as targets, not SLA. Production proxy/native-startup/sync SLA: none found. |
| Q7 | Precise numbers in product copy | K:docs/DEMO_RECORDING_SCRIPT.md:14-16 says use numbers from the actual take, not canned figures; K:docs/STRESS_TEST_PLAN.md:48-64 requires measurement context; K:docs/PROJECT_RESUME.md:72 forbids invented adoption/audit/latency claims. A universal product-copy precision format or automated gate: none found. |
| Q8 | Automated coverage per surface | K:docs/technical/human-usable-ui-standards.md:55-62 requires UX regression tests; `[QA]`:48-55 requires affected-flow evidence. K:package.json dispatches workspace tests, not root tests; K:.github/workflows/node-tests.yml:21-43 makes workspace tests best-effort. Section 18 lists separate root/browser/desktop/native commands. A required-green gate for every journey on every surface: none found. |

---

## 17. Approval of this spec

This spec is accepted when Aileen approves it (A10). Until then it is a draft, and no product, packaging or release work starts from it.

---

## 18. Existing tests and checks

### Revisions and commands

Prefixes below expand to immutable `repo@commit:path` references (all repos belong to `lilaclilac09`). IDs match the research inventory; partial coverage is not a journey pass.

| Prefix | Repository and commit | Scope |
|---|---|---|
| K | `keyshield@6c914c0b075e7f0371113eb05e7639d7f53619d0` | Researched main revision |
| S | `aileen_machina_01@624411cfa9348ee29b2a7a844501bc00ca9125a5` | Site practices and separate `/ks` implementation |
| I | `keyshield@d0242058fc7bbf8f7ae7897c2e9857bac4c952fe` | Branch-only iOS journey; not on main |
| T | `keyshield@7d3bea9429b4d291e1cfd4f78fb941a1a4efecd1` | Branch-only iOS/TestFlight prep; not on main or interchangeable with I |
| C | `keyshield@718eaa53b59cf7edf4f0372ce074fe35fb408205` | Branch-only sync/CAS tests; not on main |

Run from the referenced revision, with synthetic data and local/mocked services only. In tables, `V` means `npx vitest run <test path>` (without revision prefix); `P` means `python -m pytest <test path> -v`; `B` means `npm run test:e2e -- <test path>`. Commands identify existing runners, not a claim they currently work.

### Web dashboard

| Journey / IDs | Immutable paths | Run | Kind and actual coverage |
|---|---|---|---|
| J1.1, J1.4, J2, J3, J4: W7/W8 | K:tests/e2e/user-flows.spec.ts; K:tests/e2e/key-capture.spec.ts | B per file | Browser with mocked API: opens seeded signed-in UI, saves/reloads stub rows, confirms deletion, removes agent, reveal/hide. No sign-in, durable app reopen, Developer revoke-next-call or vault-lock proof. |
| J1.2: W1; J1.3: W2 | K:tests/password_login.test.ts; K:tests/web_zk.test.ts | V per file | Source/unit: email/auth endpoint strings; PRF vector and seal/open roundtrip, not unlock ceremony. |
| J1.4/J5: W3/W4/W6; J1.5: W5 | K:tests/vault_quick_paste.test.ts; K:tests/vault_list.test.ts; K:tests/human_usable_ux.test.ts; K:tests/session_scope.test.ts | V per file | Source/unit: input/list/error handling, pending-hit retention, feedback timing, token claims. J1.5 Developer token-copy/placeholder UI: none found on main. |
| J2/J5: C1/C2/C3 | C:tests/vault_stale_tab_cas.test.ts; C:tests/vault_sync_mutations.test.ts; C:tests/shared_vault_sync_errors.test.ts | V per file | Branch-only source/unit with mocked transport: confirmed revision/plaintext preserved on failure, deletion fails closed, conflicts not swallowed. |
| J5: C5 | C:tests/e2e/vault-sync-failure-state.spec.ts | `PW_USE_EXTERNAL_SERVER=1` B; local src/web Vite on 5173 | Branch-only browser with mocked API: outage/conflict/auth errors retain draft/card state, explicit retry recovers, no false saved status or secret reflection. Synthetic unlock bypasses ceremony. |
| J1.1/J1.3: S1 (separate site app) | S:aileena-new/scripts/verify-keyshield-app.ts:43-142 | In aileena-new: `pnpm verify:keyshield`, omit VERIFY_BASE_URL | Source/unit + in-process routes: PRF/wallet crypto, host/navigation strings, unauthenticated vault 401. Not src/web UI. |

J1.6 exact `/proxy` end to end: none found; B4/B5 below cover `/vproxy` with mock upstream only. Complete main-branch J4 lock and J5 outage UI proof: none found.

### Mac app

| Journey / IDs | Immutable paths | Run | Kind and actual coverage |
|---|---|---|---|
| J1.1/J1.2/J4/J5: D1/D2 | K:tests/desktop_mac_app.test.ts; K:tests/desktop_security.test.ts | V per file | Source/unit with filesystem/Electron fixtures: renderer parity, email-first login, startup/Touch ID failure closed, redaction. Not native launch or offline-save durability. |
| J1.1 delivery: D3/D4 | K:tests/desktop_build_provenance.test.ts; K:tests/desktop_evidence.test.ts | V per file | Source/unit/local Git fixtures: renderer pin and DMG checksum metadata; reporter redacts case output. Not public download/install proof. |
| J1.1-J1.5, partial J4: D5 | K:src/desktop/e2e/desktop.spec.cjs | In src/desktop: `npm run test:e2e`; installed variant adds `KS_E2E_APP=/Applications/KeyShield.app/Contents/MacOS/KeyShield` | Local integration with Electron UI, local Python API and synthetic passkey/worker: signup, unlock, encrypted save/reload, placeholder snippets after mint, locked save refusal. Requires built renderer and loopback API (K:src/desktop/README.md:137-177). |
| J1.6, J2, J3, complete J4/J5 | None found in dedicated desktop E2E | None | Save+Call explicitly skipped in D5:472-474; same-provider saves are not replacement; shared helper/backend coverage is not desktop journey proof. |

Downloaded DMG acceptance is not tested. An installed-app runner is not proof the public download opens; Linux fixture tests do not verify Gatekeeper or real Touch ID.

### Chrome extension

| Journey / IDs | Immutable paths | Run | Kind and actual coverage |
|---|---|---|---|
| J1.1/J1.4/partial J4: E4 | K:tests/ext_detect.test.ts | V | Source/unit: popup/manifest, provider detection, masked row shaping drops raw values. Not installed Chrome UI or lock behavior. |
| J1.2/J1.4/partial J5: E1/E2 | K:tests/ext_session_bridge.test.ts; K:tests/ext_autostore.test.ts | V per file | Source/unit with mocked probe: token reconciliation, sign-in href, permission/in-flight save gating and failed-local-probe fallback. |
| J1.3/J1.4: E3 | K:tests/ext_zk.test.ts | V | Source/unit: vector decrypt, public hint, no raw pending keys in chrome.storage.local. Not unlock UI or restart persistence. |
| J1.5/J1.6/J2/J3, complete J4/J5 | None found | None | Installed Chrome extension journeys are not tested; W8 tests only a dashboard deep link. |

### iPhone

| Journey / IDs | Immutable paths | Run | Kind and actual coverage |
|---|---|---|---|
| J1.1/J1.3-J1.5/J2/J4: I1 | I:src/ios/KeyShieldUITests/KeyShieldE2EJourneyTests.swift:61-178 | `python3 src/ios/scripts/run-e2e-journey.py --suite journey --results "$HOME/ks-ios-e2e-NEW"` | Branch-only native simulator: onboarding, explicit paste/save, relaunch/Face ID simulation, approved copy/reveal, lock masks, placeholder examples, rotate/delete persist. Local vault, not hosted sign-in/token copy. |
| J1.1/J1.3-J1.5/J2-J4: I2/I3/I4 | T:src/ios/KeyShieldTests/CoreTests.swift; T:src/ios/KeyShieldUITests/KeyShieldUITests.swift; T:src/ios/KeyShieldTests/ProxyExampleTests.swift | `xcodebuild test -project src/ios/KeyShield.xcodeproj -scheme KeyShield -destination 'id=SIMULATOR_UDID' CODE_SIGNING_ALLOWED=NO -resultBundlePath "$HOME/ks-NEW.xcresult"` | Branch-only source/unit and native simulator targets: local encryption/session expiry/revoke, navigation/save/lock/rotate/delete, placeholder examples. Release-specific cases have extra prerequisites (T:src/ios/README.md:101-171). |
| J5 shared mobile logic: C4 | C:src/mobile/src/sync/boundary.test.ts | V | Branch-only source/unit with mocked transport/cache: failed pulls/writes preserve confirmed state, no retries, unknown revision fails closed. React Native boundary, not Swift src/ios UI. |
| J1.2 hosted sign-in, J1.6 external /proxy, native J5 sync | None found | None | Native beta is local-only with in-process mock provider; no cloud-sync or external-agent proof (T:src/ios/BETA_BOUNDARY.md:46-70). |

Real-device/signed iPhone acceptance is not tested. Simulator evidence is not physical Face ID, Secure Enclave or TestFlight-delivery proof.

### SDK / CLI / local proxy

| Journey / IDs | Immutable paths | Run | Kind and actual coverage |
|---|---|---|---|
| J1.2/J1.4/J1.5: B1/B2/B3 | K:src/backend/tests/test_password_login.py; K:src/backend/tests/test_passkey_login.py; K:src/backend/tests/test_vault_routes.py | P per file | Local integration (TestClient/temp DB): signup/relogin/errors, passkey error/challenge routes, legacy synthetic store/list/decrypt and empty-write safety. Not UI, PRF ceremony or encrypted client reopen. |
| J1.6/J3: B4/B5 | K:src/backend/tests/test_token_scopes.py; K:src/backend/tests/test_zk_local_proxy.py | P per file | Local integration, mock upstream: scoped token cannot read vault, `/vproxy` injects synthetic key, local proxy/root/Host guards, revoke makes next call 401. Exact `/proxy` end to end: none found. |
| J1.2/J1.4/J2/J3/partial J5: L1/L2 | K:src/sdk/packages/cli/test/v2-client.test.ts; K:src/sdk/packages/cli/test/session-store.test.ts | `npm test --workspace=@keyshield/cli -- test/v2-client.test.ts test/session-store.test.ts` | Source/unit: mocked login/store/delete/revoke/errors; real temp-file session roundtrip, atomic overwrite, mode 0600, deletion. Legacy raw-key methods are not no-raw-key agent proof. |
| J1.4/J2/J3/partial J5: R1/R2/R3 | K:src/infra/sync-worker/test/routes.test.ts; K:src/infra/sync-worker/test/revoke.test.ts; K:src/infra/sync-worker/test/etag.test.ts | `npm test --workspace=@keyshield/sync-worker -- test/routes.test.ts test/revoke.test.ts test/etag.test.ts` | Local integration (worker runtime/seeded JWT): ciphertext CRUD/stale-write denial, worker-token revocation, ETag/304. Not Developer-token UI or client offline durability. |
| J1.1 installed CLI, J1.3 interactive unlock, J1.5 Developer clipboard, J4 vault-lock UI, complete J5 recovery | None found | None | B5 supplied-root crypto and L2 session-file deletion do not prove interactive unlock/lock. |

### Current state of these tests (2026-11-22)

Observed on K and branch C in isolated Linux archives, synthetic fixtures only; no production/provider calls. These are known breakages and coverage limits, not accepted deliveries:

- Root Vitest: **143 pass / 1 fail** across 14 files. K:tests/vault_list.test.ts:119 fails the source assertion `Vault page saved-key hero > lists /manage/vault rows after sign-in the same way the popup does` (expected `extractDetectedKeys` in component source). Root tests require explicit `npx vitest run <files>`; root `npm test` runs workspaces only.
- CLI: **29 pass** (L1/L2). Worker: **31 pass** (R1-R3), but installed runtime falls back from requested compatibility date 2026-01-15 to supported 2024-12-30; coverage is degraded.
- Backend + SDK pytest: **43 pass** (B1-B5). Branch C sync: **36 pass** (C1-C4), not main coverage.
- Playwright E2E: **blocked**, not passed. K:playwright.config.ts points at removed `frontend/`; its web server fails before W7/W8 run. C5's external-server attempt was also blocked by missing wallet-adapter dependencies.
- `npm ci`: **fails**, package/lock out of sync (missing plugin-react, lucide-react, pluginutils and react-refresh entries). Completed checks used `npm install --ignore-scripts` in external copies, not a reproducible lock install; Node 24 host differs from CI Node 20.
- Mac/iOS native suites: **not run on Linux**. No real-device checks, signed iPhone delivery or downloaded-DMG acceptance; desktop Save+Call remains skipped. S1 was researched, not run.

---

*Full API reference: [docs/API.md](docs/API.md)*  
*Architecture deep-dive: [docs/architecture/system-design.md](docs/architecture/system-design.md)*
