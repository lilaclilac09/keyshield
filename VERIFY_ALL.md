# Complete Verification Guide

## 1. Verify On-Chain Storage

### Quick Method (Browser Console)

1. Open dashboard: `http://localhost:3000`
2. Connect your wallet
3. Open DevTools (F12) → Console tab
4. Run:
   ```javascript
   fetch('/verify-storage.js').then(r => r.text()).then(eval)
   ```
5. Check output for:
   - ✅ Vault PDA found
   - ✅ `encrypted_key_hash` = 32-byte hex (random, NOT plaintext)
   - ✅ IndexedDB has full ciphertext

### What You Should See

**✅ Correct (Secure)**:
```
encrypted_key_hash (32 bytes):
   Hex: a3f2b1c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1
   ✅ encrypted_key_hash is properly hashed (not plaintext)
```

**❌ Incorrect (Security Issue)**:
```
⚠️  WARNING: encrypted_key_hash appears to be readable text!
   Value: sk-test-helius-dummy-2026
```

---

## 2. Verify Wallet Connection

### Test Wallet Connection

1. **Open Dashboard**: `http://localhost:3000`
2. **Click "Select Wallet"** button (top right)
3. **Available Options**:
   - **Burner** (for Safari/testing) - Auto-connects, no extension needed
   - **WalletConnect** - QR code connection
   - **Phantom** - If extension installed
   - **Solflare** - If extension installed

### Expected Behavior

**✅ Working**:
- Dropdown shows available wallets
- "Burner" shows as "Installed" or "Available"
- Clicking wallet connects within 2-3 seconds
- Wallet address displays after connection
- Network shows "Devnet"

**❌ Not Working**:
- Dropdown doesn't open
- "Connecting..." hangs forever
- Error toast appears
- No wallets listed

### Debug Wallet Connection

**In Browser Console (F12)**:
```javascript
// Check if wallet adapters are loaded
console.log('Wallets:', window.__NEXT_DATA__);

// Check wallet connection state
// (This will show in React DevTools if installed)
```

**Common Issues**:
- **Safari**: Use "Burner" wallet (already configured)
- **Chrome/Firefox**: Install Phantom or Solflare extension
- **Hanging**: Check browser console for errors
- **No wallets**: Check `WalletProvider.tsx` - should have UnsafeBurnerWalletAdapter

---

## 3. Verify Auto-Detection (Extension)

### Step 1: Build Extension

```bash
cd extension
npm run build
```

### Step 2: Load Extension

1. Open `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select `extension/dist` folder
5. Verify extension shows as enabled

### Step 3: Test Detection

1. **Open test page**: `extension/test-page.html` in a browser tab
2. **Wait 5-10 seconds** for initial scan
3. **Expected**: Notification appears: "KeyShield: API Key Detected!"
4. **Click notification button**: Opens dashboard

### Step 4: Check Logs

**Content Script Logs** (on test page):
1. Open DevTools (F12) on test page
2. Console tab
3. Look for: `[KeyShield] Keys detected from DOM content: X`
4. Should see detection messages every 5 seconds

**Service Worker Logs**:
1. `chrome://extensions` → KeyShield
2. Click "Inspect views: service worker"
3. Check console for `[KeyShield]` messages
4. Should see: "KEY_DETECTED" messages

### Debug Auto-Detection

**If Not Working**:

1. **Check Extension is Loaded**:
   - `chrome://extensions` → Verify KeyShield is enabled
   - Check for errors (red text)

2. **Check Permissions**:
   - Extension needs: `storage`, `activeTab`, `notifications`, `webRequest`
   - Verify in `manifest.json`

3. **Check Content Script**:
   - Open test page → DevTools → Console
   - Type: `chrome.runtime.sendMessage({type: 'DETECT_KEYS'}, console.log)`
   - Should return detected keys

4. **Check Service Worker**:
   - `chrome://extensions` → Inspect service worker
   - Should see initialization logs
   - No errors in console

5. **Manual Test**:
   - On any page, press `Ctrl+Shift+K` (or `Cmd+Shift+K` on Mac)
   - Should trigger detection

---

## 4. Complete Test Flow

### Full End-to-End Test

1. **Start Server**:
   ```bash
   cd frontend
   npm run dev
   ```

2. **Open Dashboard**: `http://localhost:3000`

3. **Connect Wallet**:
   - Click "Select Wallet"
   - Choose "Burner" (or Phantom if installed)
   - Verify address displays

4. **Store Key**:
   - Enter test key: `sk-test-helius-dummy-2026`
   - Select provider: "Helius" or "Generic"
   - Click "Store Key"
   - Sign transaction
   - Wait for confirmation

5. **Verify On-Chain**:
   - Run verification script in console
   - Check: Hash on-chain, ciphertext in IndexedDB

6. **Test Auto-Detection**:
   - Load extension (if not already)
   - Open `extension/test-page.html`
   - Wait for notification
   - Click to open dashboard

7. **Test Reveal**:
   - In dashboard, click "Reveal" on stored key
   - Sign session signature
   - Verify original key displays
   - Key should auto-hide after 30 seconds

---

## Troubleshooting

### Wallet Connection Issues

**Problem**: Dropdown doesn't open
- **Fix**: Check browser console for errors
- **Fix**: Verify `WalletProvider` is wrapping the app

**Problem**: "Connecting..." hangs
- **Fix**: Try "Burner" wallet (no extension needed)
- **Fix**: Check RPC endpoint in `.env.local`
- **Fix**: Restart dev server

**Problem**: No wallets listed
- **Fix**: Check `WalletProvider.tsx` - should have UnsafeBurnerWalletAdapter
- **Fix**: Verify `@solana/wallet-adapter-wallets` is installed

### Auto-Detection Issues

**Problem**: No notifications
- **Fix**: Check notification permissions in `chrome://extensions`
- **Fix**: Verify extension is enabled
- **Fix**: Check service worker logs for errors

**Problem**: Detection not working
- **Fix**: Rebuild extension: `cd extension && npm run build`
- **Fix**: Reload extension in `chrome://extensions`
- **Fix**: Check content script is injected (DevTools → Sources → Content scripts)

**Problem**: False positives
- **Fix**: This is normal - extension detects patterns, not just real keys
- **Fix**: Use the save dialog to choose which keys to save

---

## Quick Commands

```bash
# Verify on-chain (replace with your wallet address)
./scripts/verify-vault.sh 74Xuc5BC5uttSiHj598sJJj3rgEUsfYF7xVs69tWLwDY

# Build extension
cd extension && npm run build

# Start frontend
cd frontend && npm run dev

# Check if server is running
lsof -i :3000
```

---

## Success Checklist

- [ ] Wallet connects successfully
- [ ] Key stored on-chain (hash only, not plaintext)
- [ ] IndexedDB contains full ciphertext
- [ ] Key can be revealed/decrypted
- [ ] Extension detects keys on test page
- [ ] Notifications appear when keys detected
- [ ] Dashboard opens from notification
