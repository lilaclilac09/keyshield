#!/usr/bin/env node

/**
 * Devnet Vault Query & Deployment Guide
 * 在 Solana Devnet 上查询和部署 Vault 的完整指南
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║    🚀 Solana Devnet Deployment & Query 部署和查询指南     ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Constants
const WALLET_PUBKEY = '9VRxrF2w7NSMsxVW3xP1LiV6pkksZ5kavRaxBuKqH5fs';
const VAULT_ID = '467af138e4a858fe68368e123ff56733';
const DEVNET_RPC = 'https://api.devnet.solana.com';
const PROGRAM_ID = 'TokenkegQfeZyiNwAJsyFbPVwwQQfjonMarwxa2oSFS'; // SPL Token program for reference

// Check local vault
console.log('📁 Step 1: 检查本地 Vault 文件\n');
console.log('   ────────────────────────────────\n');

const localVaultPath = path.join(__dirname, '.keyshield-demo', `vault-${VAULT_ID}.json`);
let vaultData = null;
let vaultExists = false;

if (fs.existsSync(localVaultPath)) {
  vaultExists = true;
  vaultData = JSON.parse(fs.readFileSync(localVaultPath, 'utf-8'));
  
  console.log(`   ✅ 已找到 Vault: ${localVaultPath}\n`);
  console.log(`   📋 Vault 详情：`);
  console.log(`   ├─ Owner:       ${vaultData.owner}`);
  console.log(`   ├─ Vault ID:    ${vaultData.keyMetadata.id}`);
  console.log(`   ├─ Created:     ${new Date(vaultData.createdAt * 1000).toISOString()}`);
  console.log(`   ├─ Encrypted:   ${vaultData.keyMetadata.encrypted ? '✅ 是' : '❌ 否'}`);
  console.log(`   ├─ Method:      ${vaultData.keyMetadata.encryptionMethod}`);
  console.log(`   ├─ Ciphertext:  ${vaultData.encryptedData.ciphertext.substring(0, 32)}...`);
  console.log(`   ├─ Access:      ${vaultData.accessControl.isPublic ? 'Public' : 'Private'}`);
  console.log(`   └─ Audit Log:   ${vaultData.auditLog.length} 条记录\n`);
  
  // Show audit log
  console.log('   📊 审计日志：');
  vaultData.auditLog.forEach((entry, i) => {
    console.log(`      ${i + 1}. ${entry.action} @ ${new Date(entry.timestamp * 1000).toISOString()}`);
    console.log(`         Actor: ${entry.actor.substring(0, 8)}...`);
  });
  console.log('');
} else {
  console.log(`   ❌ 未找到 Vault 文件\n`);
  console.log(`   预期路径: ${localVaultPath}\n`);
}

// Devnet status
console.log('🌐 Step 2: Devnet 状态\n');
console.log('   ────────────────────────────────\n');

console.log(`   RPC 端点: ${DEVNET_RPC}`);
console.log(`   Faucet:   https://faucet.solana.com/\n`);

console.log(`   💡 当前钱包:    ${WALLET_PUBKEY}`);
console.log(`   📍 当前Vault:   ${VAULT_ID}\n`);

// Deployment steps
console.log('📦 Step 3: 部署到 Devnet 的完整步骤\n');
console.log('   ────────────────────────────────\n');

const steps = [
  {
    title: '准备工作',
    commands: [
      '# 安装 Solana CLI (如果还没安装)',
      'curl --proto "=https" --tlsv1.2 -sSf https://sh.solana.rs | sh',
      '# 配置为 devnet',
      'solana config set --url devnet'
    ]
  },
  {
    title: '配置钱包',
    commands: [
      '# 创建或导入钱包',
      'solana-keygen new  # 创建新钱包',
      '# 或导入现有钱包',
      'solana-keygen recover  # 从种子恢复',
      '# 检查余额',
      'solana balance'
    ]
  },
  {
    title: '获取 Devnet SOL',
    commands: [
      '# 方法 1: 通过网页 Faucet',
      'https://faucet.solana.com/',
      '',
      '# 方法 2: 通过 CLI',
      'solana airdrop 2 $(solana-keygen pubkey ~/.config/solana/id.json)',
      '# 等待 15-30 秒',
      'solana balance $(solana-keygen pubkey ~/.config/solana/id.json)'
    ]
  },
  {
    title: '构建 Solana 程序',
    commands: [
      'cd programs/keyshield',
      '# 检查 Cargo.toml 中的 lib 类型',
      'cargo build-sbf  # 或 cargo build-sbf --release',
      '# 输出: target/sbpf-solana-solana/release/keyshield.so'
    ]
  },
  {
    title: '部署程序到 Devnet',
    commands: [
      'solana program deploy target/sbpf-solana-solana/release/keyshield.so --url devnet',
      '# 获取部署的程序 ID',
      'solana program show --url devnet $(solana-keygen pubkey target/deploy/keyshield-keypair.json)'
    ]
  },
  {
    title: '更新 Vault 存储脚本',
    commands: [
      '# 编辑 scripts/demo-on-chain-storage.mjs',
      '# 替换 PROGRAM_ID 为刚部署的程序 ID',
      'export PROGRAM_ID="<your-program-id-here>"'
    ]
  },
  {
    title: '执行链上存储交易',
    commands: [
      'node scripts/demo-on-chain-storage.mjs --network devnet --keypair ~/.config/solana/id.json',
      '# 等待交易确认 (通常 10-30 秒)'
    ]
  },
  {
    title: '查询链上数据',
    commands: [
      '# 查看所有账户',
      'solana account <vault-account-address> --url devnet',
      '',
      '# 查看交易历史',
      'solana transaction-count --url devnet',
      '',
      '# 使用区块浏览器',
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
console.log('🔍 Step 4: 查询 Vault 数据的方法\n');
console.log('   ────────────────────────────────\n');

const queries = [
  {
    method: '方法 A: 通过 Solana Explorer',
    description: '最简单的方法，图形界面',
    steps: [
      '1. 打开: https://explorer.solana.com/?cluster=devnet',
      '2. 搜索钱包地址: ' + WALLET_PUBKEY,
      '3. 查看 Tokens & NFTs',
      '4. 找到 KeyShield Vault 账户'
    ]
  },
  {
    method: '方法 B: 通过 Solana CLI',
    description: '使用命令行查询',
    steps: [
      '$ solana account <vault-address> --url devnet',
      '$ solana account --following <owner-address> --url devnet',
      '# 查看详细信息',
      '$ solana account <address> --output json --url devnet | jq'
    ]
  },
  {
    method: '方法 C: 通过 RPC 调用',
    description: '程序化查询',
    steps: [
      'curl https://api.devnet.solana.com -X POST -H "Content-Type: application/json" \\',
      '  -d \'{"jsonrpc":"2.0","id":1,"method":"getAccountInfo",...}\''
    ]
  }
];

queries.forEach(q => {
  console.log(`   ${q.method}`);
  console.log(`   描述: ${q.description}\n`);
  q.steps.forEach(step => {
    console.log(`      ${step}`);
  });
  console.log('');
});

// Security considerations
console.log('🔐 Step 5: 安全注意事项\n');
console.log('   ────────────────────────────────\n');

const security = [
  '✅ API Key 加密后存储，链上不存在明文',
  '✅ 访问控制: 只有所有者可以解密',
  '✅ 审计日志: 所有操作都被记录',
  '✅ 时间戳: 防止重放攻击',
  '⚠️  Devnet 是公共测试网，不用于真实数据',
  '⚠️  Mainnet 部署前请审计代码',
  '⚠️  保管好你的钱包私钥'
];

security.forEach(item => {
  console.log(`   ${item}`);
});

console.log('\n');

// Summary
console.log('📊 Step 6: 状态总结\n');
console.log('   ────────────────────────────────\n');

const summary = {
  localVault: vaultExists ? '✅ 存在' : '❌ 不存在',
  encryption: vaultExists ? (vaultData.keyMetadata.encrypted ? '✅ 已加密' : '❌ 未加密') : 'N/A',
  devnetDeployed: '⏳ 待部署',
  devnetVerified: '❌ 未验证',
  timeline: new Date().toISOString()
};

console.log(`   本地存储:     ${summary.localVault}`);
console.log(`   加密状态:     ${summary.encryption}`);
console.log(`   Devnet 部署:  ${summary.devnetDeployed}`);
console.log(`   链上验证:     ${summary.devnetVerified}`);
console.log(`   时间戳:       ${summary.timeline}\n`);

// Next steps
console.log('🚀 下一步\n');
console.log('   ────────────────────────────────\n');

const nextSteps = [
  '1. 从 Faucet 获取 devnet SOL',
  '2. 构建并部署 KeyShield 程序',
  '3. 获取程序 ID 并更新脚本',
  '4. 执行链上存储交易',
  '5. 通过 Explorer 验证存储的数据',
  '6. 测试从链上检索和解密'
];

nextSteps.forEach(step => {
  console.log(`   ${step}`);
});

console.log('\n');

// Save summary
const summaryFile = path.join(__dirname, '.keyshield-demo', 'devnet-deployment-summary.json');
fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
console.log('💾 部署指南已保存\n');

// Resources
console.log('📚 有用的链接\n');
console.log('   ────────────────────────────────\n');

const resources = [
  '📖 Solana Developer Docs:       https://docs.solana.com/',
  '🔗 Solana Explorer (Devnet):    https://explorer.solana.com/?cluster=devnet',
  '💧 SOL Faucet:                  https://faucet.solana.com/',
  '🛠️  Solana CLI Reference:        https://docs.solana.com/cli',
  '📚 Rust 程序示例:               https://github.com/solana-labs/example-helloworld',
  '🔐 Lit Protocol Docs:           https://litprotocol.com/docs',
  '🌐 Web3.js 文档:                https://solana-labs.github.io/solana-web3.js/'
];

resources.forEach(resource => {
  console.log(`   ${resource}`);
});

console.log('\n✨ 部署准备完成！\n');
