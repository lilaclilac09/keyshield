# KeyShield OpenClaw Skill

A secure, policy-driven skill for OpenClaw agents to access API keys and make payments through KeyShield's universal vault.

## Installation

```bash
clawhub install github:lilaclilac09/keyshield-openclaw-skill
```

Or from npm:

```bash
clawhub install @keyshield/openclaw-skill
```

## Overview

This skill provides AI agents with secure access to API keys through KeyShield's vault system, implementing the same security principles as OpenClaw's Vault-0:

- **Zero raw secrets**: Agents never see raw API keys or private keys
- **ZK-verified access**: Uses Bonsol ZK proofs for authorization
- **MPC decryption**: Uses Arcium MPC for secure key sharing
- **Policy guardrails**: Human-defined policies control agent behavior
- **Streaming payments**: x402 protocol for usage-based payments

## Capabilities

### Key Access

```typescript
// Get a specific API key
const openaiKey = await skill.getApiKey("openai", {
  // Optional: provide ZK proof for faster access
  bonsolProof: myProof
});

// Get all keys in a group
const allKeys = await skill.getUniversalKeys({
  group: "openai", // or "stripe", "payment-usdc", "universal"
  sessionToken: "optional-session-token"
});
```

### Payments

```typescript
// One-shot payment
const tx = await skill.payWithVault(0.50, "API call for GPT-4", {
  // Optional proof for faster processing
  proof: myProof
});

// Streaming payment (usage-based)
const stream = await skill.startPaymentStream(
  "https://api.openai.com/v1",
  {
    maxRateUsdPerMin: 1.00, // $1 per minute max
    unit: "per_token", // or "per_call"
    proof: myProof
  }
);

// Record usage
await stream.recordUsage(1000); // 1000 tokens

// Settle (automatically called every 60s, or manually)
await stream.settle();

// Close stream
await stream.close();
```

### Ephemeral Signers (GOAT-style)

```typescript
// Create temporary signer for specific actions
const signer = await skill.createEphemeralSigner(
  ["send", "swap"], // Allowed actions
  3600 // Expiry in seconds (1 hour)
);

// Use with GOAT SDK
const tx = await goat.signTransaction(signer, transaction);

// Check expiry
if (signer.isExpired()) {
  // Request new signer from human
}
```

### Policy Management

```typescript
// Get current policies
const policies = await skill.getPolicies();

// Check specific permission
const canAccess = await skill.checkPermission("getApiKey", { keyName: "openai" });
```

## Configuration

### YAML Policy Format

Policies are defined by the human owner in KeyShield's Universal Vault:

```yaml
# Example: Policy for AI assistant agent
name: ai-assistant
version: 1

# Rate limiting
rateLimit:
  callsPerHour: 1000
  tokensPerMin: 10000

# Max spend per session (in USDC micro-units)
maxSpend: 1000000  # $1.00

# Allowed endpoints (domain allow list)
allowedDomains:
  - api.openai.com
  - api.anthropic.com
  - api.cohere.com

# Blocked domains
blockedDomains:
  - malicious-site.com

# Allowed tools/actions
allowedTools:
  - getApiKey
  - startStreamingPayment
  - payWithVault
  - createEphemeralSigner

# Output redaction (sensitive data patterns)
outputRedaction:
  - pattern: "sk-.*"
    replacement: "sk-***REDACTED***"
  - pattern: "[0-9]{16}"
    replacement: "****-****-****-####"

# Session settings
session:
  timeoutSeconds: 3600
  requireReauth: false

# Payment settings
payments:
  streamingEnabled: true
  settlementIntervalSeconds: 60
```

## Security Model

### How It Works

1. **Agent Registration**: Agent registers with KeyShield, providing their public key
2. **Human Authorization**: Human grants access via KeyShield dashboard with specific policies
3. **ZK Proof Generation**: Agent generates a Bonsol ZK proof proving authorization
4. **Key Access**: On successful proof, agent receives encrypted key blob
5. **Client-Side Decryption**: Agent decrypts key using Lit Protocol (never transmitted raw)
6. **Action Execution**: Agent uses key for API calls within policy limits

### Security Guarantees

- **No Raw Keys**: Agent never sees unencrypted API keys
- **ZK Privacy**: Proof reveals only "authorized" not "what key"
- **Rate Limiting**: Hard limits enforced on API usage
- **Spend Caps**: Maximum spend per session prevents runaway costs
- **Domain Locking**: Keys only work on approved domains
- **Audit Trail**: All access logged on-chain for transparency

## OpenClaw Integration

This skill implements the OpenClaw skill interface:

```typescript
interface KeyShieldSkill {
  // Core methods
  getApiKey(keyName: string, params?: GetKeyParams): Promise<string>;
  getUniversalKeys(params: GetUniversalKeysParams): Promise<Record<string, string>>;
  
  // Payments
  payWithVault(amount: number, memo: string, params?: PayParams): Promise<string>;
  startStreamingPayment(serviceUrl: string, params: StreamParams): Promise<StreamingSession>;
  
  // Ephemeral signers
  createEphemeralSigner(allowedActions: string[], expiry: number): Promise<EphemeralSigner>;
  
  // Policy
  getPolicies(): Promise<Policy[]>;
  checkPermission(action: string, params?: Record<string, any>): Promise<boolean>;
}
```

## Examples

### Claude Agent with KeyShield

```typescript
import { KeyShieldSkill } from "@keyshield/openclaw-skill";

// Initialize skill
const skill = new KeyShieldSkill({
  rpcUrl: "https://api.mainnet-beta.solana.com",
  programId: "KeyShieldProgramID...",
  ownerWallet: myWallet
});

// Register agent
await skill.registerAgent(agentPublicKey);

// Get OpenAI key for completion
const openaiKey = await skill.getApiKey("openai");

// Use with OpenAI
const response = await openai.completions.create({
  model: "gpt-4",
  prompt: "Hello world",
  api_key: openaiKey  // Injected securely
});
```

### Agent with Streaming Payments

```typescript
// Setup streaming for LLM usage
const stream = await skill.startStreamingPayment("https://api.anthropic.com/v1", {
  maxRateUsdPerMin: 0.50,
  unit: "per_token"
});

// In your agent loop
for (const message of messages) {
  const response = await anthropic.messages.create({
    model: "claude-3-opus-20240229",
    messages: [message],
    max_tokens: 1024
  });
  
  // Record token usage
  await stream.recordUsage(response.usage.input_tokens + response.usage.output_tokens);
  
  // Check if settlement needed
  if (stream.getUnitsUsed() > 10000) {
    await stream.settle();
  }
}

// Cleanup
await stream.close();
```

## Troubleshooting

### "Agent not authorized"

- Check that the human has granted access via KeyShield dashboard
- Verify your agent public key matches what was authorized

### "Rate limit exceeded"

- You've hit the hourly call or token limit
- Wait for the next hour or request limit increase from human

### "Max spend exceeded"

- Session spending limit reached
- Start a new session or request increase from human

### "ZK proof invalid"

- Proof may have expired
- Regenerate proof and retry

## See Also

- [KeyShield Documentation](https://keyshield.dev/docs)
- [Bonsol ZK Proofs](https://docs.bonsol.xyz)
- [Arcium MPC](https://docs.arcium.com)
- [OpenClaw Skills](https://docs.openclaw.xyz/skills)
- [x402 Protocol](https://docs.x402.org)
