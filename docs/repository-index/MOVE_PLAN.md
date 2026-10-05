# Move plan (proposal only)

**Status: not approved; do not execute.**

| Original path | Proposed path | Reason | Known references | External-consumer risk | Build/deploy impact | Verification | Recovery plan |
|---|---|---|---|---|---|---|---|
| `archive/` | stay | Historical; grouping is via category 90 | unknown | medium | none if left | not run | git checkout |
| `src/backend/keyshield_sdk.py` | stay (do not merge into `packages/sdk-py`) | Dual client | SDK tests, backend imports | high | lockfile/import risk | not run | git checkout |
| `docs/repository-index/` | stay | This index | root README link only | low | docs only | link check | delete folder |

Documentation, assets, and scripts may be referenced by applications or CI.
Do not assume they are safe to move.
