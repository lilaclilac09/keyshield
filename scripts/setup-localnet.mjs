#!/usr/bin/env node

/**
 * Localnet 快速启动脚本
 * 在本机运行 Solana 验证器用于本地测试
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║        🚀 Solana Localnet 快速启动指南                    ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

console.log('📌 localnet 是什么？\n');
console.log('   一个在你本机上运行的完整 Solana 验证器，用于本地开发和测试。\n');
console.log('   ✅ 无需网络连接');
console.log('   ✅ 立即可用（无 Devnet 网络问题）');
console.log('   ✅ 免费（无交易费用）');
console.log('   ✅ 可重复测试\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('🔧 启动 Localnet 的方式\n');

console.log('方式 A: 在另一个终端启动 (推荐)\n');
console.log('   终端 1 (这个窗口):')
console.log('   $ solana-test-validator\n');
console.log('   等待输出:\n');
console.log('   ✓ Found 35 config file entry');
console.log('   ✓ Ready for RPC and WebSocket connections\n');
console.log('   然后在终端 2 执行部署:\n');

console.log('方式 B: 自动启动脚本\n');
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

console.log('🎯 在 Localnet 上部署的完整步骤\n');

const steps = [
  {
    step: 1,
    title: '启动 localhost 验证器',
    code: '$ solana-test-validator',
    wait: '⏳ 等待看到 "Ready for RPC and WebSocket connections"'
  },
  {
    step: 2,
    title: '另开终端，配置为 localhost',
    code: '$ solana config set --url localhost',
    wait: '✅ 确认输出: RPC URL: http://localhost:8899'
  },
  {
    step: 3,
    title: '检查可用的 SOL',
    code: '$ solana balance',
    wait: '✅ 应该显示很多 SOL (新创建的钱包默认有999999999 SOL)'
  },
  {
    step: 4,
    title: '部署程序',
    code: '$ cd /Users/aileen/Downloads/privacy_hack/keyshield\n  $ solana program deploy target/sbpf-solana-solana/release/keyshield.so --url localhost',
    output: 'Program Id: xxxXXXxxxXXXxxxXXXxxxXXXxxxXXXxxxXXXxxxx'
  },
  {
    step: 5,
    title: '复制 Program ID，然后更新脚本',
    code: '# 编辑 scripts/demo-on-chain-storage.mjs\n  const PROGRAM_ID = new PublicKey(\'<刚才复制的 ID>\');\n  const NETWORK = \'localhost\';',
    wait: ''
  },
  {
    step: 6,
    title: '在 localhost 上存储你的 Vault',
    code: '$ node scripts/demo-on-chain-storage.mjs --network localhost',
    output: '✅ Vault stored on localhost!'
  }
];

steps.forEach(s => {
  console.log(`\n${s.step}️⃣  ${s.title}\n`);
  console.log(`   $ ${s.code}\n`);
  if (s.wait) console.log(`   ⏳ ${s.wait}\n`);
  if (s.output) console.log(`   📋 输出将显示:\n   ${s.output}\n`);
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('🎉 部署完成后\n');
console.log('   你的 API Key Vault 现在已部署到本地区块链！\n');
console.log('   优点：\n');
console.log('   ✅ 完全离线，无网络依赖');
console.log('   ✅ 可以无限制地测试');
console.log('   ✅ 无交易费用');
console.log('   ✅ 完全的开发控制\n');

console.log('🔄 从 Localnet 迁移到 Devnet\n');
console.log('   准备好后，只需要：\n');
console.log('   1. solana config set --url devnet');
console.log('   2. 修改脚本配置');
console.log('   3. 重新部署（过程完全相同）\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('📝 快速参考\n');

const commands = [
  { cmd: 'solana-test-validator', desc: '启动本地验证器' },
  { cmd: 'solana config set --url localhost', desc: '配置为 localhost' },
  { cmd: 'solana balance', desc: '检查余额' },
  { cmd: 'solana program deploy <.so-file>', desc: '部署程序' },
  { cmd: 'solana program show <PROGRAM_ID>', desc: '查看程序信息' },
  { cmd: 'solana account <ADDRESS>', desc: '查看账户' }
];

commands.forEach(c => {
  console.log(`   $ ${c.cmd}`);
  console.log(`      → ${c.desc}\n`);
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('🚀 立即开始\n');
console.log('   打开新终端，运行:\n');
console.log('   $ solana-test-validator\n');
console.log('   ...等待验证器启动...\n');
console.log('   然后在另一个终端运行部署命令！\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// 创建启动脚本
const startLocalnetScript = `#!/bin/bash

echo "🚀 启动 Solana Localnet..."
echo ""
echo "等待看到: 'Ready for RPC and WebSocket connections'"
echo ""

solana-test-validator

`;

const startScriptPath = path.join(__dirname, 'start-localnet.sh');
fs.writeFileSync(startScriptPath, startLocalnetScript);
fs.chmodSync(startScriptPath, 0o755);

console.log(`✅ 已创建启动脚本: start-localnet.sh\n`);
console.log(`   运行: bash scripts/start-localnet.sh\n`);

// 创建部署脚本
const deployLocalhostScript = `#!/bin/bash

echo "🚀 部署到 Localnet..."
echo ""

# 配置为 localhost
solana config set --url localhost

# 检查余额
echo ""
echo "💰 检查余额..."
solana balance

# 部署程序
echo ""
echo "📦 部署程序..."
solana program deploy target/sbpf-solana-solana/release/keyshield.so --url localhost

echo ""
echo "✅ 部署完成！"
echo ""
echo "📋 现在编辑 scripts/demo-on-chain-storage.mjs"
echo "   替换 PROGRAM_ID 和 NETWORK 配置"
echo ""
echo "然后运行:"
echo "  node scripts/demo-on-chain-storage.mjs --network localhost"

`;

const deployScriptPath = path.join(__dirname, 'deploy-localhost.sh');
fs.writeFileSync(deployScriptPath, deployLocalhostScript);
fs.chmodSync(deployScriptPath, 0o755);

console.log(`✅ 已创建部署脚本: deploy-localhost.sh\n`);
console.log(`   运行: bash scripts/deploy-localhost.sh\n`);

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('💡 提示\n');
console.log('   Localnet 非常适合开发和测试');
console.log('   但数据在验证器重启时会丢失');
console.log('   生产环境请使用 Devnet/Testnet/Mainnet\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
