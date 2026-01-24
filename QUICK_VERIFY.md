# Quick Verification Guide

## Verify On-Chain Storage

### Method 1: Browser Console (Easiest)

1. Open your dashboard at `http://localhost:3000`
2. Connect your wallet
3. Open browser DevTools (F12 or Cmd+Option+I)
4. Go to Console tab
5. Copy and paste the entire contents of `frontend/public/verify-storage.js`
6. Press Enter
7. Review the output - it will show:
   - Your wallet address
   - Vault PDA address
   - On-chain hash (should be 32 bytes, random hex - NOT plaintext)
   - IndexedDB ciphertext entries

### Method 2: Solana Explorer

1. Get your wallet address from the dashboard
2. Visit: `https://explorer.solana.com/address/YOUR_WALLET_ADDRESS?cluster=devnet`
3. Look for the vault PDA account (derived from your wallet + program)
4. Check account data - bytes 40-71 should be a hash, not readable text

### Method 3: Command Line

```bash
# Replace with your wallet address
./scripts/verify-vault.sh 74Xuc5BC5uttSiHj598sJJj3rgEUsfYF7xVs69tWLwDY
```

## What to Look For

✅ **Correct (Secure)**:
- On-chain: 32-byte random hex hash (e.g., `a3f2b1c4d5e6f7...`)
- IndexedDB: Full ciphertext (1-5 KB base64 string)
- Hash matches between on-chain and IndexedDB key

❌ **Incorrect (Security Issue)**:
- On-chain shows readable text like `sk-test-helius-...`
- Plaintext API key visible in Solana Explorer
- No IndexedDB entry

## Verify Auto-Detection

1. **Check Extension is Loaded**:
   - Chrome: `chrome://extensions`
   - Look for "KeyShield - Private API Vault"
   - Ensure it's enabled

2. **Test Detection**:
   - Open `extension/test-page.html` in a browser tab
   - Wait 5-10 seconds
   - Should see notification: "KeyShield: API Key Detected!"

3. **Check Console Logs**:
   - Open DevTools on test page
   - Look for `[KeyShield]` log messages
   - Should see: "Keys detected from DOM content"

4. **Check Service Worker**:
   - `chrome://extensions` → KeyShield → "Inspect views: service worker"
   - Check for errors or logs
