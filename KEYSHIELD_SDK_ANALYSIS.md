# KeyShield SDK Analysis & Missing Dependencies

## Overview
This document reviews the SDKs planned for KeyShield (Private API Vault on Solana) and identifies any missing dependencies or tools needed for a complete implementation.

---

## ✅ Currently Listed SDKs

### Core Privacy SDKs
1. **Bonsol** - ZK proofs for access verification without revealing secrets
   - ✅ SDK: `bonsol-interface` (Rust) + Bonsol CLI
   - ✅ Status: Battle-tested, production-ready
   - 📝 Note: Uses RISC Zero zkVM → Groth16 SNARKs

2. **Arcium Arcis** - MPC for secure agent-to-agent communication
   - ✅ SDK: `arcium-arcis` (Rust) + `@arcium-hq/client` (TypeScript) + `@arcium-hq/reader` (TypeScript)
   - ✅ Status: Public Testnet, Mainnet Alpha Q4 2025
   - 📝 Note: Requires Anchor integration for Solana programs

3. **Lit Protocol** - Threshold crypto for time-locked/wallet-based sharing
   - ✅ SDK: `@lit-protocol/lit-node-client` (JavaScript/TypeScript)
   - ✅ Status: Production-ready (Datil network)
   - 📝 Note: Supports Solana SIWS, wrapped keys for ed25519

### Solana Core SDKs
4. **Pinocchio** - Lightweight Rust program framework
   - ✅ SDK: `pinocchio` (Rust workspace dependency)
   - ✅ Status: Used in existing projects
   - ⚠️ **MISSING**: Pinocchio TypeScript client SDK for frontend interaction

5. **Solana Web3.js** - Core Solana interactions
   - ✅ SDK: `@solana/web3.js` (mentioned as web3.js/kit)
   - ✅ Status: Standard library

6. **Solana Wallet Adapter** - Wallet connection management
   - ⚠️ **IMPLICITLY MENTIONED** but not explicitly listed
   - ✅ Should use: `@solana/wallet-adapter-base`, `@solana/wallet-adapter-react`, `@solana/wallet-adapter-react-ui`
   - ✅ Wallet packages: `@solana/wallet-adapter-wallets`

### AI Agent SDKs
7. **awesome-solana-ai** - AI agents (AgenC, Solana Agent Kit)
   - ✅ SDK: Various packages from awesome-solana-ai ecosystem
   - 📝 Note: May need specific agent SDKs like `@agenc/sdk` or similar

### Development Tools
8. **create-solana-dapp** - Bootstrap CLI
   - ✅ Tool: CLI for React + Anchor setup
   - 📝 Note: May need customization for Pinocchio

9. **solana-dev-skill** - AI code generation
   - ✅ Tool: Claude skill for Solana development
   - 📝 Note: Development assistance tool

---

## ❌ Missing Critical SDKs

### 1. **Pinocchio Client SDK** ⚠️ CRITICAL
**Status**: Missing TypeScript/JavaScript client for Pinocchio programs
- **Why needed**: Your Rust program uses Pinocchio, but frontend needs a client SDK to:
  - Serialize/deserialize instructions
  - Build transactions
  - Read account data
  - Handle PDAs
- **Solution Options**:
  - Use `@coral-xyz/anchor` if Pinocchio is Anchor-compatible
  - Build custom IDL-based client using `@solana/codec`
  - Use `@solana/web3.js` directly with manual serialization
- **Recommendation**: Check if Pinocchio has an IDL generator or use `@solana/codec` + `@solana/codec-numbers` for manual serialization

### 2. **Solana Codec Libraries** ⚠️ IMPORTANT
**Status**: Missing for serialization/deserialization
- **Packages needed**:
  - `@solana/codec` - Core codec framework
  - `@solana/codec-numbers` - Number encoding (u8, u16, u32, u64, etc.)
  - `@solana/codec-strings` - String encoding
- **Why needed**: Pinocchio programs require custom serialization for:
  - Instruction data (store_key, access_key)
  - Account data (Vault struct)
  - PDA derivation

### 3. **Anchor SDK** ⚠️ CONDITIONAL
**Status**: May be needed if Arcium requires Anchor
- **Package**: `@coral-xyz/anchor`
- **Why needed**: 
  - Arcium Arcis integrates with Anchor programs
  - If you use Anchor for any part, you'll need the SDK
- **Note**: Your code shows Pinocchio, but Arcium docs mention Anchor integration

### 4. **SPL Token SDK** ✅ PARTIALLY LISTED
**Status**: Mentioned but not explicitly in dependencies
- **Package**: `@solana/spl-token`
- **Why needed**: If you need token-based access control or payments
- **Current status**: You have this in your existing project, but should be explicitly listed

### 5. **Encoding/Decoding Utilities**
**Status**: Missing explicit mention
- **Packages**:
  - `bs58` - Base58 encoding (Solana addresses, signatures)
  - `buffer` - Node.js Buffer polyfill for browser
