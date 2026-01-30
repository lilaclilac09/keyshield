#!/bin/bash
set -e

echo "🚀 KeyShield - Deploy and Test on Devnet"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
NETWORK="devnet"
RPC_URL="https://api.devnet.solana.com"
PROGRAM_NAME="keyshield"
KEYPAIR_PATH="./target/deploy/${PROGRAM_NAME}-keypair.json"

# Step 1: Build the program
echo -e "${BLUE}📦 Step 1: Building program...${NC}"
cargo build-sbf
echo -e "${GREEN}✅ Build complete${NC}"
echo ""

# Step 2: Get program ID
if [ ! -f "$KEYPAIR_PATH" ]; then
    echo -e "${YELLOW}⚠️  No keypair found, generating new one...${NC}"
    solana-keygen new --outfile "$KEYPAIR_PATH" --no-bip39-passphrase
fi

PROGRAM_ID=$(solana address -k "$KEYPAIR_PATH")
echo -e "${BLUE}📍 Program ID: ${GREEN}$PROGRAM_ID${NC}"
echo ""

# Step 3: Check wallet balance
WALLET=$(solana address)
echo -e "${BLUE}👤 Your Wallet: ${GREEN}$WALLET${NC}"
echo ""

echo -e "${BLUE}💰 Step 2: Checking balance and requesting airdrop if needed...${NC}"
BALANCE=$(solana balance --url $NETWORK 2>/dev/null | awk '{print $1}' || echo "0")
echo "Current balance: $BALANCE SOL"

if (( $(echo "$BALANCE < 2" | bc -l) )); then
    echo "Requesting airdrop of 2 SOL..."
    solana airdrop 2 --url $NETWORK || echo "⚠️  Airdrop failed (may be rate limited)"
    sleep 2
fi
echo ""

# Step 4: Deploy the program
echo -e "${BLUE}📤 Step 3: Deploying program to $NETWORK...${NC}"
solana program deploy \
    target/deploy/${PROGRAM_NAME}.so \
    --program-id "$KEYPAIR_PATH" \
    --url $NETWORK

echo -e "${GREEN}✅ Program deployed!${NC}"
echo ""

# Step 5: Create test transaction
echo -e "${BLUE}🧪 Step 4: Creating test transaction...${NC}"
echo ""

# Create a Node.js test script
cat > /tmp/keyshield-test.mjs << 'EOF'
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import fs from 'fs';

const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID_STR = process.env.PROGRAM_ID;
const VAULT_SEED = Buffer.from('vault');

