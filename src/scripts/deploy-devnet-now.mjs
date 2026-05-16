#!/usr/bin/env node

/**
 * One-click deploy script
 * Auto-deploy KeyShield program to Solana Devnet
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

console.log('\n🚀 KeyShield Devnet Deploy Script\n');
console.log('════════════════════════════════════════════════════════════\n');

// Deploy command
const deployCommand = 'solana';
const deployArgs = [
  'program', 
  'deploy', 
  'target/sbpf-solana-solana/release/keyshield.so',
  '--url', 'devnet'
];

console.log('📋 Deploy command:');
console.log(`   $ ${deployCommand} ${deployArgs.join(' ')}\n`);

console.log('⚠️  Notes:');
console.log('   • Deployment may take 30-60 seconds');
console.log('   • Network issues may cause failure (retry later)');
console.log('   • Program ID will be shown after deploy\n');

console.log('════════════════════════════════════════════════════════════\n');
console.log('⏳ Starting deployment...\n');

// Record start time
const startTime = Date.now();

// Spawn deployment process
const deploy = spawn(deployCommand, deployArgs, {
  cwd: process.cwd(),
  stdio: 'inherit'
});

// Handle output
deploy.on('close', (code) => {
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n');
  console.log('════════════════════════════════════════════════════════════');
  
  if (code === 0) {
    console.log('\n✅ Deploy successful!\n');
    console.log('📌 Next steps:');
    console.log('   1. Copy the Program ID shown above');
    console.log('   2. View on Explorer:')
    console.log('      https://explorer.solana.com/?cluster=devnet');
    console.log('   3. Search for Program ID or your wallet address\n');
    console.log('🎯 Next: deploy Vault on-chain:');
    console.log('   $ node scripts/demo-on-chain-storage.mjs --network devnet\n');
  } else {
    console.log('\n❌ Deploy failed (code: ' + code + ')\n');
    console.log('🔧 Troubleshooting:');
    console.log('   1. Check network: solana cluster-version --url devnet');
    console.log('   2. Check balance: solana balance');
    console.log('   3. Wait 1-2 minutes and retry\n');
  }
  
  console.log(`⏱️  Duration: ${duration} s\n`);
  console.log('════════════════════════════════════════════════════════════\n');
  
  process.exit(code);
});

// Error handling
deploy.on('error', (error) => {
  console.error('\n❌ Error: ', error.message, '\n');
  process.exit(1);
});
