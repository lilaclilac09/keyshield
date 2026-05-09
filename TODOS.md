# KeyShield — Deferred Work

Items considered during /plan-ceo-review on 2026-04-15 and explicitly deferred.

---

## ✅ DONE: Path A wiring + extension-sync consolidation (2026-05-09)

**What:** The Path A vault client (formerly the standalone
`extension-sync/` workspace) has been folded into
`src/web-v2/lib/{vault,sync,sync-auth}.ts`. The HTTP contract
between client and Cloudflare Worker is unchanged. The Python
`/proxy/*` is now stateless w.r.t. upstream API keys (per-request
`X-Upstream-API-Key` header), and the legacy `/manage/*`
server-side plaintext storage routes are gone.

Any TODO referencing `extension-sync/` should be re-pointed at
`src/web-v2/lib/`.

---

## P3: Consolidate frontend/ and extension/ into one codebase

**What:** Migrate both the active `frontend/` browser extension and the new `extension/` 
to a single codebase using the Plasmo framework (@plasmohq/plasmo).

**Why:** Both codebases have popup, content script, and background logic that will
diverge over time. Maintenance overhead grows with every feature added to one but not
the other. Plasmo handles MV3 + React + cross-browser builds in one project.

**Pros:**
- Single source of truth for all extension logic
- HMR in development, proper React everywhere
- Cross-browser (Chrome + Firefox + Safari) from one config

**Cons:**
- New build system to learn
- Risk of breaking the working frontend/ extension during migration
- One-time migration cost

**Context:** After extension/ v1 ships and proves stable (~1 month), migrate. The
`disabled_extension/webpack.config.js` and `extension/manifest.ts` give strong
starting points. The Plasmo docs: https://docs.plasmo.com/

**Effort:** L (human: ~3 days / CC: ~45 min)
**Priority:** P3
**Depends on:** extension/ v1 shipped and stable

---

## P2: x402 auto-pay trust system — moved to IN-SCOPE

See CEO plan: `~/.gstack/projects/lilaclilac09-keyshield/ceo-plans/2026-04-15-agentic-extension.md`
x402 auto-pay for trusted domains was added to active scope.

---

## P2: OCR key detection

**What:** Screen capture / screenshot scanning to detect API keys visible in screenshots,
terminal output, or video. Uses the `OCRService` from `disabled_extension/src/lib/ocr-service.ts`.

**Why:** Developers share screenshots of their terminals. Keys leak visually. KeyShield
could capture these.

**Context:** Full implementation exists in `disabled_extension/src/lib/ocr-service.ts`.
Port to extension/ after v1 ships.

**Effort:** M (human: ~1 day / CC: ~15 min)
**Priority:** P2

---

## P2: Report page / audit log

**What:** A dedicated extension page showing key detection history, access log (who/what
autofilled which key when), and export functionality. Implemented in
`disabled_extension/src/report/`.

**Why:** Compliance, debugging, usage awareness.

**Effort:** M (human: ~1 day / CC: ~20 min)
**Priority:** P2
**Depends on:** extension/ v1 shipped

---

## P3: Firefox MV2 build target

**What:** Build the extension for Firefox using Manifest V2 (Firefox doesn't fully
support MV3 service workers). Reference: `frontend/manifest.firefox.json` + `build-firefox.sh`.

**Effort:** S (human: ~4 hrs / CC: ~10 min)
**Priority:** P3

---

## P3: Safari extension packaging

**What:** Package the Chrome extension as a Safari Web Extension using Xcode's
`xcrun safari-web-extension-converter`.

**Effort:** S (human: ~4 hrs / CC: ~10 min)
**Priority:** P3
