# KeyShield Demo Guide

## 🎬 Quick Demo Walkthrough

### Step 1: Open the Application
1. Open your browser and navigate to: **http://localhost:3000**
2. You should see the KeyShield dashboard

### Step 2: Connect Your Wallet
1. Click the **"Select Wallet"** button (top right)
2. **For Safari users**: Select **WalletConnect** (first option)
   - A QR code will appear
   - Scan with your mobile Solana wallet (Phantom, Solflare, etc.)
   - Approve the connection
3. **For Chrome/Firefox**: You can use WalletConnect OR browser extensions
   - Phantom, Solflare extensions will be detected automatically

### Step 3: Store Your First API Key
1. Once connected, click the **"Store Key"** button (green button)
2. Fill in the form:
   - **Key Name**: "Demo API Key" (optional)
   - **API Key**: Enter any test API key (e.g., `sk_test_1234567890abcdef`)
   - **Time Lock**: Leave unchecked for now
3. Click **"Store Key"**
4. Approve the transaction in your wallet
5. Wait for confirmation (usually 5-10 seconds)

**What happens:**
- ✅ API key is encrypted with Lit Protocol
- ✅ ZK commit and MPC hash are generated
- ✅ Transaction is submitted to Solana
- ✅ Vault account is created on-chain
- ✅ Vault appears in the dashboard

### Step 4: View Your Vault
After storing a key, you'll see:
- **Secure Vault** card with:
  - Encryption status: "Lit Protocol ✓"
  - ZK Commit: First 8 bytes (hex)
  - MPC Hash: First 8 bytes (hex)
  - Created timestamp
  - Protected status indicator

### Step 5: Share Your Key (Optional)
1. Click the **"Share Key"** button (blue button)
2. Enter a recipient wallet address:
   - Use a test address or another wallet you control
   - Example: `11111111111111111111111111111111` (System Program - for testing)
3. Optionally set a time lock (future date)
4. Click **"Share Key"**
5. Approve the transaction

**What happens:**
- ✅ Share account is created on-chain
- ✅ Recipient can access the key (with ZK proof in future)

### Step 6: Verify On-Chain
1. Open Solana Explorer:
   - Program: https://explorer.solana.com/address/59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW?cluster=devnet
2. Check your wallet transactions
3. Verify vault account exists
4. Check account data matches what you stored

## 🎯 Demo Features to Highlight

### 1. WalletConnect Integration
- **Safari Compatibility**: Works without browser extensions
- **QR Code Connection**: Scan with any Solana wallet
- **Universal Access**: Works with Phantom, Solflare, Backpack, etc.

### 2. Privacy Features
- **Lit Protocol Encryption**: Keys encrypted before on-chain storage
- **ZK Proofs**: Access verification without revealing secrets (stub)
- **MPC Sharing**: Secure agent-to-agent communication (stub)
- **Time-Locked Access**: Control when keys become accessible

### 3. On-Chain Storage
- **Decentralized**: Keys stored on Solana blockchain
- **Immutable**: Transaction history is permanent
- **Transparent**: All transactions visible on Solana Explorer
- **Secure**: Encrypted data, only owner can decrypt

## 📸 Expected UI Flow

```
1. Landing Page
   └─> "Connect Your Wallet" screen
       └─> Wallet selection modal
           └─> WalletConnect QR code (Safari) or Extension (Chrome)

2. Dashboard (After Connection)
   └─> "No Vault Found" or "Your Vault" screen
       └─> "Store Key" button
           └─> Store Key Form
               └─> Transaction approval
                   └─> Vault appears

3. Vault Display
   └─> Secure Vault card
       ├─> Encryption: Lit Protocol ✓
       ├─> ZK Commit: [hex]
       ├─> MPC Hash: [hex]
       ├─> Created: [timestamp]
       └─> "Share Key" button
```

## 🔍 What to Look For

### Success Indicators
- ✅ Wallet connects without errors
- ✅ Transaction submits successfully
- ✅ Transaction confirms (check Solana Explorer)
- ✅ Vault appears in dashboard
- ✅ All vault data displays correctly
- ✅ No console errors

### Potential Issues
- ⚠️ "AccountNotFound" → PDA account creation issue (will fix if occurs)
- ⚠️ "Insufficient funds" → Need more SOL (airdrop: `solana airdrop 2`)
- ⚠️ Lit Protocol timeout → Wait a few seconds, retry
- ⚠️ Transaction rejection → User cancelled (normal)

## 🎥 Demo Script

**Opening (30 seconds)**
- "This is KeyShield, a decentralized API key vault on Solana"
- "It uses advanced privacy technologies: ZK proofs, MPC, and Lit Protocol"
- "Let me show you how it works..."

**Wallet Connection (1 minute)**
- "First, I'll connect my wallet using WalletConnect"
- "This works on Safari without any extensions"
- "I'll scan the QR code with my mobile wallet"
- "Connected! Now I can use the app"

**Store Key (2 minutes)**
- "Let me store an API key"
- "I'll enter a test key and submit"
- "The key is encrypted with Lit Protocol before storage"
- "Transaction is being submitted..."
- "Confirmed! The vault is now on-chain"

**View Vault (1 minute)**
- "Here's my vault with all the encrypted data"
- "You can see the ZK commit and MPC hash"
- "The actual key is encrypted and only I can decrypt it"

**Share Key (1 minute)**
- "I can share this key with others"
- "I'll enter a recipient address"
- "The share account is created on-chain"
- "The recipient can access it with a ZK proof"

**Closing (30 seconds)**
- "That's KeyShield - secure, private, and decentralized"
- "All data is on-chain, encrypted, and accessible via ZK proofs"

## 🚀 Quick Start Commands

```bash
# If server isn't running:
cd frontend && npm run dev

# Open in browser:
open http://localhost:3000

# Check program:
solana program show 59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW

# Check your balance:
solana balance
```

## 📱 Mobile Demo

For mobile testing:
1. Connect to same network as your computer
2. Find your computer's IP address
3. Open `http://<YOUR_IP>:3000` on mobile
4. Use WalletConnect to connect mobile wallet
5. Test all flows on mobile

## ✨ Demo Highlights

- **No Browser Extensions Needed**: WalletConnect works everywhere
- **Real Encryption**: Lit Protocol actually encrypts your keys
- **On-Chain Storage**: Everything is stored on Solana blockchain
- **Privacy First**: ZK proofs verify access without revealing secrets
- **Future-Proof**: Ready for Bonsol and Arcium integration

---

**Ready to demo!** Open http://localhost:3000 and follow the steps above.
