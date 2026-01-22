# KeyShield Testing Instructions

## Prerequisites
- Frontend server running at http://localhost:3000
- Wallet connected (WalletConnect or extension)
- Sufficient SOL in wallet (at least 0.1 SOL for testing)

## Test 1: Store Key Flow

### Steps:
1. Open http://localhost:3000 in browser
2. Connect wallet using WalletConnect or extension
3. Click "Store Key" button
4. Fill in the form:
   - Key Name: "Test API Key"
   - API Key: "sk_test_1234567890abcdef"
   - Time Lock: Leave unchecked
5. Click "Store Key"
6. Approve transaction in wallet
7. Wait for confirmation

### Expected Results:
- ✅ Transaction submits successfully
- ✅ Transaction confirms (check Solana Explorer)
- ✅ Vault appears in dashboard
- ✅ Vault shows encryption status, ZK commit, MPC hash
- ✅ Created timestamp displays

### Debugging:
- If transaction fails with "AccountNotFound":
  - The PDA account needs to be created first
  - Check program logs in Solana Explorer
- If Lit Protocol fails:
  - Check browser console for errors
  - Verify NEXT_PUBLIC_LIT_NETWORK is set to "datil"

## Test 2: Access Key Flow

### Steps:
1. After storing a key, verify vault displays
2. Check that vault data is correct:
   - Owner matches your wallet
   - Created timestamp is recent
   - ZK commit and MPC hash are displayed
3. Verify you can see the vault as owner

### Expected Results:
- ✅ Vault displays correctly
- ✅ All data fields are populated
- ✅ Owner can access vault (no ZK proof needed)

## Test 3: Share Key Flow

### Steps:
1. Click "Share Key" button
2. Enter a recipient wallet address (can be a test address)
3. Optionally set a time lock
4. Click "Share Key"
5. Approve transaction
6. Wait for confirmation

### Expected Results:
- ✅ Transaction submits successfully
- ✅ Transaction confirms
- ✅ Share account created on-chain

### Debugging:
- If share fails:
  - Verify recipient address is valid Solana address
  - Check wallet has sufficient SOL
  - Check transaction in Solana Explorer

## Test 4: Error Handling

### Test Cases:
1. Try to store key with empty API key → Should show validation error
2. Try to share with invalid address → Should show error
3. Try to store key with insufficient SOL → Should show error

## Verification

### On-Chain Verification:
```bash
# Get your wallet address
solana address

# Derive vault PDA (you'll need to calculate this or use Solana Explorer)
# Check account exists
solana account <VAULT_PDA_ADDRESS>

# Check program transactions
solana program show 59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW
```

### Solana Explorer:
- View transactions: https://explorer.solana.com/address/59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW?cluster=devnet
- Check your wallet transactions
- Verify account data

## Known Issues & Workarounds

### Issue: PDA Account Creation
**Problem**: PDAs must be created by the program, not the client
**Current Status**: Program should handle account creation, but may need fixes
**Workaround**: If account creation fails, we may need to add explicit account creation logic

### Issue: Lit Protocol Encryption
**Problem**: May take time to initialize
**Workaround**: Wait for Lit client to connect before storing keys

## Next Steps After Testing

1. Document any errors found
2. Fix account creation if needed
3. Add proper error messages
4. Test edge cases
5. Optimize transaction costs
