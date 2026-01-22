# KeyShield Setup Guide

## Prerequisites

- **Rust** (latest stable) - [Install Rust](https://rustup.rs/)
- **Node.js** 18+ - [Install Node.js](https://nodejs.org/)
- **Solana CLI** - [Install Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools)
- **Anchor CLI** (optional, for testing) - [Install Anchor](https://www.anchor-lang.com/docs/installation)

## Environment Setup

### 1. Frontend Environment Variables

Create a `.env.local` file in the `frontend/` directory:

```bash
cd keyshield/frontend
cp .env.local.example .env.local
```

Edit `.env.local` with your configuration:

```env
# Solana Configuration
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_PROGRAM_ID=YOUR_DEPLOYED_PROGRAM_ID

# Lit Protocol Configuration
NEXT_PUBLIC_LIT_NETWORK=datil

# Arcium Configuration
NEXT_PUBLIC_ARCIUM_CLUSTER=testnet

# Bonsol Configuration (if using API)
NEXT_PUBLIC_BONSOL_API_URL=https://api.bonsol.org
```

### 2. Solana CLI Configuration

```bash
# Set to devnet
solana config set --url devnet

# Generate a keypair for deployment (if needed)
solana-keygen new

# Airdrop SOL for testing
solana airdrop 2
```

## Building the Program

### 1. Build the Rust Program

```bash
cd keyshield
cargo build-sbf
```

This will create the program binary at `target/deploy/keyshield.so`.

### 2. Deploy the Program

```bash
# Deploy to devnet
solana program deploy target/deploy/keyshield.so --program-id keyshield-keypair.json

# Or deploy with a specific program ID
solana program deploy target/deploy/keyshield.so --program-id YOUR_PROGRAM_ID
```

**Important**: After deployment, update `NEXT_PUBLIC_PROGRAM_ID` in your `.env.local` file with the deployed program ID.

## Frontend Setup

### 1. Install Dependencies

```bash
cd keyshield/frontend
npm install
```

### 2. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` to see the app.

## Testing

### 1. Unit Tests (Rust)

```bash
cd keyshield
cargo test-sbf
```

### 2. Integration Tests

```bash
# Using Mollusk (if configured)
cargo test --features test-bpf
```

### 3. Frontend Tests

```bash
cd keyshield/frontend
npm test
```

## Usage Flow

### 1. Connect Wallet

- Click "Connect Wallet" button
- Select your wallet (Phantom, Solflare, etc.)
- Approve the connection

### 2. Store API Key

- Click "Store Key" button
- Enter your API key
- Optionally set a time lock
- Click "Store Key"
- Approve the transaction in your wallet

### 3. Access Key

- If you're the owner, you can access directly
- If you're a recipient, you'll need to provide a ZK proof (Bonsol integration required)

### 4. Share Key

- Click "Share Key" button
- Enter recipient wallet address
- Optionally set a time lock
- Click "Share Key"
- Approve the transaction

## Privacy SDK Integration Status

| SDK | Status | Notes |
|-----|--------|-------|
| **Lit Protocol** | ✅ Working | Encryption/decryption functional |
| **Bonsol** | ⚠️ Stub | Requires ZK program setup |
| **Arcium** | ⚠️ Stub | Testnet only, requires circuit setup |

## Troubleshooting

### Program Deployment Issues

- Ensure you have enough SOL: `solana balance`
- Check program size: `solana program show YOUR_PROGRAM_ID`
- Verify program ID matches in frontend config

### Frontend Issues

- Clear browser cache and reload
- Check browser console for errors
- Verify `.env.local` is properly configured
- Ensure wallet is connected to the correct network (devnet/mainnet)

### Transaction Failures

- Check wallet has enough SOL for fees
- Verify program ID is correct
- Check RPC endpoint is accessible
- Review transaction in Solana Explorer

## Next Steps

1. **Bonsol Integration**: Set up ZK program and proof generation
2. **Arcium Integration**: Configure MPC circuits for sharing
3. **Mainnet Deployment**: Deploy to mainnet after testing
4. **Security Audit**: Consider professional security audit
5. **AI Agent Integration**: Add awesome-solana-ai agents for automation

## Resources

- [Solana Docs](https://docs.solana.com)
- [Lit Protocol Docs](https://developer.litprotocol.com)
- [Bonsol Docs](https://docs.bonsol.org)
- [Arcium Docs](https://docs.arcium.com)
- [Pinocchio Docs](https://docs.pinocchio.dev)
