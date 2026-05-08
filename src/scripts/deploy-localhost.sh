#!/bin/bash

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

