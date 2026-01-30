# 📁 KeyShield - Complete File Index

This document lists project files organized by folder structure. Generated
artifacts and dependency folders (such as `node_modules/`, `target/`, and
`.git/`) are intentionally excluded.

## 📚 Root Directory Files

### Documentation Files (.md)
- **ARCHITECTURE.md** ⭐ - Complete system architecture
- **COMPLETE_OVERVIEW.md** - User flow & architecture overview
- **FILE_INDEX.md** - This file index
- **LIT_PROTOCOL_V4_UPDATE.md** - Lit Protocol v4 migration guide
- **README.md** - Project overview, quick start, features

### Configuration Files
- **.gitattributes** - Git attributes configuration
- **.gitignore** - Git ignore rules
- **Cargo.toml** - Rust workspace configuration
- **Cargo.lock** - Rust dependency lockfile

### Scripts (.sh)
- **demo.sh** - Demo script
- **test-extension.sh** - Extension testing script
- **test-program.sh** - Program testing script
- **test-setup.sh** - Automated test setup script

---

## 📂 disabled_extension/ - Browser Extension (Disabled)

**Note:** This extension code has been disabled. The active extension functionality is now in `frontend/` with its own manifest.json and extension files.

### Root Files
- **DEBUGGING.md** - Extension debugging guide
- **INSTALL.md** - Extension installation guide
- **README.md** - Extension overview
- **TEST_CHECKLIST.md** - Extension testing checklist
- **build-all.sh** - Build script for all browsers
- **build-chrome.sh** - Chrome build script
- **build-firefox.sh** - Firefox build script
- **build-safari.sh** - Safari build script
- **manifest.json** - Chrome extension manifest (MV3)
- **manifest.firefox.json** - Firefox extension manifest
- **manifest.safari.json** - Safari extension manifest
- **package.json** - Extension dependencies
- **package-lock.json** - Locked dependencies
- **test-page.html** - Test page for extension
- **tsconfig.json** - TypeScript configuration
- **webpack.config.js** - Webpack build configuration

### disabled_extension/src/background/
- **service-worker.ts** - Background service worker (MV3)

### disabled_extension/src/content/
- **content-script.ts** - Content script for key detection
- **save-dialog.ts** - Save dialog component

### disabled_extension/src/icons/
- **create-icons.sh** - Icon generation script
- **README.md** - Icons documentation

### disabled_extension/src/lib/
- **auth.ts** - Authentication utilities
- **key-detector.ts** - API key detection logic
- **key-injector.ts** - Key injection utilities
- **ocr-service.ts** - OCR service for key detection
- **vault-client.ts** - Vault client for extension
- **log-client.ts** - Log client for report generation
- **report-generator.ts** - Report data generator

### disabled_extension/src/popup/
- **popup.html** - Popup HTML
- **popup.ts** - Popup TypeScript logic

### disabled_extension/src/report/
- **report.html** - Report page HTML
- **report.ts** - Report page logic

### disabled_extension/src/storage/
- **secure-storage.ts** - Secure storage utilities

---

## 📂 frontend/ - Web UI (Vite)

### Root Files
- **.gitignore** - Frontend git ignore rules
- **App.tsx** - Root app component
- **DEPLOYMENT_TEST.md** - Deployment test guide
- **README.md** - Frontend overview
- **TEST_INSTRUCTIONS.md** - Testing instructions
- **background.js** - Extension background script
- **constants.tsx** - Frontend constants
- **content.js** - Extension content script
- **index.html** - HTML entrypoint
- **index.tsx** - Frontend entrypoint
- **manifest.json** - Extension manifest
- **metadata.json** - Extension metadata
- **package.json** - Frontend dependencies
- **package-lock.json** - Locked dependencies
- **tsconfig.json** - TypeScript configuration
- **types.ts** - Shared type definitions
- **vite.config.ts** - Vite configuration

### frontend/components/
- **AddKeyModal.tsx** - Add key modal
- **AuthScreen.tsx** - Authentication screen
- **DetectionOverlay.tsx** - Detection overlay UI
- **OCRModal.tsx** - OCR modal
- **ProviderIcons.tsx** - Provider icon set
- **ReportViewer.tsx** - Report viewer
- **SolanaProvider.tsx** - Solana provider wrapper
- **VaultItemCard.tsx** - Vault item card
- **WalletConnector.tsx** - Wallet connection UI

### frontend/hooks/
- **useVaults.ts** - Vault list hook

---

## 📂 programs/ - Solana Programs

### programs/keyshield/
- **Cargo.toml** - Rust dependencies

#### programs/keyshield/src/
- **error.rs** - Custom error types
- **lib.rs** - Program entrypoint
- **pda.rs** - PDA derivation utilities
- **state.rs** - Vault state structure

#### programs/keyshield/src/instructions/
- **access_key.rs** - Access key handler
- **mod.rs** - Instruction enum
- **share_key.rs** - Share key handler
- **store_key.rs** - Store key handler

---

## 📂 scripts/ - Utility Scripts

- **deploy.sh** - Deployment script
- **verify-vault.sh** - Vault verification script

---

## 📂 test/ - Tests

### test/integration/
- **api-detection.test.ts** - API detection integration tests

---

## 📊 File Statistics

### By Type
- **Markdown (.md)**: 13 files
- **TypeScript (.ts/.tsx)**: 26 files
- **Rust (.rs)**: 8 files
- **Shell Scripts (.sh)**: 11 files
- **JSON (.json)**: 11 files
- **JavaScript (.js)**: 3 files
- **HTML (.html)**: 3 files
- **TOML (.toml)**: 2 files
- **Other**: 5 files

### By Directory
- **Root**: 13 files
- **extension/**: 29 files
- **frontend/**: 28 files
- **programs/**: 9 files
- **scripts/**: 2 files
- **test/**: 1 file

---

## 🔍 Important Files Reference

### Must-Read Documentation
1. **[ARCHITECTURE.md](./ARCHITECTURE.md)** ⭐ - Complete system architecture
2. **[README.md](./README.md)** - Project overview
3. **[COMPLETE_OVERVIEW.md](./COMPLETE_OVERVIEW.md)** - User flows & architecture
4. **[LIT_PROTOCOL_V4_UPDATE.md](./LIT_PROTOCOL_V4_UPDATE.md)** - Lit Protocol v4 guide

### Key Source Files
- **frontend/components/WalletConnector.tsx** - Wallet connection UI
- **frontend/components/DetectionOverlay.tsx** - Detection overlay
- **programs/keyshield/src/lib.rs** - Solana program entrypoint
- **extension/src/lib/key-detector.ts** - Key detection logic

---

**Last Updated**: 2026-01-25
