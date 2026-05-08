#!/usr/bin/env node

/**
 * 一键部署脚本
 * 自动部署 KeyShield 程序到 Solana Devnet
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

console.log('\n🚀 KeyShield Devnet 部署脚本\n');
console.log('════════════════════════════════════════════════════════════\n');

// 部署命令
const deployCommand = 'solana';
const deployArgs = [
  'program', 
  'deploy', 
  'target/sbpf-solana-solana/release/keyshield.so',
  '--url', 'devnet'
];

console.log('📋 部署命令：');
console.log(`   $ ${deployCommand} ${deployArgs.join(' ')}\n`);

console.log('⚠️  注意事项：');
console.log('   • 部署可能需要 30-60 秒');
console.log('   • 网络问题可能导致失败（稍后重试）');
console.log('   • 部署完成后会显示程序 ID\n');

console.log('════════════════════════════════════════════════════════════\n');
console.log('⏳ 开始部署...\n');

// 记录开始时间
const startTime = Date.now();

// 生成部署过程
const deploy = spawn(deployCommand, deployArgs, {
  cwd: process.cwd(),
  stdio: 'inherit'
});

// 处理输出
deploy.on('close', (code) => {
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n');
  console.log('════════════════════════════════════════════════════════════');
  
  if (code === 0) {
    console.log('\n✅ 部署成功！\n');
    console.log('📌 后续步骤：');
    console.log('   1. 复制上面显示的 Program ID');
    console.log('   2. 在 Explorer 上查看：')
    console.log('      https://explorer.solana.com/?cluster=devnet');
    console.log('   3. 搜索 Program ID 或你的钱包地址\n');
    console.log('🎯 下一步部署 Vault 到链上：');
    console.log('   $ node scripts/demo-on-chain-storage.mjs --network devnet\n');
  } else {
    console.log('\n❌ 部署失败 (代码: ' + code + ')\n');
    console.log('🔧 排查步骤：');
    console.log('   1. 检查网络: solana cluster-version --url devnet');
    console.log('   2. 检查余额: solana balance');
    console.log('   3. 等待 1-2 分钟后重试\n');
  }
  
  console.log(`⏱️  耗时: ${duration} 秒\n`);
  console.log('════════════════════════════════════════════════════════════\n');
  
  process.exit(code);
});

// 错误处理
deploy.on('error', (error) => {
  console.error('\n❌ 错误: ', error.message, '\n');
  process.exit(1);
});
