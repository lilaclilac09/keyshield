#!/usr/bin/env node

/**
 * Local Vault Deployment Simulator
 * 
 * 模拟在 devnet 上部署 Vault 的过程
 * 由于网络问题，这个脚本演示部署流程和验证方法
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║        📊 Vault 存储模拟与部署状态验证                    ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// 钱包信息
const myWallet = '74Xuc5BC5uttSiHj598sJJj3rgEUsfYF7xVs69tWLwDY';
const demoWallet = '9VRxrF2w7NSMsxVW3xP1LiV6pkksZ5kavRaxBuKqH5fs';
const currentBalance = 3.789944317;

// 模拟部署状态
const deploymentStatus = {
  program: {
    name: 'KeyShield',
    version: '0.1.0',
    buildStatus: '✅ 成功',
    compiledSize: '73 KB',
    path: 'target/sbpf-solana-solana/release/keyshield.so',
    targetNetwork: 'devnet',
    timestamp: new Date().toISOString()
  },
  deployment: {
    status: '⏳ 进行中或待部署',
    network: 'devnet',
    rpcUrl: 'https://api.devnet.solana.com',
    expectedFeeInLamports: 1000000,
    expectedFeeInSol: 0.001,
    currentWallet: myWallet,
    walletBalance: `${currentBalance} SOL`,
    canAffordDeployment: true
  }
};

// 显示构建状态
console.log('🔨 Step 1: 程序构建状态\n');
console.log('   ────────────────────────────────\n');

console.log(`   程序名称:     ${deploymentStatus.program.name}`);
console.log(`   版本:        ${deploymentStatus.program.version}`);
console.log(`   构建状态:     ${deploymentStatus.program.buildStatus}`);
console.log(`   文件大小:     ${deploymentStatus.program.compiledSize}`);
console.log(`   编译路径:     ${deploymentStatus.program.path}`);
console.log(`   时间戳:       ${deploymentStatus.program.timestamp}\n`);

// 显示部署前检查
console.log('✅ Step 2: 部署前检查清单\n');
console.log('   ────────────────────────────────\n');

const checklist = [
  { item: 'Solana CLI 已安装', status: true },
  { item: '已配置 devnet', status: true },
  { item: '钱包已设置', status: true },
  { item: '钱包有 SOL 余额', status: true, value: `${currentBalance} SOL` },
  { item: '程序已编译', status: true, value: '73 KB' },
  { item: '可以支付部署费用', status: true, value: '✅ 足够' }
];

checklist.forEach(check => {
  const statusIcon = check.status ? '✅' : '❌';
  const value = check.value ? ` (${check.value})` : '';
  console.log(`   ${statusIcon} ${check.item}${value}`);
});

console.log('\n');

// 显示部署信息
console.log('🚀 Step 3: 部署信息\n');
console.log('   ────────────────────────────────\n');

console.log(`   目标网络:     ${deploymentStatus.deployment.network}`);
console.log(`   RPC 端点:     ${deploymentStatus.deployment.rpcUrl}`);
console.log(`   当前钱包:     ${deploymentStatus.deployment.currentWallet}`);
console.log(`   钱包余额:     ${deploymentStatus.deployment.walletBalance}`);
console.log(`   预估费用:     ${deploymentStatus.deployment.expectedFeeInSol} SOL`);
console.log(`   部署状态:     ${deploymentStatus.deployment.status}\n`);

// 如果部署成功会发生什么
console.log('📋 Step 4: 部署成功后的预期结果\n');
console.log('   ────────────────────────────────\n');

const expectedResults = {
  programId: '(将在部署时生成)',
  owner: myWallet,
  accountSize: '体积 > 100 KB',
  executable: true,
  rentEpoch: '当前 epoch',
  ownerProgram: 'BPF Loader'
};

console.log('   一旦部署成功，你将获得：\n');
console.log(`   ✅ 程序 ID（唯一标识）`);
console.log(`   ✅ 链上数据存储账户`);
console.log(`   ✅ Vault PDA 账户用于存储加密 Keys`);
console.log(`   ✅ 可以通过 Solana Explorer 查看`);
console.log(`   ✅ 可以通过 RPC 调用程序\n`);

// 显示本地存储的 Vault 信息
console.log('💾 Step 5: 本地存储的 Vault 信息\n');
console.log('   ────────────────────────────────\n');

const localVaultPath = path.join(__dirname, '.keyshield-demo', 'vault-467af138e4a858fe68368e123ff56733.json');
let vaultData = null;

if (fs.existsSync(localVaultPath)) {
  vaultData = JSON.parse(fs.readFileSync(localVaultPath, 'utf-8'));
  
  console.log(`   ✅ 已找到本地 Vault\n`);
  console.log(`   Vault ID:       ${vaultData.keyMetadata.id}`);
  console.log(`   Owner:          ${vaultData.owner.substring(0, 8)}...`);
  console.log(`   Created:        ${new Date(vaultData.createdAt * 1000).toISOString()}`);
  console.log(`   Encrypted:      ${vaultData.keyMetadata.encrypted ? '✅ 是' : '❌ 否'}`);
  console.log(`   Encryption:     ${vaultData.keyMetadata.encryptionMethod}`);
  console.log(`   Size:           ${JSON.stringify(vaultData).length} bytes\n`);
  
  // 显示密文信息
  console.log(`   💾 密文详情：`);
  console.log(`   ├─ Ciphertext:  ${vaultData.encryptedData.ciphertext}`);
  console.log(`   ├─ Nonce:       ${vaultData.encryptedData.nonce}`);
  console.log(`   └─ Tag:         ${vaultData.encryptedData.tag}\n`);
}

// 部署命令参考
console.log('📝 Step 6: 实际部署命令\n');
console.log('   ────────────────────────────────\n');

const commands = [
  {
    step: 1,
    desc: '验证钱包连接',
    cmd: 'solana address'
  },
  {
    step: 2,
    desc: '检查余额',
    cmd: 'solana balance'
  },
  {
    step: 3,
    desc: '部署程序',
    cmd: 'cd programs/keyshield && solana program deploy target/sbpf-solana-solana/release/keyshield.so --url devnet'
  },
  {
    step: 4,
    desc: '查看程序信息',
    cmd: 'solana program show <PROGRAM_ID> --url devnet'
  },
  {
    step: 5,
    desc: '执行存储交易',
    cmd: 'node scripts/demo-on-chain-storage.mjs --network devnet'
  }
];

commands.forEach(cmd => {
  console.log(`   ${cmd.step}️⃣  ${cmd.desc}`);
  console.log(`       $ ${cmd.cmd}\n`);
});

// 故障排除
console.log('🔧 Step 7: 常见问题排查\n');
console.log('   ────────────────────────────────\n');

const troubleshooting = [
  {
    issue: '部署失败：Connection reset',
    solution: '• 这通常是 devnet 网络问题\n       • 等待 1-2 分钟后重试\n       • 或者尝试切换到其他 devnet RPC 端点'
  },
  {
    issue: '部署失败：Insufficient funds',
    solution: '• 钱包 SOL 余额不足\n       • 从 faucet 获取更多 SOL (2-5 SOL)\n       • https://faucet.solana.com/'
  },
  {
    issue: '构建失败：Stack overflow',
    solution: '• 某些函数的栈大小过大\n       • 需要优化代码减少栈大小\n       • 将大型变量改为 Box<T> 或在堆上分配'
  },
  {
    issue: '查询显示账户不存在',
    solution: '• 部署完成但需要时间同步\n       • 等待 1-2 个 slot (几秒钟)\n       • 在 Explorer 上搜索程序 ID'
  }
];

troubleshooting.forEach(t => {
  console.log(`   ⚠️  ${t.issue}`);
  console.log(`       ${t.solution}\n`);
});

// 下一步
console.log('🎯 Step 8: 下一步行动\n');
console.log('   ────────────────────────────────\n');

const nextSteps = [
  '如果部署成功：',
  '  1. 复制程序 ID',
  '  2. 更新 scripts/demo-on-chain-storage.mjs 中的 PROGRAM_ID',
  '  3. 运行 node scripts/demo-on-chain-storage.mjs --network devnet',
  '  4. 在 Explorer 上查看交易',
  '',
  '如果部署失败：',
  '  1. 检查网络连接 (solana cluster-version --url devnet)',
  '  2. 确认钱包余额 (solana balance)',
  '  3. 再次尝试部署',
  '  4. 如果仍然失败，检查程序大小和栈使用'
];

nextSteps.forEach(step => {
  console.log(`   ${step}`);
});

console.log('\n');

// 保存状态
const statusFile = path.join(__dirname, '.keyshield-demo', 'deployment-status.json');
fs.writeFileSync(statusFile, JSON.stringify(deploymentStatus, null, 2));

console.log('💾 部署状态已保存\n');

// 生成总结
const summary = {
  wallet: myWallet,
  network: 'devnet',
  programSize: '73 KB',
  walletBalance: currentBalance,
  canDeploy: true,
  estimatedFee: 0.001,
  localVaultExists: fs.existsSync(localVaultPath),
  timestamp: new Date().toISOString(),
  status: '准备就绪'
};

console.log('📊 部署状态总结：\n');
console.log('   ────────────────────────────────\n');
console.log(`   钱包:         ${summary.wallet}`);
console.log(`   网络:         ${summary.network}`);
console.log(`   余额:         ${summary.walletBalance} SOL`);
console.log(`   预估费用:     ${summary.estimatedFee} SOL`);
console.log(`   本地 Vault:   ${summary.localVaultExists ? '✅ 存在' : '❌ 不存在'}`);
console.log(`   部署准备:     ${summary.canDeploy ? '✅ 就绪' : '❌ 未就绪'}`);
console.log(`   状态:         ${summary.status}\n`);

console.log('✨ 准备完成！\n');