- **Why needed**: Essential for Solana address handling

### 6. **State Management** (Frontend)
**Status**: Missing for React/Next.js
- **Options**:
  - `zustand` - Lightweight state management
  - `jotai` - Atomic state management
  - React Context (built-in)
- **Why needed**: Manage wallet state, vault data, encryption state

### 7. **Error Handling & Logging**
**Status**: Missing structured error handling
- **Packages**:
  - `@sentry/nextjs` or `@sentry/react` - Error tracking
  - `winston` or `pino` - Structured logging (backend)
- **Why needed**: Production-ready error tracking and debugging

### 8. **Helius SDK** ⚠️ OPTIONAL BUT RECOMMENDED
**Status**: Mentioned but SDK not listed
- **Package**: `@helius-dev/sdk` or use Helius RPC endpoints directly
- **Why needed**: Enhanced RPC features, webhooks, transaction parsing
- **Note**: You mentioned Helius RPC but not the SDK wrapper

### 9. **Testing SDKs** ⚠️ IMPORTANT
**Status**: Partially covered
- **Current**: LiteSVM, Mollusk (mentioned)
- **Missing**:
  - `@solana/web3.js` test utilities
  - `@coral-xyz/anchor` test framework (if using Anchor)
  - `vitest` or `jest` - Unit testing framework
  - `@testing-library/react` - React component testing
  - `mocha` or `ava` - Alternative test runners

### 10. **Encryption Utilities** (Beyond Lit)
**Status**: May need additional crypto libraries
- **Packages**:
  - `tweetnacl` or `@noble/ed25519` - Ed25519 operations (Solana signatures)
  - `@noble/hashes` - Cryptographic hashing
  - `libsodium-wrappers` - Advanced encryption (if needed)
- **Why needed**: 
  - Client-side encryption before Lit
  - Key derivation
  - Secure random generation

### 11. **Next.js Specific Dependencies**
**Status**: Missing Next.js integration packages
- **Packages**:
  - `next` - Framework (assumed)
  - `@tanstack/react-query` - Data fetching/caching
  - `swr` - Alternative data fetching
- **Why needed**: Efficient data fetching for vault data, transaction status

### 12. **UI Component Libraries**
**Status**: shadcn-ui mentioned but dependencies not listed
- **Packages**:
  - `shadcn-ui` components (via `npx shadcn-ui@latest add [component]`)
  - `tailwindcss` - Styling (required by shadcn)
  - `clsx` or `class-variance-authority` - Class utilities
- **Why needed**: Modern UI components

### 13. **Type Definitions**
**Status**: Missing TypeScript types
- **Packages**:
  - `@types/node` - Node.js types
  - `@types/react` - React types
  - `@types/react-dom` - React DOM types
- **Why needed**: TypeScript support

### 14. **Environment & Configuration**
**Status**: Missing environment management
- **Packages**:
  - `dotenv` - Environment variables
  - `zod` - Runtime validation for env vars and API responses
- **Why needed**: Secure configuration management

---

## 📋 Complete Dependency List Recommendations

### Backend (Rust - Cargo.toml)
```toml
[dependencies]
pinocchio = "0.8"
pinocchio-token = "0.3"
pinocchio-system = "0.2"
# Privacy SDKs
lit-rust-sdk = "..." # Check if exists or use FFI
bonsol-interface = "..." # Verify exact crate name
arcium-arcis = "..." # Verify exact crate name

[dev-dependencies]
mollusk-svm = "0.0.12"
solana-sdk = "2.1"
```

### Frontend (package.json)
```json
{
  "dependencies": {
    // Next.js & React
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    
    // Solana Core
    "@solana/web3.js": "^1.95.0",
    "@solana/spl-token": "^0.4.0",
    "@solana/codec": "^1.0.0",
    "@solana/codec-numbers": "^1.0.0",
    "@solana/codec-strings": "^1.0.0",
    
    // Wallet Adapter
    "@solana/wallet-adapter-base": "^0.9.23",
    "@solana/wallet-adapter-react": "^0.15.35",
    "@solana/wallet-adapter-react-ui": "^0.9.35",
    "@solana/wallet-adapter-wallets": "^0.19.32",
    
    // Privacy SDKs
    "@lit-protocol/lit-node-client": "^4.0.0",
    "@arcium-hq/client": "^0.3.0",
    "@arcium-hq/reader": "^0.3.0",
    
    // AI Agents (verify exact package names)
    "@agenc/sdk": "...", // or whatever awesome-solana-ai provides
    
    // Utilities
    "bs58": "^5.0.0",
    "buffer": "^6.0.3",
    "zod": "^3.22.0",
    "dotenv": "^16.0.0",
    
    // State Management
    "zustand": "^4.4.0",
    "@tanstack/react-query": "^5.0.0",
    
    // UI
    "tailwindcss": "^3.4.0",
    "clsx": "^2.0.0",
    "class-variance-authority": "^0.7.0",
    
    // Crypto (if needed beyond Lit)
    "@noble/ed25519": "^1.7.0",
    "@noble/hashes": "^1.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0",
    "@testing-library/react": "^14.0.0"
  }
}
```

