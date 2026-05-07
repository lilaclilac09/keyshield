# Crypto Module

Unified cryptography standards for KeyShield.

## Standards

### 1. AES-256-GCM (Vault Encryption)
- **Use case:** Encrypting API keys at rest in the vault
- **Implementation:** Node.js `crypto` module (TypeScript), `cryptography` library (Python)
- **Key derivation:** scrypt with fixed salt (v1)
- **Location:** `src/crypto/aes-gcm.ts`, `src/python-legacy/crypto_utils.py`

### 2. Ed25519 (Identity & Signing)
- **Use case:** Wallet authentication, agent keypairs, Solana transactions
- **Implementation:** `@solana/web3.js` (TypeScript), `ed25519` (Python), `ed25519-dalek` (Rust)
- **Location:** `src/crypto/ed25519.ts`, `programs/keyshield/`

## Directory Structure

```
src/crypto/
├── README.md          # This file
├── aes-gcm.ts        # AES-256-GCM encryption/decryption
├── ed25519.ts        # Ed25519 key generation, signing, verification
├── kdf.ts            # Key derivation functions (scrypt, HKDF)
└── index.ts          # Unified exports
```

## Compatibility

Both standards are used across:
- **TypeScript** (api-server, web-frontend)
- **Python** (python-legacy)
- **Rust** (rust-proxy)
- **Solana** (programs)

Ensure implementations are compatible across languages.
