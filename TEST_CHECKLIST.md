# KeyShield Testing Checklist

Use this checklist to systematically test all KeyShield functionality.

## ✅ Pre-Testing Setup

- [ ] Rust installed and working (`rustc --version`)
- [ ] Node.js 18+ installed (`node --version`)
- [ ] Solana CLI installed (`solana --version`)
- [ ] Wallet extension installed (Phantom/Solflare)
- [ ] Solana CLI configured for devnet
- [ ] Wallet has devnet SOL (at least 1 SOL)
- [ ] Program built successfully (`cargo build-sbf`)
- [ ] Program deployed to devnet
- [ ] Program ID saved and added to `.env.local`
- [ ] Frontend dependencies installed (`npm install`)
- [ ] Frontend dev server can start (`npm run dev`)

## 🔌 Connection Tests

- [ ] Frontend loads at `http://localhost:3000`
- [ ] Page displays "Connect Wallet" button
- [ ] Wallet connection modal appears
- [ ] Can select wallet (Phantom/Solflare)
- [ ] Wallet connects successfully
- [ ] Wallet address displays in UI
- [ ] Can disconnect wallet
- [ ] Can reconnect wallet

## 💾 Store Key Tests

- [ ] "Store Key" button visible when connected
- [ ] Store Key modal opens
- [ ] Can enter API key in form
- [ ] Can enter key name (optional)
- [ ] Can toggle time-lock option
- [ ] Form validation works (empty key shows error)
- [ ] "Store Key" button triggers transaction
- [ ] Wallet prompts for transaction approval
- [ ] Transaction submits successfully
- [ ] Loading indicator shows during transaction
- [ ] Modal closes after successful storage
- [ ] Vault appears in dashboard after storage
- [ ] Transaction visible in Solana Explorer

## 📊 Vault Display Tests

- [ ] Vault card displays after storing key
- [ ] Vault shows "Secure Vault" status
- [ ] Encryption shows "Lit Protocol ✓"
- [ ] ZK Commit displays (hex value, first 8 bytes)
- [ ] MPC Hash displays (hex value, first 8 bytes)
- [ ] Created timestamp displays correctly
- [ ] Time-lock indicator shows if enabled
- [ ] "Share Key" button visible
- [ ] "Update Key" button visible (if vault exists)

## 🔓 Access Key Tests

- [ ] Owner can access vault directly
- [ ] No ZK proof required for owner
- [ ] Vault data is readable
- [ ] Access works immediately after storage

**Note**: Full decryption UI may need to be implemented. Currently, program verifies access.

## 🔗 Share Key Tests

- [ ] "Share Key" button opens dialog
- [ ] Can enter recipient wallet address
- [ ] Can set time-lock date (optional)
- [ ] Form validates recipient address
- [ ] Invalid address shows error
- [ ] "Share Key" button triggers transaction
- [ ] Wallet prompts for transaction approval
- [ ] Transaction submits successfully
- [ ] Share account created on-chain
- [ ] Modal closes after successful share

## 🔄 Update Key Tests

- [ ] Can update existing vault
- [ ] New key data replaces old data
- [ ] Timestamp updates
- [ ] Vault display refreshes

## 🌐 Multiple Wallet Tests

- [ ] Wallet A can store key
- [ ] Wallet B has separate vault
- [ ] Vaults are isolated by owner
- [ ] Wallet B cannot access Wallet A's vault
- [ ] Each wallet shows own vault

## ⏱️ Time-Lock Tests

- [ ] Can store key with time-lock enabled
- [ ] Vault shows time-lock indicator
- [ ] Access flags set correctly
- [ ] Time-lock date stored correctly

## 🔐 Encryption Tests

- [ ] API key encrypted before storage
- [ ] Plaintext not visible on-chain
- [ ] Ciphertext stored in vault account
- [ ] Lit Protocol client connects
- [ ] Encryption uses correct access conditions

## 📡 On-Chain Verification Tests

- [ ] Vault account exists on-chain
- [ ] Account size is 288 bytes
- [ ] Discriminator is "keyshld"
- [ ] Owner matches wallet address
- [ ] Encrypted key stored (128 bytes)
- [ ] ZK commit stored (32 bytes)
- [ ] MPC hash stored (32 bytes)
- [ ] Created timestamp stored (8 bytes)
- [ ] Access flags stored (1 byte)

## 🚨 Error Handling Tests

- [ ] Empty API key shows validation error
- [ ] Invalid recipient address shows error
- [ ] Insufficient SOL shows error message
- [ ] Network errors handled gracefully
- [ ] Transaction failures show user-friendly message
- [ ] Program errors display correctly

## 🔍 Transaction Tests

- [ ] Store key transaction confirms
- [ ] Share key transaction confirms
- [ ] Transactions appear in Solana Explorer
- [ ] Transaction signatures are valid
- [ ] Program logs visible in transactions
- [ ] Compute units within limits

## 🎨 UI/UX Tests

- [ ] Loading states display correctly
- [ ] Error messages are clear
- [ ] Success feedback provided
- [ ] Modals close properly
- [ ] Forms reset after submission
- [ ] UI updates in real-time
- [ ] Responsive design works
- [ ] No console errors (check browser console)

## 🔄 State Management Tests

- [ ] Vault data refreshes after storage
- [ ] Multiple tabs stay in sync
- [ ] State persists across page reloads
- [ ] Cache invalidation works

## 🧪 Edge Cases

- [ ] Very long API key (truncation)
- [ ] Special characters in API key
- [ ] Multiple rapid transactions
- [ ] Transaction while another pending
- [ ] Disconnect wallet during operation
- [ ] Network interruption handling

## 📱 Browser Compatibility

- [ ] Works in Chrome
- [ ] Works in Firefox
- [ ] Works in Safari
- [ ] Works in Edge

## 🔒 Security Tests

- [ ] API keys never logged to console
- [ ] Plaintext never sent to server
- [ ] Encryption happens client-side
- [ ] Wallet private keys never exposed
- [ ] Transactions properly signed

## 📈 Performance Tests

- [ ] Page loads quickly
- [ ] Transactions confirm within 30s
- [ ] UI remains responsive
- [ ] No memory leaks
- [ ] Efficient re-renders

## ✅ Final Verification

- [ ] All critical tests pass
- [ ] No blocking bugs
- [ ] Documentation matches behavior
- [ ] Error messages are helpful
- [ ] User experience is smooth

## 📝 Test Results Template

```
Test Date: ___________
Tester: ___________
Environment: Devnet / Mainnet
Program ID: ___________

Results Summary:
- Total Tests: ___
- Passed: ___
- Failed: ___
- Skipped: ___

Critical Issues:
1. ___________
2. ___________

Notes:
___________
```

## 🐛 Bug Reporting

When reporting bugs, include:
- [ ] Steps to reproduce
- [ ] Expected behavior
- [ ] Actual behavior
- [ ] Browser and version
- [ ] Wallet used
- [ ] Console errors (if any)
- [ ] Transaction signatures (if applicable)
- [ ] Screenshots (if applicable)

---

**Testing Status**: ⬜ Not Started | 🟡 In Progress | ✅ Complete

**Last Tested**: ___________

**Tester**: ___________
