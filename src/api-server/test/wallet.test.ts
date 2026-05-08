import { describe, it, expect, afterAll } from 'vitest';
import { registerWallet, revokeWallet, listWallets, purgeWallets, generateEphemeralWallet } from '../src/wallet/index';

describe('wallet / ephemeral', () => {
  it('should generate an ephemeral wallet', () => {
    const result = generateEphemeralWallet('owner-' + Date.now());
    expect(result.wallet).toBeDefined();
    expect(typeof result.wallet.publicKey).toBe('string');
    expect(typeof result.keyPair.secretKey).toBe('string');
  });

  it('should default to solana chain', () => {
    const wallet = generateEphemeralWallet('owner-' + Date.now());
    expect(wallet.wallet.chain).toBe('solana');
  });

  it('should create EVM wallet when specified', () => {
    const wallet = generateEphemeralWallet('owner-' + Date.now(), 'evm');
    expect(wallet.wallet.chain).toBe('evm');
    expect(wallet.wallet.publicKey.startsWith('0x')).toBe(true);
  });
});

describe('wallet / registration', () => {
  const ownerA = 'owner-wallet-' + Date.now();
  const ownerB = 'owner-wallet-b-' + Date.now();

  afterAll(() => {
    purgeWallets(ownerA);
    purgeWallets(ownerB);
  });

  it('should register a wallet', () => {
    const result = registerWallet(ownerA, `9WzDX-${Date.now()}`, 'test-agent', '*');
    expect(typeof result.id).toBe('number');
  });

  it('should list registered wallets', () => {
    registerWallet(ownerA, `9WzDX-${Date.now()}`, 'wallet-a', '*');
    registerWallet(ownerA, `9WzDX-${Date.now()}`, 'wallet-b', 'proxy');
    const wallets = listWallets(ownerA);
    expect(wallets.length).toBe(3); // purge + 2 registered
  });

  it('should revoke a wallet', () => {
    const result = registerWallet(ownerB, `9WzDX-${Date.now()}`, 'rev-test', '*');
    const revoked = revokeWallet(ownerB, result.id);
    expect(revoked).toBe(true);
  });

  it('should purge wallets for a user', () => {
    registerWallet(ownerB, `9WzDX-purge-${Date.now()}`, 'purge-agent', '*');
    const result = purgeWallets(ownerB);
    expect(result.agents + result.revocations).toBeGreaterThanOrEqual(1);
  });
});
