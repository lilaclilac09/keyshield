import { describe, it, expect } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';
import { KeyShieldClient } from './client';

const PROGRAM_ID = new PublicKey('11111111111111111111111111111112');

describe('KeyShieldClient', () => {
  it('reuses a passed-in Connection instance (P2-4)', () => {
    const shared = new Connection('https://example.com');
    const client = new KeyShieldClient({ connection: shared, programId: PROGRAM_ID });
    expect(client.connection).toBe(shared);
  });

  it('builds a Connection from rpcUrl when none is provided', () => {
    const client = new KeyShieldClient({
      rpcUrl: 'https://example.com',
      programId: PROGRAM_ID,
    });
    expect(client.connection).toBeInstanceOf(Connection);
  });

  it('throws when neither connection nor rpcUrl is provided', () => {
    expect(
      () => new KeyShieldClient({ programId: PROGRAM_ID } as any),
    ).toThrow(/connection.*rpcUrl/i);
  });

  it('accepts programId as a string', () => {
    const client = new KeyShieldClient({
      rpcUrl: 'https://example.com',
      programId: '11111111111111111111111111111112',
    });
    expect(client.programId).toBeInstanceOf(PublicKey);
    expect(client.programId.equals(PROGRAM_ID)).toBe(true);
  });

  it('accepts programId as a PublicKey', () => {
    const client = new KeyShieldClient({
      rpcUrl: 'https://example.com',
      programId: PROGRAM_ID,
    });
    expect(client.programId.equals(PROGRAM_ID)).toBe(true);
  });
});
