#!/usr/bin/env node

/**
 * Query Solana Devnet for Stored Vault Records
 * 
 * Query stored Vault records on Solana devnet
 */

import * as web3 from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const DEVNET_RPC = 'https://api.devnet.solana.com';
const PROGRAM_ID = new web3.PublicKey('11111111111111111111111111111111'); // Placeholder

// Demo wallet from our previous storage
const WALLET_PUBKEY = new web3.PublicKey('9VRxrF2w7NSMsxVW3xP1LiV6pkksZ5kavRaxBuKqH5fs');
const VAULT_ID = '467af138e4a858fe68368e123ff56733';

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║        🔍 Solana Devnet Vault Query Tool                  ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Step 1: Connect to Devnet
console.log('📡 Step 1: Connecting to Solana Devnet...');
const connection = new web3.Connection(DEVNET_RPC, 'confirmed');

console.log(`   RPC: ${DEVNET_RPC}`);
console.log(`   Wallet: ${WALLET_PUBKEY.toBase58()}`);
console.log(`   Vault ID: ${VAULT_ID}\n`);

// Step 2: Check wallet balance (shows devnet connectivity)
console.log('💰 Step 2: Check wallet balance...');
try {
  const balance = await connection.getBalance(WALLET_PUBKEY);
  console.log(`   ✅ Wallet balance: ${balance} lamports (${(balance / 1e9).toFixed(4)} SOL)`);
  if (balance === 0) {
    console.log('   ⚠️  Balance is 0 — get devnet SOL from faucet: https://faucet.solana.com/\n');
  } else {
    console.log('   ✅ Connected to devnet!\n');
  }
} catch (error) {
  console.error(`   ❌ Connection failed: ${error.message}`);
  process.exit(1);
}

// Step 3: Look for vault accounts
console.log('🔎 Step 3: Searching on-chain Vault records...\n');

console.log('   📋 Query methods:\n');
console.log('   Method A: Query all accounts by wallet');
console.log('   ────────────────────────────────');

try {
  const accounts = await connection.getProgramAccounts(
    PROGRAM_ID,
    {
      filters: [
        { memcmp: { offset: 8, bytes: WALLET_PUBKEY.toBase58() } }
      ]
    }
  );
  
  console.log(`   Found ${accounts.length} accounts\n`);
  
  if (accounts.length === 0) {
    console.log('   ℹ️  No accounts found for this wallet (may not be deployed to main program yet)\n');
  }
} catch (error) {
  console.log(`   ℹ️  Account query: ${error.message}\n`);
}

console.log('   Method B: Query via wallet transaction history');
console.log('   ────────────────────────────────\n');

try {
  const signatures = await connection.getSignaturesForAddress(WALLET_PUBKEY, { limit: 10 });
  
  console.log(`   💾 Recent transactions (up to 10):\n`);
  
  if (signatures.length === 0) {
    console.log('   ℹ️  No transactions yet\n');
  } else {
    for (let i = 0; i < signatures.length; i++) {
      const sig = signatures[i];
      console.log(`   ${i + 1}. ${sig.signature} (${sig.slot})`);
      console.log(`      Status: ${sig.err ? '❌ Failed' : '✅ Success'}`);
    }
    console.log('');
  }
} catch (error) {
  console.log(`   ℹ️  History query unavailable: ${error.message}\n`);
}

// Step 4: Show local vault file
console.log('📁 Step 4: Check local Vault file...');
console.log('   ────────────────────────────────\n');

const localVaultPath = path.join(
  process.cwd(),
  'scripts',
  '.keyshield-demo',
  `vault-${VAULT_ID}.json`
);

if (fs.existsSync(localVaultPath)) {
  console.log(`   ✅ Found local Vault file: ${localVaultPath}\n`);
  
  const vaultData = JSON.parse(fs.readFileSync(localVaultPath, 'utf-8'));
  
  console.log('   📋 Vault info：');
  console.log(`   ├─ Owner: ${vaultData.owner}`);
  console.log(`   ├─ Created: ${new Date(vaultData.createdAt * 1000).toISOString()}`);
  console.log(`   ├─ Encrypted: ${vaultData.keyMetadata.encrypted}`);
  console.log(`   ├─ Encryption: ${vaultData.keyMetadata.encryptionMethod}`);
  console.log(`   ├─ Ciphertext: ${vaultData.encryptedData.ciphertext.substring(0, 32)}...`);
  console.log(`   └─ Audit Log: ${vaultData.auditLog.length} entries\n`);
} else {
  console.log(`   ❌ Local file not found: ${localVaultPath}\n`);
}

// Step 5: Deployment guide
console.log('📦 Step 5: Steps to deploy to Devnet\n');

console.log(`   1️⃣  Build Solana program:
      cd programs/keyshield
      cargo build-sbf
   
   2️⃣  Deploy to devnet:
      solana program deploy target/sbpf-solana-solana/release/keyshield.so --url devnet
   
   3️⃣  Get program ID:
      solana address -k target/deploy/keyshield-keypair.json
   
   4️⃣  Update program ID:
      Edit the PROGRAM_ID variable in this script
   
   5️⃣  Store Vault:
      node scripts/demo-on-chain-storage.mjs --network devnet
   
   6️⃣  Query Vault:
      node scripts/query-devnet-vault.mjs
\n`);

// Step 6: Status summary
console.log('════════════════════════════════════════════════════════════\n');
console.log('📊 Current status:\n');

const summary = {
  network: 'devnet',
  wallet: WALLET_PUBKEY.toBase58(),
  vaultId: VAULT_ID,
  localStorageExists: fs.existsSync(localVaultPath),
  rpcConnected: true,
  timestamp: new Date().toISOString(),
  nextSteps: [
    'Get devnet SOL from faucet',
    'Deploy KeyShield program to devnet',
    'Execute on-chain storage transaction',
    'Query and verify stored data'
  ]
};

console.log(`  ✅ RPC connection: ok`);
console.log(`  ✅ Local file: ${summary.localStorageExists ? 'created' : 'not found'}`);
console.log(`  ⏳ On-chain deploy: pending`);
console.log(`  📍 Network: ${summary.network}`);
console.log(`  👤 Wallet: ${summary.wallet}`);
console.log(`\n📋 Next steps:\n`);

summary.nextSteps.forEach((step, i) => {
  console.log(`  ${i + 1}. ${step}`);
});

console.log('\n✨ Done!\n');

// Write summary to file
const summaryPath = path.join(process.cwd(), 'scripts', '.keyshield-demo', 'devnet-query-summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
console.log(`📄 Query result saved: ${summaryPath}\n`);
