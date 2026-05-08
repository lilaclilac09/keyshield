#!/usr/bin/env node

/**
 * Query Solana Devnet for Stored Vault Records
 * 
 * 在 Solana devnet 上查询存储的 Vault 记录
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
console.log('║        🔍 Solana Devnet Vault Query 查询工具              ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Step 1: Connect to Devnet
console.log('📡 Step 1: 连接到 Solana Devnet...');
const connection = new web3.Connection(DEVNET_RPC, 'confirmed');

console.log(`   RPC: ${DEVNET_RPC}`);
console.log(`   Wallet: ${WALLET_PUBKEY.toBase58()}`);
console.log(`   Vault ID: ${VAULT_ID}\n`);

// Step 2: Check wallet balance (shows devnet connectivity)
console.log('💰 Step 2: 检查钱包余额...');
try {
  const balance = await connection.getBalance(WALLET_PUBKEY);
  console.log(`   ✅ 钱包余额: ${balance} lamports (${(balance / 1e9).toFixed(4)} SOL)`);
  if (balance === 0) {
    console.log('   ⚠️  余额为 0，请从 faucet 获取 devnet SOL: https://faucet.solana.com/\n');
  } else {
    console.log('   ✅ 已连接到 devnet！\n');
  }
} catch (error) {
  console.error(`   ❌ 连接失败: ${error.message}`);
  process.exit(1);
}

// Step 3: Look for vault accounts
console.log('🔎 Step 3: 搜索链上 Vault 记录...\n');

console.log('   📋 查询方法：\n');
console.log('   方法 A: 通过钱包查询所有账户');
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
  
  console.log(`   找到 ${accounts.length} 个账户\n`);
  
  if (accounts.length === 0) {
    console.log('   ℹ️  未找到与该钱包关联的账户（可能还未部署到主程序）\n');
  }
} catch (error) {
  console.log(`   ℹ️  账户查询: ${error.message}\n`);
}

console.log('   方法 B: 通过钱包历史记录查询');
console.log('   ────────────────────────────────\n');

try {
  const signatures = await connection.getSignaturesForAddress(WALLET_PUBKEY, { limit: 10 });
  
  console.log(`   💾 最近的交易记录 (最多10条):\n`);
  
  if (signatures.length === 0) {
    console.log('   ℹ️  暂无交易记录\n');
  } else {
    for (let i = 0; i < signatures.length; i++) {
      const sig = signatures[i];
      console.log(`   ${i + 1}. ${sig.signature} (${sig.slot})`);
      console.log(`      状态: ${sig.err ? '❌ 失败' : '✅ 成功'}`);
    }
    console.log('');
  }
} catch (error) {
  console.log(`   ℹ️  历史查询暂不可用: ${error.message}\n`);
}

// Step 4: Show local vault file
console.log('📁 Step 4: 检查本地 Vault 文件...');
console.log('   ────────────────────────────────\n');

const localVaultPath = path.join(
  process.cwd(),
  'scripts',
  '.keyshield-demo',
  `vault-${VAULT_ID}.json`
);

if (fs.existsSync(localVaultPath)) {
  console.log(`   ✅ 找到本地 Vault 文件: ${localVaultPath}\n`);
  
  const vaultData = JSON.parse(fs.readFileSync(localVaultPath, 'utf-8'));
  
  console.log('   📋 Vault 信息：');
  console.log(`   ├─ Owner: ${vaultData.owner}`);
  console.log(`   ├─ Created: ${new Date(vaultData.createdAt * 1000).toISOString()}`);
  console.log(`   ├─ Encrypted: ${vaultData.keyMetadata.encrypted}`);
  console.log(`   ├─ Encryption: ${vaultData.keyMetadata.encryptionMethod}`);
  console.log(`   ├─ Ciphertext: ${vaultData.encryptedData.ciphertext.substring(0, 32)}...`);
  console.log(`   └─ Audit Log: ${vaultData.auditLog.length} 条记录\n`);
} else {
  console.log(`   ❌ 未找到本地文件: ${localVaultPath}\n`);
}

// Step 5: Deployment guide
console.log('📦 Step 5: 部署到 Devnet 的步骤\n');

console.log(`   1️⃣  构建 Solana 程序：
      cd programs/keyshield
      cargo build-sbf
   
   2️⃣  部署到 devnet：
      solana program deploy target/sbpf-solana-solana/release/keyshield.so --url devnet
   
   3️⃣  获取程序 ID：
      solana address -k target/deploy/keyshield-keypair.json
   
   4️⃣  更新程序 ID：
      编辑此脚本的 PROGRAM_ID 变量
   
   5️⃣  存储 Vault：
      node scripts/demo-on-chain-storage.mjs --network devnet
   
   6️⃣  查询 Vault：
      node scripts/query-devnet-vault.mjs
\n`);

// Step 6: Status summary
console.log('════════════════════════════════════════════════════════════\n');
console.log('📊 当前状态：\n');

const summary = {
  network: 'devnet',
  wallet: WALLET_PUBKEY.toBase58(),
  vaultId: VAULT_ID,
  localStorageExists: fs.existsSync(localVaultPath),
  rpcConnected: true,
  timestamp: new Date().toISOString(),
  nextSteps: [
    '从 faucet 获取 devnet SOL',
    '部署 KeyShield 程序到 devnet',
    '执行链上存储交易',
    '查询并验证存储的数据'
  ]
};

console.log(`  ✅ RPC 连接: 成功`);
console.log(`  ✅ 本地文件: ${summary.localStorageExists ? '已创建' : '不存在'}`);
console.log(`  ⏳ 链上部署: 待进行`);
console.log(`  📍 网络: ${summary.network}`);
console.log(`  👤 钱包: ${summary.wallet}`);
console.log(`\n📋 下一步:\n`);

summary.nextSteps.forEach((step, i) => {
  console.log(`  ${i + 1}. ${step}`);
});

console.log('\n✨ 完成！\n');

// Write summary to file
const summaryPath = path.join(process.cwd(), 'scripts', '.keyshield-demo', 'devnet-query-summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
console.log(`📄 查询结果已保存: ${summaryPath}\n`);
