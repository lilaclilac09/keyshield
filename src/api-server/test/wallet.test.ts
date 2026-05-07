/**
 * Tests for the wallet module.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateEphemeralWallet,
  registerWallet,
  revokeWallet,
  listWallets,
  purgeWallets,
} from '../src/wallet/index';

describe('wallet / ephemeral', () => {
  it('should generate an ephemeral wallet', () => {
    const result = generateEphemeralWallet('owner123');
    expect(result.wallet).toBeDefined();
    expect(result.keyPair).toBeDefined();
    expect(typeof result.wallet.publicKey).toBe('string');
    expect(typeof result.keyPair.secretKey).toBe('string');
  });

  it('should default to solana chain', () => {
    const wallet = generateEphemeralWallet('owner123');
    expect(wallet.wallet.chain).toBe('solana');
  });

  it('should create EVM wallet when specified', () => {
    const wallet = generateEphemeralWallet('owner123', 'evm');
    expect(wallet.wallet.chain).toBe('evm');
    expect(wallet.wallet.publicKey.startsWith('0x')).toBe(true);
  });
});

describe('wallet / registration', () => {
  beforeEach(() => {
    // Clean up any previous test agents
    purgeWallets('test-owner-reg-' + Date.now());
  });

  it('should register a wallet', () => {
    const result = registerWallet('owner123', '9WzDXreg');
    expect(result.id).toBeDefined();
  });

  it('should list registered wallets', () => {
    registerWallet('owner123', '9WzDXaaa', 'wallet-a', '*');
    registerWallet('owner123', '9WzDXbbb', 'wallet-b', 'proxy');

    const wallets = listWallets('owner123');
    expect(wallets.length).toBe(2);
  });

  it('should revoke a wallet', () => {
    const { id } = registerWallet('owner123', '9WzDXrev', 'rev-test', '*');
    const revoked = revokeWallet('owner123', id);
    expect(revoked).toBe(true);
  });

  it('should purge wallets for a user', () => {
    registerWallet('owner-purge', '9WzDXpurge', 'purge-agent', '*');
    const result = purgeWallets('owner-purge');
    expect(result.wallets + result.revocations).toBeGreaterThanOrEqual(1);
  });
});