async function main() {
    console.log('🔗 Connecting to', RPC_URL);
    const connection = new Connection(RPC_URL, 'confirmed');
    
    // Load payer (your wallet)
    const payerPath = process.env.HOME + '/.config/solana/id.json';
    const payerKeypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync(payerPath, 'utf8')))
    );
    console.log('👤 Wallet:', payerKeypair.publicKey.toBase58());
    
    const programId = new PublicKey(PROGRAM_ID_STR);
    console.log('📍 Program ID:', programId.toBase58());
    
    // Derive Vault PDA
    const [vaultPDA, vaultBump] = PublicKey.findProgramAddressSync(
        [VAULT_SEED, payerKeypair.publicKey.toBuffer()],
        programId
    );
    console.log('🗃️  Vault PDA:', vaultPDA.toBase58());
    console.log('');
    
    // Check if vault already exists
    const vaultAccount = await connection.getAccountInfo(vaultPDA);
    if (vaultAccount) {
        console.log('⚠️  Vault already exists! Skipping StoreKey.');
        console.log('✅ Account size:', vaultAccount.data.length, 'bytes');
        console.log('');
        console.log('🔍 View on Solana Explorer:');
        console.log(`https://explorer.solana.com/address/${vaultPDA.toBase58()}?cluster=devnet`);
        console.log('');
        console.log('🔍 View on Solscan:');
        console.log(`https://solscan.io/account/${vaultPDA.toBase58()}?cluster=devnet`);
        return;
    }
    
    // Build StoreKey instruction data
    const instructionData = Buffer.alloc(1 + 32 + 32 + 32 + 8 + 1 + 1);
    let offset = 0;
    
    // Discriminator (0 = StoreKey)
    instructionData.writeUInt8(0, offset);
    offset += 1;
    
    // encrypted_key_hash (32 bytes) - test data
    const testHash = Buffer.from('test_hash_for_demo_purposes_123', 'utf-8');
    testHash.copy(instructionData, offset, 0, 32);
    offset += 32;
    
    // zk_commit (32 bytes) - placeholder
    Buffer.alloc(32, 0x02).copy(instructionData, offset);
    offset += 32;
    
    // mpc_hash (32 bytes) - placeholder
    Buffer.alloc(32, 0x03).copy(instructionData, offset);
    offset += 32;
    
    // timestamp (8 bytes)
    const timestamp = BigInt(Date.now());
    instructionData.writeBigUInt64LE(timestamp, offset);
    offset += 8;
    
    // key_type (1 byte) - 0 = Generic
    instructionData.writeUInt8(0, offset);
    offset += 1;
    
    // vault_bump (1 byte)
    instructionData.writeUInt8(vaultBump, offset);
    
    console.log('📝 Creating StoreKey transaction...');
    
    // Create instruction
    const storeKeyIx = new TransactionInstruction({
        keys: [
            { pubkey: payerKeypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: vaultPDA, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId,
        data: instructionData,
    });
    
    // Create and send transaction
    const transaction = new Transaction().add(storeKeyIx);
    
    console.log('📤 Sending transaction...');
    const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [payerKeypair],
        { commitment: 'confirmed' }
    );
    
    console.log('');
    console.log('✅ Transaction successful!');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 TRANSACTION DETAILS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('🔑 Signature:', signature);
    console.log('📍 Program ID:', programId.toBase58());
    console.log('🗃️  Vault PDA:', vaultPDA.toBase58());
    console.log('👤 Owner:', payerKeypair.publicKey.toBase58());
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 VIEW ON EXPLORERS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('📍 Transaction on Solana Explorer:');
    console.log(`https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    console.log('');
    console.log('📍 Transaction on Solscan:');
    console.log(`https://solscan.io/tx/${signature}?cluster=devnet`);
    console.log('');
    console.log('📍 Program on Solana Explorer:');
    console.log(`https://explorer.solana.com/address/${programId.toBase58()}?cluster=devnet`);
    console.log('');
    console.log('📍 Program on Solscan:');
    console.log(`https://solscan.io/account/${programId.toBase58()}?cluster=devnet`);
    console.log('');
    console.log('📍 Vault Account on Solana Explorer:');
    console.log(`https://explorer.solana.com/address/${vaultPDA.toBase58()}?cluster=devnet`);
    console.log('');
    console.log('📍 Vault Account on Solscan:');
    console.log(`https://solscan.io/account/${vaultPDA.toBase58()}?cluster=devnet`);
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Verify vault account
    const vaultAccountAfter = await connection.getAccountInfo(vaultPDA);
    if (vaultAccountAfter) {
        console.log('');
        console.log('✅ Vault account created successfully!');
        console.log('   Size:', vaultAccountAfter.data.length, 'bytes (expected: 288)');
        console.log('   Owner:', vaultAccountAfter.owner.toBase58());
        console.log('   Discriminator:', vaultAccountAfter.data.slice(0, 8).toString());
    }
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
EOF

# Run the test
echo "Running test transaction..."
echo ""
PROGRAM_ID=$PROGRAM_ID RPC_URL=$RPC_URL node /tmp/keyshield-test.mjs

echo ""
echo -e "${GREEN}🎉 Deployment and test complete!${NC}"
echo ""
echo -e "${YELLOW}📝 Don't forget to update your .env.local:${NC}"
echo "NEXT_PUBLIC_PROGRAM_ID=$PROGRAM_ID"
echo "VITE_PROGRAM_ID=$PROGRAM_ID"
