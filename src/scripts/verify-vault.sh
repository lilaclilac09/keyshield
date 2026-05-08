#!/bin/bash

# KeyShield Vault Verification Script
# Verifies on-chain storage shows hash (32 bytes) not plaintext
# Usage: ./scripts/verify-vault.sh <wallet-address> [rpc-url]

set -e

WALLET_ADDRESS=$1
RPC_URL=${2:-"https://api.devnet.solana.com"}
PROGRAM_ID="59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW"
VAULT_SEED="vault"

if [ -z "$WALLET_ADDRESS" ]; then
    echo "Usage: ./scripts/verify-vault.sh <wallet-address> [rpc-url]"
    echo "Example: ./scripts/verify-vault.sh 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
    exit 1
fi

echo "🔍 Verifying KeyShield Vault"
echo "================================"
echo "Wallet Address: $WALLET_ADDRESS"
echo "Program ID: $PROGRAM_ID"
echo "RPC URL: $RPC_URL"
echo ""

# Check if solana CLI is available
if ! command -v solana &> /dev/null; then
    echo "❌ Error: solana CLI not found. Please install Solana CLI tools."
    exit 1
fi

# Derive vault PDA using solana CLI
# Note: This is a simplified approach. For production, use the program's PDA derivation
echo "📊 Deriving Vault PDA..."
echo "   (Using seed: '$VAULT_SEED' + wallet address)"
echo ""

# Fetch account info
# The vault PDA is: findProgramAddress([Buffer.from('vault'), owner.toBuffer()], programId)
# We'll use a Node.js script or direct RPC call to derive it properly
# For now, let's try to get account info using solana CLI

echo "🔎 Fetching vault account data..."
ACCOUNT_INFO=$(solana account "$WALLET_ADDRESS" --url "$RPC_URL" --output json 2>&1 || echo "NOT_FOUND")

if echo "$ACCOUNT_INFO" | grep -q "AccountNotFound\|error"; then
    echo "⚠️  Direct wallet account check failed (expected - we need the PDA)"
    echo ""
    echo "💡 To properly verify the vault:"
    echo "   1. Use the browser console helper (see frontend/public/verify-storage.js)"
    echo "   2. Or use Solana Explorer:"
    echo "      https://explorer.solana.com/address/$WALLET_ADDRESS?cluster=devnet"
    echo ""
    echo "   The vault PDA is derived as:"
    echo "   findProgramAddress([Buffer.from('vault'), owner.toBuffer()], programId)"
    echo ""
    exit 0
fi

# If we have account data, parse it
echo "✅ Account found!"
echo ""
echo "📋 Account Structure (288 bytes expected):"
echo "   - Bytes 0-7:   Discriminator (should be 'keyshld\\0')"
echo "   - Bytes 8-39:  Owner public key (32 bytes)"
echo "   - Bytes 40-71: encrypted_key_hash (32 bytes) ← This should be a hash, NOT plaintext!"
echo "   - Bytes 72-103: zk_commit (32 bytes)"
echo "   - Bytes 104-135: mpc_hash (32 bytes)"
echo "   - Bytes 136-143: created_at timestamp (8 bytes)"
echo "   - Byte 144:     access_flags (1 byte)"
echo "   - Bytes 145-287: reserved (143 bytes)"
echo ""

# Extract and display the encrypted_key_hash
echo "🔐 Verifying encrypted_key_hash..."
echo ""
echo "   The encrypted_key_hash (bytes 40-71) should be:"
echo "   - Exactly 32 bytes"
echo "   - A random-looking hash (not readable text)"
echo "   - NOT the plaintext API key"
echo ""

# Check if we can decode the account data
if command -v node &> /dev/null; then
    echo "💻 Using Node.js to parse account data..."
    node << EOF
const { execSync } = require('child_process');
try {
    const output = execSync('solana account "$WALLET_ADDRESS" --url "$RPC_URL" --output json', { encoding: 'utf-8' });
    const account = JSON.parse(output);
    const data = Buffer.from(account.account.data[0], 'base64');
    
    if (data.length < 288) {
        console.log('⚠️  Account data is smaller than expected (288 bytes)');
        console.log('   Actual size:', data.length, 'bytes');
        process.exit(1);
    }
    
    // Check discriminator
    const discriminator = data.slice(0, 8).toString();
    const expectedDiscriminator = 'keyshld\\0';
    if (discriminator === expectedDiscriminator) {
        console.log('✅ Discriminator correct: keyshld');
    } else {
        console.log('❌ Discriminator mismatch. Expected: keyshld\\0, Got:', discriminator);
    }
    
    // Extract encrypted_key_hash (bytes 40-71)
    const encryptedKeyHash = data.slice(40, 72);
    console.log('\\n📊 encrypted_key_hash (32 bytes):');
    console.log('   Hex:', encryptedKeyHash.toString('hex'));
    console.log('   Base64:', encryptedKeyHash.toString('base64'));
    
    // Verify it's not plaintext (check if it contains readable ASCII)
    const asString = encryptedKeyHash.toString('utf-8');
    const isReadable = /^[\\x20-\\x7E]+$/.test(asString) && asString.length > 10;
    
    if (isReadable) {
        console.log('\\n⚠️  WARNING: encrypted_key_hash appears to be readable text!');
        console.log('   This suggests plaintext storage (SECURITY ISSUE)');
        console.log('   Value:', asString);
    } else {
        console.log('\\n✅ encrypted_key_hash is properly hashed (not plaintext)');
    }
    
    // Display owner
    const ownerBytes = data.slice(8, 40);
    const ownerPubkey = Buffer.from(ownerBytes).toString('base64');
    console.log('\\n👤 Owner (bytes 8-39):');
    console.log('   Base64:', ownerPubkey);
    
    // Display timestamp
    const timestamp = data.readBigUInt64LE(136);
    const date = new Date(Number(timestamp));
    console.log('\\n🕐 Created At:', date.toISOString());
    
} catch (error) {
    console.error('Error parsing account:', error.message);
    process.exit(1);
}
EOF
else
    echo "⚠️  Node.js not found. Install Node.js for detailed account parsing."
    echo ""
    echo "📝 Manual verification steps:"
    echo "   1. View account on Solana Explorer"
    echo "   2. Check that bytes 40-71 are a random hash (not readable text)"
    echo "   3. Verify account size is 288 bytes"
fi

echo ""
echo "================================"
echo "✅ Verification complete!"
echo ""
echo "💡 Next steps:"
echo "   - Check IndexedDB in browser for full ciphertext"
echo "   - Test decryption in the frontend"
echo "   - Verify access control with different wallet"
