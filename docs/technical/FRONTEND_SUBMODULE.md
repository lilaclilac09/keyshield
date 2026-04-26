# Frontend submodule — dropped (Option C)

**Status as of this commit: the broken `frontend/` gitlink has been
removed.** This document is preserved as historical context for anyone
wondering where the legacy Next.js + Clerk frontend went.

## What changed

```bash
git rm --cached frontend
rm -rf frontend
```

References in the following docs have been scrubbed or, where the entire
section was about the dead frontend, deleted outright:

- `README.md` — "Development Notes / Next.js 15 SSR" section deleted; inline
  "OKX-wallet-based auth UI lives in the `frontend` submodule" updated to
  point at `extension-sync/` and `mobile/`.
- `QUICK_START.md` — "Launch the Frontend" replaced with "Launch the popup
  (extension-sync)" instructions.
- `ARCHITECTURE.md` — banner added at the top flagging the doc as V0
  historical context; `frontend/src/` directory tree replaced with the
  current workspace map; dead Clerk Authentication section deleted.
- `IMPLEMENTATION_SUMMARY.md` — deleted (the entire file documented the
  Clerk-modal migration in the dead frontend).

## Why Option C and not Option A

- The `.gitmodules` file was missing, the URL was never tracked, and the
  repo owner did not remember it.
- The pinned commit `12c2a1fd` was not in the local object database.
- Two newer workspaces (`extension-sync/` for browser, `mobile/` for RN)
  already serve the user-facing role the legacy frontend was meant to
  serve. Restoring an unmaintained Vite/Next.js + Clerk app would have
  added work, not removed it.

## What was in the legacy frontend

For the record, the dropped submodule contained:

- A Vite/Next.js app at `http://localhost:3000`
- Clerk Web3 sign-in flow (OKX-preferred)
- `@solana/wallet-adapter-react` + `WalletMultiButton`
- Lit Protocol threshold encryption hooks
- IndexedDB ciphertext storage + Solana hash storage

None of this is on the current roadmap. See the README's "Not on the
current roadmap" callout and the V1 / V1.1 design docs under
`docs/technical/`.

## What replaces it

| Surface | Workspace | Storage model |
|---|---|---|
| Browser popup | `extension-sync/` | WebAuthn PRF → AES-256-GCM, cipher synced via R2 |
| Mobile | `mobile/` (RN skeleton) | passkey adapter → same vault format |
| Legacy single-device | `extension/` | `chrome.storage.local` only |

## Restoring the submodule (if you ever change your mind)

The original three repair options (Option A: re-pin, Option B: inline,
Option C: drop) are preserved in this file's git history. If you have the
original GitHub URL for the frontend repo and want to restore it as a
proper subdirectory of this monorepo, the inline-into-monorepo option is
likely the best path — the `.gitmodules` machinery added more friction
than it removed.
