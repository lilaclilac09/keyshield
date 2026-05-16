#!/usr/bin/env node

/**
 * Localnet quick-start script
 * Run Solana validator locally for testing
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║        🚀 Solana Localnet Quick-Start Guide                ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

console.log('📌 What is localnet?\n');
console.log('   A full Solana validator running on your machine for local development and testing.\n');
console.log('   ✅ No network connection needed');
console.log('   ✅ Ready immediately (no devnet network issues)');
console.log('   ✅ Free (no transaction fees)');
console.log('   ✅ Fully repeatable testing\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('🔧 Ways to start Localnet\n');

console.log('Option A: Start in another terminal (recommended)\n');
console.log('   Terminal 1 (this window):')
console.log('   $ solana-test-validator\n');
console.log('   Wait for output:\n');
console.log('   ✓ Found 35 config file entry');
console.log('   ✓ Ready for RPC and WebSocket connections\n');
console.log('   Then in Terminal 2, run the deploy:\n');

console.log('Option B: Auto-start script\n');
console.log('   $ cat > start-localnet.sh << \'END\'\n');
console.log('   #!/bin/bash\n');
console.log('   solana-test-validator --quiet &\n');
console.log('   VALIDATOR_PID=$!\n');
console.log('   sleep 5\n');
console.log('   echo "Localnet is running on localhost:8899"\n');
console.log('   wait $VALIDATOR_PID\n');
console.log('   END\n');
console.log('   chmod +x start-localnet.sh\n');
console.log('   ./start-localnet.sh\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('🎯 Full steps to deploy on Localnet\n');

const steps = [
  {
    step: 1,
    title: 'Start localhost validator',
    code: '$ solana-test-validator',
    wait: '⏳ Wait for "Ready for RPC and WebSocket connections"'
  },
  {
    step: 2,
    title: 'Open new terminal, set config to localhost',
    code: '$ solana config set --url localhost',
    wait: '✅ Confirm output: RPC URL: http://localhost:8899'
  },
  {
    step: 3,
    title: 'Check available SOL',
    code: '$ solana balance',
    wait: '✅ Should show a lot of SOL (new wallet defaults to 999999999 SOL)'
  },
  {
    step: 4,
    title: 'Deploy program',
    code: '$ cd /Users/aileen/Downloads/privacy_hack/keyshield\n  $ solana program deploy target/sbpf-solana-solana/release/keyshield.so --url localhost',
    output: 'Program Id: xxxXXXxxxXXXxxxXXXxxxXXXxxxXXXxxxXXXxxxx'
  },
  {
    step: 5,
    title: 'Copy Program ID and update script',
    code: '# Edit scripts/demo-on-chain-storage.mjs\n  const PROGRAM_ID = new PublicKey(\'<paste ID here>\');\n  const NETWORK = \'localhost\';',
    wait: ''
  },
  {
    step: 6,
    title: 'Store your Vault on localhost',
    code: '$ node scripts/demo-on-chain-storage.mjs --network localhost',
    output: '✅ Vault stored on localhost!'
  }
];

steps.forEach(s => {
  console.log(`\n${s.step}️⃣  ${s.title}\n`);
  console.log(`   $ ${s.code}\n`);
  if (s.wait) console.log(`   ⏳ ${s.wait}\n`);
  if (s.output) console.log(`   📋 Output will show:\n   ${s.output}\n`);
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('🎉 After deployment\n');
console.log('   Your API Key Vault is now deployed to the local blockchain!\n');
console.log('   Benefits:\n');
console.log('   ✅ Fully offline, no network dependency');
console.log('   ✅ Unlimited testing');
console.log('   ✅ No transaction fees');
console.log('   ✅ Full development control\n');

console.log('🔄 Migrating from Localnet to Devnet\n');
console.log('   When ready, just:\n');
console.log('   1. solana config set --url devnet');
console.log('   2. Update script config');
console.log('   3. Redeploy (same process)\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('📝 Quick reference\n');

const commands = [
  { cmd: 'solana-test-validator', desc: 'Start local validator' },
  { cmd: 'solana config set --url localhost', desc: 'Set config to localhost' },
  { cmd: 'solana balance', desc: 'Check balance' },
  { cmd: 'solana program deploy <.so-file>', desc: 'Deploy program' },
  { cmd: 'solana program show <PROGRAM_ID>', desc: 'Show program info' },
  { cmd: 'solana account <ADDRESS>', desc: 'View account' }
];

commands.forEach(c => {
  console.log(`   $ ${c.cmd}`);
  console.log(`      → ${c.desc}\n`);
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('🚀 Get started now\n');
console.log('   Open a new terminal and run:\n');
console.log('   $ solana-test-validator\n');
console.log('   ...wait for validator to start...\n');
console.log('   Then run the deploy command in another terminal!\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Create start script
const startLocalnetScript = `#!/bin/bash

echo "🚀 Starting Solana Localnet..."
echo ""
echo "Wait for: 'Ready for RPC and WebSocket connections'"
echo ""

solana-test-validator

`;

const startScriptPath = path.join(__dirname, 'start-localnet.sh');
fs.writeFileSync(startScriptPath, startLocalnetScript);
fs.chmodSync(startScriptPath, 0o755);

console.log(`✅ Created start script: start-localnet.sh\n`);
console.log(`   Run: bash scripts/start-localnet.sh\n`);

// Create deploy script
const deployLocalhostScript = `#!/bin/bash

echo "🚀 Deploying to Localnet..."
echo ""

# Set config to localhost
solana config set --url localhost

# Check balance
echo ""
echo "💰 Checking balance..."
solana balance

# Deploy program
echo ""
echo "📦 Deploying program..."
solana program deploy target/sbpf-solana-solana/release/keyshield.so --url localhost

echo ""
echo "✅ Deploy complete!"
echo ""
echo "📋 Now edit scripts/demo-on-chain-storage.mjs"
echo "   and replace PROGRAM_ID and NETWORK config"
echo ""
echo "Then run:"
echo "  node scripts/demo-on-chain-storage.mjs --network localhost"

`;

const deployScriptPath = path.join(__dirname, 'deploy-localhost.sh');
fs.writeFileSync(deployScriptPath, deployLocalhostScript);
fs.chmodSync(deployScriptPath, 0o755);

console.log(`✅ Created deploy script: deploy-localhost.sh\n`);
console.log(`   Run: bash scripts/deploy-localhost.sh\n`);

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('💡 Tips\n');
console.log('   Localnet is great for development and testing');
console.log('   Data is lost when the validator restarts');
console.log('   Use Devnet/Testnet/Mainnet for production\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