---

## 🔍 SDK Verification Checklist

### Critical Verification Needed:
1. **Bonsol Rust Interface**
   - [ ] Verify exact crate name: `bonsol-interface` or `bonsol-sdk`?
   - [ ] Check if Rust SDK exists or only CLI/TypeScript
   - [ ] Verify integration with Pinocchio (no_std compatibility)

2. **Arcium Rust SDK**
   - [ ] Verify exact crate name: `arcium-arcis` or `arcium-sdk`?
   - [ ] Check Anchor dependency requirement
   - [ ] Verify MPC compute function signatures

3. **Lit Protocol Rust SDK**
   - [ ] Verify if `lit-rust-sdk` exists (may only have JS SDK)
   - [ ] If not, consider FFI bindings or use Lit Actions instead
   - [ ] Check threshold crypto Rust implementation

4. **Pinocchio Client SDK**
   - [ ] Check if Pinocchio generates IDL (like Anchor)
   - [ ] Verify if TypeScript client exists
   - [ ] If not, plan manual serialization with `@solana/codec`

5. **Awesome-Solana-AI Packages**
   - [ ] Verify exact package names for AgenC
   - [ ] Check Solana Agent Kit package name
   - [ ] Verify npm registry availability

---

## 🚨 Potential Integration Issues

### 1. **Pinocchio + Arcium Compatibility**
- **Issue**: Arcium mentions Anchor integration, but you're using Pinocchio
- **Solution**: 
  - Use Arcium's TypeScript client for MPC (off-chain)
  - Keep Pinocchio for on-chain program
  - Bridge via instruction data

### 2. **Lit Protocol Rust SDK**
- **Issue**: Lit may only have JavaScript SDK
- **Solution**:
  - Use Lit Actions (JavaScript) for on-chain logic
  - Or use FFI/WASM bindings
  - Or handle encryption client-side only

### 3. **Bonsol Integration**
- **Issue**: Bonsol uses RISC Zero (Linux x86_64), may not work on Mac
- **Solution**: 
  - Use Bonsol network (prover nodes) instead of local
  - Or use Docker/Linux VM for development

### 4. **No_std Compatibility**
- **Issue**: Pinocchio uses `#![no_std]`, but some SDKs may require std
- **Solution**:
  - Verify all privacy SDKs support no_std
  - Use FFI for incompatible SDKs
  - Consider hybrid approach (std for some features)

---

## 📚 Additional Resources Needed

1. **Documentation**:
   - Pinocchio serialization guide
   - Bonsol Rust integration examples
   - Arcium MPC circuit examples
   - Lit Protocol Solana SIWS examples

2. **Development Tools**:
   - Solana CLI (`solana-cli`)
   - Anchor CLI (`anchor` - if needed)
   - Bonsol CLI (`bonsol`)
   - Arcium CLI tools

3. **Testing Infrastructure**:
   - Local validator setup scripts
   - Test fixture data
   - Mock privacy SDK responses

---

## ✅ Action Items

### Immediate (Before Starting):
1. [ ] Verify all Rust crate names for privacy SDKs
2. [ ] Check Pinocchio client SDK availability
3. [ ] Verify Bonsol/Arcium/Lit Rust compatibility with no_std
4. [ ] Set up testing environment (LiteSVM/Mollusk)

### Short-term (During Development):
1. [ ] Implement Pinocchio serialization layer
2. [ ] Integrate wallet adapter
3. [ ] Set up Lit Protocol encryption flow
4. [ ] Test Bonsol ZK proof generation

### Long-term (Production):
1. [ ] Add error tracking (Sentry)
2. [ ] Implement comprehensive logging
3. [ ] Set up monitoring/alerting
4. [ ] Security audit of encryption flows

---

## 📝 Notes

- **SDK Maturity**: Bonsol and Lit are production-ready; Arcium is in testnet (mainnet Q4 2025)
- **Architecture**: Consider hybrid approach (some features on-chain, some off-chain via agents)
- **Testing**: Prioritize integration tests for privacy SDKs (they're complex)
- **Documentation**: Document all SDK integration patterns (they're novel)

---

## 🔗 Quick Reference Links

- Bonsol: https://docs.bonsol.org
- Arcium: https://docs.arcium.com
- Lit Protocol: https://developer.litprotocol.com
- Pinocchio: Check your existing project or Pinocchio docs
- Solana Web3.js: https://solana-labs.github.io/solana-web3.js/
- Wallet Adapter: https://github.com/solana-labs/wallet-adapter

---

**Last Updated**: January 2026
**Status**: Pre-implementation review
