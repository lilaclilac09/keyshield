#!/usr/bin/env node
/**
 * Simple test script to create a StoreKey transaction on devnet
 * and display the transaction links for Solscan and Solana Explorer
 */

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const VAULT_SEED = Buffer.from('vault');

async function main() {
    console.log('🚀 KeyShield StoreKey Test');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    // Load program ID from keypair
    const keypairPath = path.join(__dirname, '../target/deploy/keyshield-keypair.json');
    if (!fs.existsSync(keypairPath)) {
        console.error('❌ Program keypair not found. Run: cargo build-sbf');
        process.exit(1);
    }
    
    const programKeypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf8')))
    );
    const programId = programKeypair.publicKey;
    
    console.log('📍 Program ID:', programId.toBase58());
    console.log('🔗 RPC URL:', RPC_URL);
    console.log('');
    
    // Connect to Solana
    const connection = new Connection(RPC_URL, 'confirmed');
    
    // Load wallet
    const walletPath = path.join(process.env.HOME, '.config/solana/id.json');
    const wallet = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, 'utf8')))
    );
    console.log('👤 Wallet:', wallet.publicKey.toBase58());
    
    // Check balance
    try {
        const balance = await connection.getBalance(wallet.publicKey);
        console.log('💰 Balance:', (balance / 1e9).toFixed(4), 'SOL');
        
        if (balance < 0.1 * 1e9) {
            console.log('⚠️  Low balance, requesting airdrop...');
            try {
                const airdropSig = await connection.requestAirdrop(wallet.publicKey, 2e9);
                await connection.confirmTransaction(airdropSig);
                console.log('✅ Airdrop successful!');
            } catch (e) {
                console.log('⚠️  Airdrop failed (may be rate limited):', e.message);
            }
        }
    } catch (e) {
        console.log('⚠️  Could not check balance:', e.message);
    }
    
    console.log('');
    
    // Derive Vault PDA
    const [vaultPDA, vaultBump] = PublicKey.findProgramAddressSync(
        [VAULT_SEED, wallet.publicKey.toBuffer()],
        programId
    );
    console.log('🗃️  Vault PDA:', vaultPDA.toBase58());
    console.log('📊 Bump:', vaultBump);
    console.log('');
    
    // Check if vault exists
    try {
        const vaultAccount = await connection.getAccountInfo(vaultPDA);
        if (vaultAccount) {
            console.log('⚠️  Vault already exists!');
            console.log('   Size:', vaultAccount.data.length, 'bytes');
            console.log('   Owner:', vaultAccount.owner.toBase58());
            console.log('');
            console.log('🔍 View existing vault on explorers:');
            console.log('');
            console.log('   Solana Explorer:');
            console.log(`   https://explorer.solana.com/address/${vaultPDA.toBase58()}?cluster=devnet`);
            console.log('');
            console.log('   Solscan:');
            console.log(`   https://solscan.io/account/${vaultPDA.toBase58()}?cluster=devnet`);
            console.log('');
            console.log('   Program transactions on Solscan:');
            console.log(`   https://solscan.io/account/${programId.toBase58()}?cluster=devnet`);
            return;
        }
    } catch (e) {
        console.log('⚠️  Could not check vault (this is normal if it doesn\'t exist yet)');
    }
    
    console.log('📝 Building StoreKey instruction...');
    
    // Build instruction data
    const instructionData = Buffer.alloc(1 + 32 + 32 + 32 + 8 + 1 + 1);
    let offset = 0;
    
    // Discriminator (0 = StoreKey)
    instructionData.writeUInt8(0, offset);
    offset += 1;
    
    // encrypted_key_hash (32 bytes) - test data
    const testHash = Buffer.from('demo_api_key_hash_' + Date.now().toString().slice(-12)).slice(0, 32);
    Buffer.alloc(32).fill(testHash).copy(instructionData, offset, 0, 32);
    offset += 32;
    
    // zk_commit (32 bytes)
    Buffer.alloc(32, 0x02).copy(instructionData, offset);
    offset += 32;
    
    // mpc_hash (32 bytes)
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
    
    // Create instruction
    const storeKeyIx = new TransactionInstruction({
        keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: vaultPDA, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId,
        data: instructionData,
    });
    
    // Create transaction
    const transaction = new Transaction().add(storeKeyIx);
    
    console.log('📤 Sending transaction to devnet...');
    console.log('');
    
    try {
        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [wallet],
            { 
                commitment: 'confirmed',
                preflightCommitment: 'confirmed'
            }
        );
        
        console.log('');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('✅ SUCCESS! Transaction confirmed on devnet!');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('');
        console.log('🔑 Transaction Signature:');
        console.log('   ' + signature);
        console.log('');
        console.log('───────────────────────────────────────────────────────────');
        console.log('🔍 VIEW YOUR TRANSACTION ON EXPLORERS');
        console.log('───────────────────────────────────────────────────────────');
        console.log('');
        console.log('📍 Transaction on Solana Explorer:');
        console.log(`   https://explorer.solana.com/tx/${signature}?cluster=devnet`);
        console.log('');
        console.log('📍 Transaction on Solscan:');
        console.log(`   https://solscan.io/tx/${signature}?cluster=devnet`);
        console.log('');
        console.log('───────────────────────────────────────────────────────────');
        console.log('🔍 VIEW YOUR PROGRAM');
        console.log('───────────────────────────────────────────────────────────');
        console.log('');
        console.log('📍 Program on Solana Explorer:');
        console.log(`   https://explorer.solana.com/address/${programId.toBase58()}?cluster=devnet`);
        console.log('');
        console.log('📍 Program on Solscan (see all transactions):');
        console.log(`   https://solscan.io/account/${programId.toBase58()}?cluster=devnet`);
        console.log('');
        console.log('───────────────────────────────────────────────────────────');
        console.log('🔍 VIEW YOUR VAULT ACCOUNT');
        console.log('───────────────────────────────────────────────────────────');
        console.log('');
        console.log('📍 Vault on Solana Explorer:');
        console.log(`   https://explorer.solana.com/address/${vaultPDA.toBase58()}?cluster=devnet`);
        console.log('');
        console.log('📍 Vault on Solscan:');
        console.log(`   https://solscan.io/account/${vaultPDA.toBase58()}?cluster=devnet`);
        console.log('');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('');
        
        // Verify vault was created
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for confirmation
        const vaultAccountAfter = await connection.getAccountInfo(vaultPDA);
        if (vaultAccountAfter) {
            console.log('✅ Vault account verified:');
            console.log('   Size:', vaultAccountAfter.data.length, 'bytes (expected: 288)');
            console.log('   Owner:', vaultAccountAfter.owner.toBase58());
            console.log('');
            
            // Check discriminator
            const discriminator = vaultAccountAfter.data.slice(0, 8);
            const expectedDisc = Buffer.from('keyshld\0');
            if (discriminator.equals(expectedDisc)) {
                console.log('✅ Discriminator correct: "keyshld"');
            } else {
                console.log('⚠️  Discriminator:', discriminator.toString());
            }
        }
        
    } catch (error) {
        console.error('');
        console.error('❌ Transaction failed!');
        console.error('───────────────────────────────────────────────────────────');
        console.error('Error:', error.message);
        
        if (error.logs) {
            console.error('');
            console.error('Program Logs:');
            error.logs.forEach(log => console.error('  ', log));
        }
        
        console.error('');
        console.error('💡 Troubleshooting:');
        console.error('   1. Make sure program is deployed: cargo build-sbf && solana program deploy ...');
        console.error('   2. Check your balance: solana balance --url devnet');
        console.error('   3. Try requesting airdrop: solana airdrop 2 --url devnet');
        console.error('');
        
        process.exit(1);
    }
}

main().catch(err => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
});
