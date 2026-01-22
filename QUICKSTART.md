# KeyShield Quick Start Guide

## 🚀 Quick Start (5 minutes)

### 1. Prerequisites Check

```bash
# Check Rust
rustc --version

# Check Node.js
node --version  # Should be 18+

# Check Solana CLI
solana --version

# Set to devnet
solana config set --url devnet
```

### 2. Build and Deploy Program

```bash
cd keyshield

# Build the program
cargo build-sbf

# Deploy (replace with your keypair if needed)
solana program deploy target/deploy/keyshield.so

# Copy the Program ID from output and update frontend/.env.local
```

### 3. Setup Frontend

```bash
cd frontend

# Install dependencies
npm install

# Create .env.local (see SETUP.md for template)
# Set NEXT_PUBLIC_PROGRAM_ID to your deployed program ID

# Start dev server
npm run dev
```

### 4. Test the App

1. Open `http://localhost:3000`
2. Connect your wallet (Phantom/Solflare)
3. Click "Store Key"
4. Enter a test API key
5. Approve transaction
6. View your vault!

## 📝 User Flow Summary

### Store Key Flow
```
User → Enter API Key → Lit Encryption → Generate ZK/MPC → Build TX → Sign → Store on-chain
```

### Access Key Flow
```
User → Click Access → Check Owner → (If owner: Direct) | (If not: ZK Proof) → Decrypt with Lit → Display
```

### Share Key Flow
```
Owner → Enter Recipient → Set Time Lock → MPC Computation → Create Share Account → Recipient Can Access
```

## 🔧 Common Issues

### "Account not found" error
- The vault PDA account needs to be created
- The program should handle this, but if not, you may need to add account creation logic
- Check that the program ID is correct

### Transaction fails
- Ensure you have SOL: `solana balance`
- Check RPC endpoint is accessible
- Verify program is deployed

### Wallet connection issues
- Clear browser cache
- Try different wallet (Phantom/Solflare)
- Check wallet is on devnet

## 🎯 Next Steps

1. **Test Store/Access**: Store a key and verify you can access it
2. **Test Sharing**: Share a key with another wallet
3. **Integrate Bonsol**: Set up ZK proof generation
4. **Integrate Arcium**: Configure MPC for sharing
5. **Deploy to Mainnet**: After thorough testing

## 📚 Full Documentation

See [SETUP.md](./SETUP.md) for detailed setup instructions.
See [README.md](./README.md) for architecture and features.
See [USERFLOW_WORKFLOW.md](./USERFLOW_WORKFLOW.md) for complete user flows.
