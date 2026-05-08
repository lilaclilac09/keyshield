import { describe, it, expect } from 'vitest';
import {
  loadX402Config,
  recordClaim,
  hasClaim,
  generateStubPaymentProof,
  verifyOnChain,
  ERC20_TRANSFER_TOPIC,
  clearClaims,
} from '../src/x402/index';

describe('x402 / config', () => {
  it('should return null when env is incomplete', () => {
    const origRpc = process.env.KS_X402_BASE_RPC_URL;
    const origRecv = process.env.KS_X402_RECEIVER_ADDRESS;

    delete process.env.KS_X402_BASE_RPC_URL;
    delete process.env.KS_X402_RECEIVER_ADDRESS;

    const config = loadX402Config();
    expect(config).toBeNull();

    process.env.KS_X402_BASE_RPC_URL = origRpc || '';
    process.env.KS_X402_RECEIVER_ADDRESS = origRecv || '';
  });

  it('should generate a valid stub payment proof', () => {
    const proof = generateStubPaymentProof();
    expect(proof).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('should record and check claims', () => {
    clearClaims();
    const proof = '0x' + 'ab'.repeat(32);
    recordClaim(proof, 'user1', 10.0, 'stub-fallback');
    expect(hasClaim(proof)).toBe(true);
  });

  it('should reject duplicate claims', async () => {
    clearClaims();
    const proof = '0x' + 'cd'.repeat(32);
    const first = recordClaim(proof, 'user1', 5.0, 'real');
    const second = recordClaim(proof, 'user1', 5.0, 'real');
    expect(first).toBe(true);   // first claim succeeds
    expect(second).toBe(false);  // duplicate returns false
  });
});

describe('x402 / on-chain verify', () => {
  it('should return stub-fallback when config is null', async () => {
    clearClaims();
    const result = await verifyOnChain(null, '0x' + 'ab'.repeat(32), 10.0);
    expect(result.verified).toBe(true);
    expect(result.mode).toBe('stub-fallback');
  });

  it('should reject empty payment proof', async () => {
    await expect(verifyOnChain(null, '', 10.0)).rejects.toThrow();
  });

  it('should accept valid stub proofs', async () => {
    clearClaims();
    const proof = '0x' + 'ef'.repeat(32);
    const result = await verifyOnChain(null, proof, 10.0);
    expect(result.verified).toBe(true);
    expect(result.amountUsd).toBe(10.0);
  });

  it('should reject malformed tx hashes', async () => {
    clearClaims();
    await expect(verifyOnChain(null, 'short', 10.0)).rejects.toThrow();
  });

  it('should return payment result with amount', async () => {
    clearClaims();
    const result = await verifyOnChain(null, '0x' + 'ef'.repeat(32), 5.0);
    expect(result).toHaveProperty('verified');
    expect(result.amountUsd).toBe(5.0);
  });
});

describe('x402 / ERC-20 constants', () => {
  it('should have the correct transfer topic', () => {
    expect(ERC20_TRANSFER_TOPIC).toMatch(/^0xddf252ad/);
  });
});
