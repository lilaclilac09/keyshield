# 📁 KeyShield - Complete File Index

This document lists all files in the KeyShield project, organized by folder structure.

## 📚 Root Directory Files

### Documentation Files (.md)
- **ARCHITECTURE.md** ⭐ - Complete system architecture (572 lines) - Essential reading
- **COMPLETE_OVERVIEW.md** - Complete user flow & architecture overview
- **DECRYPTION_TESTING.md** - Decryption flow testing documentation
- **LIT_PROTOCOL_V4_UPDATE.md** - Lit Protocol v4 migration guide
- **QUICK_VERIFICATION.md** - Quick verification steps
- **QUICKSTART.md** - 5-minute quick start guide
- **README.md** - Project overview, quick start, features
- **SETUP.md** - Detailed setup instructions
- **START_HERE.md** - Quick testing guide and documentation index
- **TEST_AND_ARCHITECTURE_SUMMARY.md** - Test results + architecture summary
- **TEST_RESULTS.md** - Test results and status
- **TESTING.md** - Complete testing guide

### Configuration Files
- **.gitattributes** - Git attributes configuration
- **.gitignore** - Git ignore rules
- **Cargo.toml** - Rust workspace configuration

### Scripts (.sh)
- **demo.sh** - Demo script
- **test-extension.sh** - Extension testing script
- **test-program.sh** - Program testing script
- **test-setup.sh** - Automated test setup script

---

## 📂 extension/ - Browser Extension

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

### extension/src/background/
- **service-worker.ts** - Background service worker (MV3)

### extension/src/content/
- **content-script.ts** - Content script for key detection
- **save-dialog.ts** - Save dialog component

### extension/src/icons/
- **create-icons.sh** - Icon generation script
- **README.md** - Icons documentation

### extension/src/lib/
- **auth.ts** - Authentication utilities
- **key-detector.ts** - API key detection logic
- **key-injector.ts** - Key injection utilities
- **ocr-service.ts** - OCR service for key detection
- **vault-client.ts** - Vault client for extension

### extension/src/popup/
- **popup.html** - Popup HTML
- **popup.ts** - Popup TypeScript logic

### extension/src/storage/
- **secure-storage.ts** - Secure storage utilities

---

## 📂 frontend/ - Next.js Frontend

### Root Files
- **fix-server-error.md** - Server error fix documentation
- **next.config.js** - Next.js configuration
- **next-env.d.ts** - Next.js TypeScript definitions
- **package.json** - Frontend dependencies
- **package-lock.json** - Locked dependencies
- **postcss.config.js** - PostCSS configuration
- **tailwind.config.js** - Tailwind CSS configuration
- **tsconfig.json** - TypeScript configuration

### frontend/public/
- **verify-storage.js** - Storage verification script

### frontend/src/app/
- **globals.css** - Global CSS styles
- **layout.tsx** - Root layout with WalletProvider
- **page.tsx** - Main dashboard page

### frontend/src/components/
- **AutoDetectionTest.tsx** - Auto-detection test component
- **CyberpunkOverlay.tsx** - Cyberpunk-themed overlay
- **Dashboard.tsx** - Main dashboard component
- **ErrorBoundary.tsx** - Error boundary component
- **ErrorToast.tsx** - Error toast notification
- **GoogleAIConnector.tsx** - Google AI integration component
- **ShareKeyDialog.tsx** - Dialog for sharing keys
- **StoreKeyForm.tsx** - Form for storing keys
- **VaultDisplay.tsx** - Display vault information
- **WalletProvider.tsx** - Solana wallet context provider
- **WalletSelector.tsx** - Wallet selector component

### frontend/src/hooks/
- **useAIAgent.ts** - AI agent integration hook
- **useVault.ts** - Vault data hook
- **useWallet.tsx** - Wallet hook

### frontend/src/lib/
- **api-key-generators.ts** - API key generation helpers
- **api-verifier.ts** - API verification utilities
- **arcium.ts** - Arcium MPC integration
- **bonsol.ts** - Bonsol ZK proof integration
- **ciphertext-storage.ts** - Ciphertext storage utilities
- **constants.ts** - Program constants
- **google-ai.ts** - Google AI integration
- **keyshield-client.ts** - Client SDK for program interaction
- **lit-protocol.ts** - Lit Protocol integration
- **solana.ts** - Solana connection utilities

### frontend/src/types/
- **index.ts** - TypeScript type definitions

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
- **Markdown (.md)**: 18 files
- **TypeScript (.ts/.tsx)**: 26 files
- **Rust (.rs)**: 13 files
- **Shell Scripts (.sh)**: 11 files
- **JSON**: 9 files
- **Configuration**: 8 files (Cargo.toml, tsconfig.json, etc.)
- **Other**: 5 files (HTML, CSS, JS)

### By Directory
- **Root**: 17 files
- **extension/**: 30+ files
- **frontend/**: 40+ files
- **programs/**: 13 files
- **scripts/**: 2 files
- **test/**: 1 file

---

## 🔍 Important Files Reference

### Must-Read Documentation
1. **[ARCHITECTURE.md](./ARCHITECTURE.md)** ⭐ - Complete system architecture
2. **[README.md](./README.md)** - Project overview
3. **[START_HERE.md](./START_HERE.md)** - Quick start guide
4. **[COMPLETE_OVERVIEW.md](./COMPLETE_OVERVIEW.md)** - User flows & architecture

### Key Source Files
- **frontend/src/lib/keyshield-client.ts** - Main client SDK
- **frontend/src/lib/lit-protocol.ts** - Lit Protocol integration
- **programs/keyshield/src/lib.rs** - Solana program entrypoint
- **extension/src/lib/key-detector.ts** - Key detection logic

---

**Last Updated**: 2026-01-24
