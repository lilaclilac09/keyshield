# KeyShield - Private API Vault on Solana

A decentralized API key management vault built on Solana with advanced privacy features:
- **ZK Proofs (Bonsol)** - Access verification without revealing secrets
- **MPC (Arcium)** - Secure agent-to-agent communication
- **Threshold Crypto (Lit Protocol)** - Time-locked and wallet-based sharing

## 📐 Architecture Overview

KeyShield is built on a multi-layered architecture that combines client-side encryption, on-chain storage, and privacy-preserving verification:

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                          │
│  Next.js Frontend + Wallet Adapter + Privacy SDKs        │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                 PRIVACY SERVICES                         │
│  Lit Protocol │ Bonsol ZK │ Arcium MPC                  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              SOLANA BLOCKCHAIN                           │
│  KeyShield Program (Pinocchio) - On-chain Vault Storage  │
└─────────────────────────────────────────────────────────┘
```

**Key Components:**
- **Frontend**: Next.js app with React components for key management
- **Privacy Layer**: Lit Protocol (encryption), Bonsol (ZK proofs), Arcium (MPC)
- **On-Chain**: Solana program storing encrypted keys in vault accounts
- **Security**: Multi-layer encryption with threshold cryptography and zero-knowledge verification

**📖 For complete architecture documentation, see [ARCHITECTURE.md](./ARCHITECTURE.md)** ⭐ - Essential reading (572 lines covering system design, data flows, security layers, and integration patterns).

## 🏗️ Architecture

### Backend (Rust/Pinocchio)
- **Program**: `programs/keyshield/` - Solana program using Pinocchio (no Anchor). Pinocchio is wired in [`programs/keyshield/src/lib.rs`](programs/keyshield/src/lib.rs) (`program_entrypoint!`, `default_allocator!`, `nostd_panic_handler!`) and in [`programs/keyshield/Cargo.toml`](programs/keyshield/Cargo.toml) (`pinocchio`, `pinocchio-token`, `pinocchio-system`).
- **Instructions**:
  - `StoreKey` - Store encrypted API keys on-chain
  - `AccessKey` - Access keys with ZK proof verification
  - `ShareKey` - Share keys with MPC and time-lock support

### Frontend (Next.js/TypeScript)
- **Framework**: Next.js 14 with React 18
- **Wallet**: Solana Wallet Adapter
- **Privacy SDKs**: Lit Protocol, Bonsol, Arcium
- **UI**: Tailwind CSS with shadcn-ui components

## 🚀 Quick Start

### Prerequisites

- **Rust** (latest stable)
- **Node.js** 18+
- **Solana CLI** (latest)

### 1. Build the Program

```bash
cd keyshield
cargo build-sbf
```

### 2. Deploy the Program

From the repo root (Pinocchio flow; no Anchor):

```bash
# Build and deploy using the program keypair
./scripts/deploy.sh devnet
```

Or manually:

```bash
cargo build-sbf
solana program deploy target/deploy/keyshield.so \
  --program-id target/deploy/keyshield-keypair.json \
  --url devnet
```

### 3. Set Up Frontend

```bash
cd frontend

# Install dependencies
npm install

# Copy environment variables
cp .env.local.example .env.local

# Edit .env.local and set:
# - NEXT_PUBLIC_PROGRAM_ID=your_deployed_program_id
# - NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
# - NEXT_PUBLIC_LIT_NETWORK=datil
# - NEXT_PUBLIC_ARCIUM_CLUSTER=testnet

# Start development server
npm run dev
```

Visit `http://localhost:3000` to see the app.

## 📁 Project Structure

```
keyshield/
├── programs/
│   └── keyshield/
│       ├── src/
│       │   ├── lib.rs           # Program entrypoint
│       │   ├── error.rs         # Error types
│       │   ├── state.rs         # Vault state structure
│       │   ├── pda.rs           # PDA derivation
│       │   └── instructions/    # Instruction handlers
│       │       ├── store_key.rs
│       │       ├── access_key.rs
│       │       └── share_key.rs
│       └── Cargo.toml
├── frontend/
│   ├── src/
│   │   ├── app/                 # Next.js app directory
│   │   ├── components/         # React components
│   │   ├── lib/                 # Utilities & SDKs
│   │   │   ├── keyshield-client.ts
│   │   │   ├── lit-protocol.ts
│   │   │   ├── bonsol.ts
│   │   │   └── arcium.ts
│   │   ├── hooks/               # React hooks
│   │   └── types/               # TypeScript types
│   └── package.json
└── Cargo.toml                   # Workspace config
```

## 🔐 Privacy Features

### Lit Protocol Integration

Encrypts API keys with threshold cryptography. Access is controlled by:
- Wallet address conditions
- Time-locked access
- NFT/token ownership (future)

```typescript
import { encryptWithLit, createWalletAccessConditions } from '@/lib/lit-protocol';

const conditions = createWalletAccessConditions(walletAddress);
const { ciphertext, dataToEncryptHash } = await encryptWithLit(apiKey, conditions);
```

### Bonsol ZK Proofs

