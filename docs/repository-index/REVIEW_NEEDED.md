# Review needed

Findings only. **No fixes applied.** Approval status: not approved.

| Path | Suspected issue | Evidence | Risk | Recommendation | Approval status |
|---|---|---|---|---|---|
| `archive/` | Historical tree still tracked | path | low | Keep; do not relocate without Aileena | not approved |
| `.gstack/qa-reports/` | QA leftover screenshots | path | low | Review whether they belong in git | not approved |
| `src/_archive/` if present | Archived dashboard | path (if tracked) | medium | Document, do not delete | not approved |
| `packages/sdk-py` vs `src/backend/keyshield_sdk.py` | Two Python client surfaces | source | medium | Keep both; document which agents should import | not approved |
| Agent login field names | SDK sent `agentPubkey` / GET challenge; dashboard uses `pubkeyB58` / POST | source (`auth.py`, SDK) | medium | Aliases exist on current main; do not rewrite SDK in this task | not approved |
| GitHub README cache | Visitors may still see pre-#60 page | documentation | low | Hard-refresh `main` | not approved |
| `docs/API.md` `/manage/store` vs Path A | Docs still describe server store; product encrypts client-side | documentation vs source | medium | Document only; do not rewrite API.md here | not approved |
| `railway.json` `startCommand` | Railway trial / exec-form `${PORT}` note in operator chat | config + external dashboard | high (ops) | Out of scope for this index; do not edit deploy files here | not approved |
| Vercel landing/web | Deploy rate limited 24h | CI status | medium | Ops; not an index fix | not approved |

Similar filenames are not proof of duplication. Missing imports are not proof a file is unused.

Category 90 file count: 46.
