import { describe, it, expect } from 'vitest';
import { KeyShieldHttp } from './http-client';
import { X402Client } from './x402';
import { parseActiveSessions, isSessionExpired, encodeGrantAgentAccessData } from './session';
import { PublicKey } from '@solana/web3.js';

describe('KeyShieldHttp static helpers', () => {
  it('generateKeypair returns correct-sized keys', () => {
    const kp = KeyShieldHttp.generateKeypair();
    expect(kp.publicKey).toBeInstanceOf(Uint8Array);
    expect(kp.secretKey).toBeInstanceOf(Uint8Array);
    expect(kp.publicKey.length).toBe(32);
    expect(kp.secretKey.length).toBe(64);
  });

  it('pubkeyToB58 returns a non-empty string for a valid 32-byte pubkey', () => {
    const kp = KeyShieldHttp.generateKeypair();
    const b58 = KeyShieldHttp.pubkeyToB58(kp.publicKey);
    expect(typeof b58).toBe('string');
    expect(b58.length).toBeGreaterThan(0);
  });
});

describe('X402Client.parsePaymentDetails', () => {
  it('parses X-Payment-Required header correctly', () => {
    const mockRes = new Response(null, {
      status: 402,
      headers: { 'X-Payment-Required': 'amount=1000 upstream=anthropic' },
    });
    const details = X402Client.parsePaymentDetails(mockRes);
    expect(details.amount).toBe(1000);
    expect(details.upstream).toBe('anthropic');
  });
});

describe('parseActiveSessions', () => {
  it('returns [] for a too-short buffer', () => {
    const emptyBuffer = new Uint8Array(10);
    expect(parseActiveSessions(emptyBuffer)).toEqual([]);
  });
});

describe('isSessionExpired', () => {
  it('returns false when expiresAt is 0 (no expiry)', () => {
    const s = {
      agentPubkey: new PublicKey('11111111111111111111111111111112'),
      createdAt: 0,
      sessionTimeoutSecs: 0,
      expiresAt: 0,
      isActive: true,
      slotIndex: 0,
    };
    expect(isSessionExpired(s, Date.now() / 1000)).toBe(false);
  });

  it('returns true when session has expired', () => {
    const s = {
      agentPubkey: new PublicKey('11111111111111111111111111111112'),
      createdAt: 1000,
      sessionTimeoutSecs: 3600,
      expiresAt: 4600,
      isActive: true,
      slotIndex: 0,
    };
    expect(isSessionExpired(s, 5000)).toBe(true);
  });
});

describe('encodeGrantAgentAccessData', () => {
  it('returns a Uint8Array of length 61', () => {
    const agentPubkey = new PublicKey('11111111111111111111111111111112');
    const ownerPubkey = new PublicKey('11111111111111111111111111111112');
    const data = encodeGrantAgentAccessData({ ownerPubkey, agentPubkey });
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data.length).toBe(61);
  });
});