Verifies access without revealing the API key or access credentials.

**Note**: Bonsol integration requires:
1. Writing a ZK program (Rust + RISC Zero)
2. Building and registering on Bonsol network
3. Generating proofs off-chain
4. Verifying on-chain

See `frontend/src/lib/bonsol.ts` for integration stubs.

### Arcium MPC

Enables secure multi-party computation for agent-to-agent key sharing.

**Note**: Arcium is currently in testnet. Mainnet Alpha expected Q4 2025.

See `frontend/src/lib/arcium.ts` for integration stubs.

## Testing

### Unit tests (Mollusk)

Unit tests use [Mollusk](https://solana.com/docs/programs/testing/mollusk) to run the compiled program in a minified SVM. Build the program first, then run tests:

```bash
cargo build-sbf
cargo test -p keyshield
```

Tests live in `programs/keyshield/tests/` (`store_key.rs`, `access_key.rs`, `share_key.rs`) and use shared fixtures in `tests/common/mod.rs`. SBF program path is resolved from `CARGO_MANIFEST_DIR` so tests work from any working directory.

### Integration (Surfpool)

For a local Surfnet (Surfpool) run:

1. Install Surfpool: `cargo install surfpool` (or `curl -sL https://run.surfpool.run | bash`)
2. From repo root, run the integration script (starts Surfnet if needed, deploys program, verifies):

```bash
./scripts/integration-surfpool.sh
```

Optional Node script (connects to `http://localhost:8899`, derives vault PDA, checks account):

```bash
npm install @solana/web3.js   # from repo root if needed
node scripts/integration-surfpool.mjs
```

### Devnet smoke

Deploy to devnet and verify the vault account:

```bash
./scripts/deploy.sh devnet
```

After performing one StoreKey (e.g. from the extension or app), verify on-chain:

```bash
./scripts/verify-vault.sh <wallet-pubkey>
```

Or manually: `solana account <vault-pda> --url https://api.devnet.solana.com`

### CI

GitHub Actions (`.github/workflows/test.yml`) runs unit tests (Mollusk) then integration (Surfpool): build-sbf, `cargo test -p keyshield`, then install Surfpool, start Surfnet, and run `scripts/integration-surfpool.sh`.

### Frontend tests

```bash
cd "frontend "
npm test
```

## 🔧 Configuration

### Environment Variables

**Frontend** (`.env.local`):
- `NEXT_PUBLIC_PROGRAM_ID` - Your deployed program ID
- `NEXT_PUBLIC_RPC_URL` - Solana RPC endpoint
- `NEXT_PUBLIC_LIT_NETWORK` - Lit network (datil/mainnet)
- `NEXT_PUBLIC_ARCIUM_CLUSTER` - Arcium cluster (testnet/mainnet)

### Program Configuration

Edit `frontend/src/lib/constants.ts` to set:
- Program ID
- Instruction discriminators
- Account sizes

## 📚 SDK Integration Status

| SDK | Status | Notes |
|-----|--------|-------|
| **Pinocchio** | ✅ Complete | Core program framework |
| **Lit Protocol** | ✅ Complete | Encryption/decryption working |
| **Bonsol** | ⚠️ Stub | Requires ZK program + network setup |
| **Arcium** | ⚠️ Stub | Testnet only, requires circuit setup |
| **Wallet Adapter** | ✅ Complete | Phantom, Solflare supported |
| **Solana Web3.js** | ✅ Complete | Core interactions |

## 🚧 TODO / Known Issues

1. **Bonsol Integration**: Requires writing and deploying ZK program
2. **Arcium Integration**: Needs MPC circuit definition
3. **Lit Protocol Rust SDK**: Currently using JS SDK (may need FFI for Rust)
4. **Error Handling**: Add comprehensive error tracking (Sentry)
5. **Testing**: Add integration tests for privacy SDKs
6. **AI Agents**: Integrate awesome-solana-ai agents (AgenC)

## 🔒 Security Considerations

- **Key Storage**: Keys are encrypted with Lit Protocol before on-chain storage
- **Access Control**: ZK proofs verify access without revealing credentials
- **MPC Sharing**: Uses Arcium for secure multi-party computation
- **Time Locks**: Supports time-delayed access via Lit conditions
- **Audit**: Consider security audit before mainnet deployment

## 📖 Documentation

- [KeyShield SDK Analysis](./KEYSHIELD_SDK_ANALYSIS.md) - Complete SDK review
- [Pinocchio Docs](https://docs.pinocchio.dev) - Program framework
- [Lit Protocol Docs](https://developer.litprotocol.com) - Threshold crypto
- [Bonsol Docs](https://docs.bonsol.org) - ZK proofs
- [Arcium Docs](https://docs.arcium.com) - MPC computation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- **Pinocchio** - Lightweight Solana program framework
- **Lit Protocol** - Threshold cryptography
- **Bonsol** - ZK proof infrastructure
- **Arcium** - MPC computation network
- **Solana** - High-performance blockchain

---

**Built with ❤️ for the Solana ecosystem**
