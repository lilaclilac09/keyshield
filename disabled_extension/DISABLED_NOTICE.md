# ⚠️ DISABLED EXTENSION CODE

This folder contains the **standalone browser extension** code that has been **disabled** and is kept for reference only.

## Why Disabled?

The KeyShield project now uses a **unified frontend + extension** approach located in the `frontend/` folder, which includes:
- Web app (Vite + React)
- Browser extension capabilities (manifest.json, background.js, content.js, popup)
- Shared components and utilities

This standalone extension code was separated to avoid conflicts and complexity from maintaining two separate codebases.

## Active Extension Location

**Active extension code is now in:** `/frontend/`

The frontend includes:
- `frontend/manifest.json` - Extension manifest
- `frontend/background.js` - Background service worker
- `frontend/content.js` - Content script
- `frontend/popup.html` & `popup.tsx` - Extension popup
- `frontend/components/ReportViewer.tsx` - Report viewer (replaces `disabled_extension/src/report/`)
- All other extension functionality integrated into the web app

## What's in This Folder?

This folder preserves the standalone extension implementation including:
- **Detection & Auto-fill logging**: `src/storage/secure-storage.ts` (logs store with encrypted detection/autofill events)
- **Report generation**: `src/lib/report-generator.ts`, `src/lib/log-client.ts`
- **Report UI**: `src/report/report.html`, `src/report/report.ts`
- **Key detection**: `src/lib/key-detector.ts`
- **Secure storage**: IndexedDB with AES-GCM encryption
- **Popup UI**: `src/popup/`

## Shared Code

Some functionality was duplicated between this standalone extension and the frontend:
- **Icons**: Both have their own icon sets
- **Vault client**: Logic exists in both (`src/lib/vault-client.ts` here, `frontend/lib/solana.ts` there)
- **Types**: Defined separately in each codebase

## Building (For Reference Only)

If you need to reference or build this disabled code:

```bash
cd disabled_extension
npm install
npm run build
```

Output will be in `disabled_extension/dist/`.

## Migration Notes

If you need to re-enable or merge features from this code:
1. Check `frontend/` first - most features are already there
2. Adapt any missing functionality to work with the frontend's architecture
3. Test thoroughly in both web and extension modes

---

**Last Active:** January 2026  
**Reason for Disabling:** Consolidated into unified frontend/extension in `frontend/`  
**Status:** Reference only, not actively maintained
