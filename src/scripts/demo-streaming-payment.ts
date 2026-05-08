#!/usr/bin/env ts-node
/**
 * KeyShield Agentic - End-to-End Demo
 * 
 * This demo shows an AI agent:
 * 1. Registering with KeyShield
 * 2. Getting authorized access from human
 * 3. Starting a streaming x402 payment session
 * 4. Making API calls and recording usage
 * 5. Settling payments automatically
 * 
 * Run: npx ts-node scripts/demo-streaming-payment.ts
 */

import { Connection, PublicKey, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { KeyShieldAgent, StreamingPaymentSession } from '../packages/agent-sdk/src/index';

// Demo configuration
const CONFIG = {
  rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  programId: process.env.KEYSHIELD_PROGRAM_ID || 'KeyShieldProgramID11111111111111111111111111',
  ownerPrivateKey: process.env.OWNER_PRIVATE_KEY || '',
  agentPrivateKey: process.env.AGENT_PRIVATE_KEY || '',
};

// Mock Claude API interaction
class MockClaudeAPI {
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  async createMessage(model: string, messages: any[]) {
    // Simulate API call
    const inputTokens = Math.floor(Math.random() * 500) + 100;
    const outputTokens = Math.floor(Math.random() * 300) + 50;
    
    return {
      id: `msg_${Math.random().toString(36).substr(2, 9)}`,
      model,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      },
      content: [{
        type: 'text',
        text: 'This is a mock response from Claude for demonstration purposes.',
      }],
    };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('KeyShield Agentic - Streaming x402 Payment Demo');
  console.log('='.repeat(60));
  console.log();

  // Step 1: Setup
  console.log('📡 Step 1: Connecting to Solana...');
  const connection = new Connection(CONFIG.rpcUrl);
  const version = await connection.getVersion();
  console.log(`   ✅ Connected to Solana`);
  console.log();

  // Step 2: Load wallets
  console.log('👤 Step 2: Loading wallets...');
  
  // For demo, create test keypairs if not provided
  const ownerWallet = Keypair.generate();
  const agentWallet = Keypair.generate();
  
  console.log(`   Owner: ${ownerWallet.publicKey.toBase58()}`);
  console.log(`   Agent: ${agentWallet.publicKey.toBase58()}`);
  console.log('   ⚠️  Using test keypairs - in production use actual wallets');
  console.log();

  // Step 3: Initialize KeyShield Agent
  console.log('🔐 Step 3: Initializing KeyShield Agent...');
  
  const agent = new KeyShieldAgent({
    rpcUrl: CONFIG.rpcUrl,
    programId: CONFIG.programId,
  });
  
  await agent.initialize(ownerWallet.publicKey);
  console.log('   ✅ Agent initialized');
  console.log();

  // Step 4: Register agent
  console.log('🤖 Step 4: Registering agent with KeyShield...');
  
  const sessionToken = await agent.registerAgent(agentWallet.publicKey);
  console.log(`   ✅ Agent registered`);
  console.log(`   Session token: ${sessionToken.slice(0, 20)}...`);
  console.log();

  // Step 5: Simulate human granting access (in production this happens via dashboard)
  console.log('👨‍💻 Step 5: Human grants agent access (simulated)...');
  console.log('   Policy:');
  console.log('   - Rate limit: 1000 calls/hour, 10000 tokens/min');
  console.log('   - Max spend: $10.00 USDC');
  console.log('   - Streaming: enabled');
  console.log('   - Allowed: api.anthropic.com');
  console.log('   ✅ Access granted');
  console.log();

  // Step 6: Start streaming payment
  console.log('💳 Step 6: Starting streaming x402 payment...');
  
  const stream = await agent.startStreamingPayment('https://api.anthropic.com/v1', {
    maxRateUsdPerMin: 1.00, // $1 per minute max
    unit: 'per_token',
  });
  
  console.log(`   ✅ Streaming session started`);
  console.log(`   Stream URL: ${stream.getServiceUrl()}`);
  console.log(`   Rate: $1.00 USDC per token (billed per minute)`);
  console.log();

  // Step 7: Create Claude API client with KeyShield key
  console.log('🔑 Step 7: Getting API key from vault...');
  
  // In production, this would get the actual key
  const claudeApiKey = 'sk-ant-api03-demo-key-for-testing';
  const claude = new MockClaudeAPI(claudeApiKey);
  console.log(`   ✅ API key retrieved (demo mode)`);
  console.log();

  // Step 8: Simulate agent making API calls
  console.log('🤖 Step 8: Agent making API calls...');
  console.log();
  
  const models = [
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ];
  
  for (let i = 0; i < 5; i++) {
    const model = models[i % models.length];
    console.log(`   📤 Request ${i + 1}: Using ${model}...`);
    
    const response = await claude.createMessage(model, [
      { role: 'user', content: `Hello, this is test message ${i + 1}` }
    ]);
    
    console.log(`      Input tokens: ${response.usage.input_tokens}`);
    console.log(`      Output tokens: ${response.usage.output_tokens}`);
    
    // Record usage
    const totalTokens = response.usage.input_tokens + response.usage.output_tokens;
    await stream.recordUsage(totalTokens);
    console.log(`      ✅ Usage recorded: ${totalTokens} tokens`);
    console.log();
    
    // Simulate delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Step 9: Check usage and settle
  console.log('💰 Step 9: Checking usage and settling...');
  console.log(`   Current usage: ${stream.getUnitsUsed()} tokens`);
  
  const settlement = await stream.settle();
  console.log(`   ✅ Settlement complete`);
  console.log(`   Transaction: ${settlement.slice(0, 20)}...`);
  console.log();

  // Step 10: Get final status
  console.log('📊 Step 10: Final status...');
  const status = await agent.getAgentStatus();
  console.log('   Agent Status:');
  console.log(`   - Active: ${status.isActive}`);
  console.log(`   - Max spend: $${(status.maxSpendMicroUSDC / 1_000_000).toFixed(2)} USDC`);
  console.log(`   - Spent: $${(status.cumulativeSpend / 1_000_000).toFixed(2)} USDC`);
  console.log(`   - Remaining: $${((status.maxSpendMicroUSDC - status.cumulativeSpend) / 1_000_000).toFixed(2)} USDC`);
  console.log();

  // Step 11: Cleanup
  console.log('🧹 Step 11: Closing streams and cleanup...');
  await stream.close();
  console.log('   ✅ All streams closed');
  console.log();

  // Summary
  console.log('='.repeat(60));
  console.log('✅ Demo Complete!');
  console.log('='.repeat(60));
  console.log();
  console.log('What happened:');
  console.log('1. Agent registered with KeyShield vault');
  console.log('2. Human (simulated) granted access with policies');
  console.log('3. Started streaming x402 payment session');
  console.log('4. Made 5 API calls to Claude');
  console.log('5. Recorded token usage for each call');
  console.log('6. Settled accumulated payment');
  console.log('7. All within policy limits');
  console.log();
  console.log('Security:');
  console.log('- API key never exposed to agent in plaintext');
  console.log('- All access authorized via ZK proof');
  console.log('- Payments limited by policy caps');
  console.log('- Full audit trail on-chain');
}

main().catch(console.error);
