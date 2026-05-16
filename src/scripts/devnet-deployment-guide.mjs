#!/usr/bin/env node

/**
 * Devnet Vault Query & Deployment Guide
 * Complete guide to querying and deploying Vault on Solana Devnet
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║    🚀 Solana Devnet Deployment & Query Guide     ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Constants
const WALLET_PUBKEY = '9VRxrF2w7NSMsxVW3xP1LiV6pkksZ5kavRaxBuKqH5fs';
const VAULT_ID = '467af138e4a858fe68368e123ff56733';
const DEVNET_RPC = 'https://api.devnet.solana.com';
const PROGRAM_ID = 'TokenkegQfeZyiNwAJsyFbPVwwQQfjonMarwxa2oSFS'; // SPL Token program for reference

// Check local vault
console.log('📁 Step 1: Check local Vault file\n');
console.log('   ────────────────────────────────\n');

const localVaultPath = path.join(__dirname, '.keyshield-demo', `vault-${VAULT_ID}.json`);
let vaultData = null;
let vaultExists = false;

if (fs.existsSync(localVaultPath)) {
  vaultExists = true;
  vaultData = JSON.parse(fs.readFileSync(localVaultPath, 'utf-8'));
  
  console.log(`   ✅ Found Vault: ${localVaultPath}\n`);
  console.log(`   📋 Vault details:`);
  console.log(`   ├─ Owner:       ${vaultData.owner}`);
  console.log(`   ├─ Vault ID:    ${vaultData.keyMetadata.id}`);
  console.log(`   ├─ Created:     ${new Date(vaultData.createdAt * 1000).toISOString()}`);
  console.log(`   ├─ Encrypted:   ${vaultData.keyMetadata.encrypted ? '✅ Yes' : '❌ No'}`);
  console.log(`   ├─ Method:      ${vaultData.keyMetadata.encryptionMethod}`);
  console.log(`   ├─ Ciphertext:  ${vaultData.encryptedData.ciphertext.substring(0, 32)}...`);
  console.log(`   ├─ Access:      ${vaultData.accessControl.isPublic ? 'Public' : 'Private'}`);
  console.log(`   └─ Audit Log:   ${vaultData.auditLog.length} entries\n`);
  
  // Show audit log
  console.log('   📊 Audit log:');
  vaultData.auditLog.forEach((entry, i) => {
    console.log(`      ${i + 1}. ${entry.action} @ ${new Date(entry.timestamp * 1000).toISOString()}`);
    console.log(`         Actor: ${entry.actor.substring(0, 8)}...`);
  });
  console.log('');
} else {
  console.log(`   ❌ Vault file not found\n`);
  console.log(`   Expected path: ${localVaultPath}\n`);
}

// Devnet status
console.log('🌐 Step 2: Devnet status\n');
console.log('   ────────────────────────────────\n');

console.log(`   RPC endpoint: ${DEVNET_RPC}`);
console.log(`   Faucet:   https://faucet.solana.com/\n`);

console.log(`   💡 Current wallet:    ${WALLET_PUBKEY}`);
console.log(`   📍 Current Vault:   ${VAULT_ID}\n`);

// Deployment steps
console.log('📦 Step 3: Full steps to deploy to Devnet\n');
console.log('   ────────────────────────────────\n');

const steps = [
  {
    title: 'Prerequisites',
    commands: [
      '# Install Solana CLI (if not installed)',
      'curl --proto "=https" --tlsv1.2 -sSf https://sh.solana.rs | sh',
      '# Set config to devnet',
      'solana config set --url devnet'
    ]
  },
  {
    title: 'Configure wallet',
    commands: [
      '# Create or import wallet',
      'solana-keygen new  # create new wallet',
      '# Or import existing wallet',
      'solana-keygen recover  # restore from seed',
      '# Check balance',
      'solana balance'
    ]
  },
  {
    title: 'Get Devnet SOL',
    commands: [
      '# Method 1: via web Faucet',
      'https://faucet.solana.com/',
      '',
      '# Method 2: via CLI',
      'solana airdrop 2 $(solana-keygen pubkey ~/.config/solana/id.json)',
      '# Wait 15-30 s',
      'solana balance $(solana-keygen pubkey ~/.config/solana/id.json)'
    ]
  },
  {
    title: 'Build Solana program',
    commands: [
      'cd programs/keyshield',
      '# Check lib type in Cargo.toml',
      'cargo build-sbf  # or cargo build-sbf --release',
      '# output: target/sbpf-solana-solana/release/keyshield.so'
    ]
  },
  {
    title: 'Deploy program to Devnet',
    commands: [
      'solana program deploy target/sbpf-solana-solana/release/keyshield.so --url devnet',
      '# Get the deployed program ID',
      'solana program show --url devnet $(solana-keygen pubkey target/deploy/keyshield-keypair.json)'
    ]
  },
  {
    title: 'Update Vault storage script',
    commands: [
      '# Edit scripts/demo-on-chain-storage.mjs',
      '# Replace PROGRAM_ID with the newly deployed program ID',
      'export PROGRAM_ID="<your-program-id-here>"'
    ]
  },
  {
    title: 'Execute on-chain storage transaction',
    commands: [
      'node scripts/demo-on-chain-storage.mjs --network devnet --keypair ~/.config/solana/id.json',
      '# Wait for transaction confirmation (usually 10-30 s)'
    ]
  },
  {
    title: 'Query on-chain data',
    commands: [
      '# View all accounts',
      'solana account <vault-account-address> --url devnet',
      '',
      '# View transaction history',
      'solana transaction-count --url devnet',
      '',
      '# Use block explorer',
      'https://explorer.solana.com/?cluster=devnet'
    ]
  }
];

steps.forEach((step, idx) => {
  console.log(`   ${idx + 1}️⃣  ${step.title}`);
  console.log('');
  step.commands.forEach(cmd => {
    if (cmd.startsWith('http')) {
      console.log(`       🌐 ${cmd}`);
    } else if (cmd === '') {
      console.log('');
    } else {
      console.log(`       $ ${cmd}`);
    }
  });
  console.log('');
});

// Query examples
console.log('🔍 Step 4: Ways to query Vault data\n');
console.log('   ────────────────────────────────\n');

const queries = [
  {
    method: 'Method A: via Solana Explorer',
    description: 'Easiest method, graphical interface',
    steps: [
      '1. Open: https://explorer.solana.com/?cluster=devnet',
      '2. Search wallet address: ' + WALLET_PUBKEY,
      '3. View Tokens & NFTs',
      '4. Find the KeyShield Vault account'
    ]
  },
  {
    method: 'Method B: via Solana CLI',
    description: 'Command-line query',
    steps: [
      '$ solana account <vault-address> --url devnet',
      '$ solana account --following <owner-address> --url devnet',
      '# View detailed info',
      '$ solana account <address> --output json --url devnet | jq'
    ]
  },
  {
    method: 'Method C: via RPC call',
    description: 'Programmatic query',
    steps: [
      'curl https://api.devnet.solana.com -X POST -H "Content-Type: application/json" \\',
      '  -d \'{"jsonrpc":"2.0","id":1,"method":"getAccountInfo",...}\''
    ]
  }
];

queries.forEach(q => {
  console.log(`   ${q.method}`);
  console.log(`   Description: ${q.description}\n`);
  q.steps.forEach(step => {
    console.log(`      ${step}`);
  });
  console.log('');
});

// Security considerations
console.log('🔐 Step 5: Security notes\n');
console.log('   ────────────────────────────────\n');

const security = [
  '✅ API keys stored encrypted — no plaintext on-chain',
  '✅ Access control: only owner can decrypt',
  '✅ Audit log: all operations recorded',
  '✅ Timestamps: prevent replay attacks',
  '⚠️  Devnet is a public testnet — do not use real data',
  '⚠️  Audit code before mainnet deployment',
  '⚠️  Keep your wallet private key safe'
];

security.forEach(item => {
  console.log(`   ${item}`);
});

console.log('\n');

// Summary
console.log('📊 Step 6: Status summary\n');
console.log('   ────────────────────────────────\n');

const summary = {
  localVault: vaultExists ? '✅ Present' : '❌ Not present',
  encryption: vaultExists ? (vaultData.keyMetadata.encrypted ? '✅ Encrypted' : '❌ Not encrypted') : 'N/A',
  devnetDeployed: '⏳ Pending deploy',
  devnetVerified: '❌ Not verified',
  timeline: new Date().toISOString()
};

console.log(`   Local storage:     ${summary.localVault}`);
console.log(`   Encryption:     ${summary.encryption}`);
console.log(`   Devnet deploy:  ${summary.devnetDeployed}`);
console.log(`   On-chain verification:     ${summary.devnetVerified}`);
console.log(`   Timestamp:       ${summary.timeline}\n`);

// Next steps
console.log('🚀 Next steps\n');
console.log('   ────────────────────────────────\n');

const nextSteps = [
  '1. Get devnet SOL from Faucet',
  '2. Build and deploy KeyShield program',
  '3. Get program ID and update script',
  '4. Execute on-chain storage transaction',
  '5. Verify stored data via Explorer',
  '6. Test on-chain retrieval and decryption'
];

nextSteps.forEach(step => {
  console.log(`   ${step}`);
});

console.log('\n');

// Save summary
const summaryFile = path.join(__dirname, '.keyshield-demo', 'devnet-deployment-summary.json');
fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
console.log('💾 Deployment guide saved\n');

// Resources
console.log('📚 Useful links\n');
console.log('   ────────────────────────────────\n');

const resources = [
  '📖 Solana Developer Docs:       https://docs.solana.com/',
  '🔗 Solana Explorer (Devnet):    https://explorer.solana.com/?cluster=devnet',
  '💧 SOL Faucet:                  https://faucet.solana.com/',
  '🛠️  Solana CLI Reference:        https://docs.solana.com/cli',
  '📚 Rust program examples:               https://github.com/solana-labs/example-helloworld',
  '🔐 Lit Protocol Docs:           https://litprotocol.com/docs',
  '🌐 Web3.js docs:                https://solana-labs.github.io/solana-web3.js/'
];

resources.forEach(resource => {
  console.log(`   ${resource}`);
});

console.log('\n✨ Deployment prep complete!\n');
