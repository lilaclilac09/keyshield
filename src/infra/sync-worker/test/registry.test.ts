/**
 * Unit tests for the R2-backed registry — registration records and
 * single-use challenges. Tests run inside workerd against a real R2
 * binding via @cloudflare/vitest-pool-workers.
 */

import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  consumeChallenge,
  issueChallenge,
  readRegistration,
  writeRegistrationOnce,
  bumpCounter,
} from '../src/registry';

const VAULT_ID = 'reg-test-vault-id-123';

beforeEach(async () => {
  const list = await (env as any).REGISTRY.list();
  for (const obj of list.objects) await (env as any).REGISTRY.delete(obj.key);
});

describe('writeRegistrationOnce / readRegistration', () => {
  it('readRegistration returns null when nothing has been written', async () => {
    const r = await readRegistration((env as any).REGISTRY, VAULT_ID);
    expect(r).toBeNull();
  });

  it('first write wins, second returns false (409 semantics)', async () => {
    const a = await writeRegistrationOnce((env as any).REGISTRY, VAULT_ID, {
      credentialId: 'cred-1',
      publicKey: 'pk-base64',
      counter: 0,
      registeredAt: 100,
    });
    expect(a).toBe(true);

    const b = await writeRegistrationOnce((env as any).REGISTRY, VAULT_ID, {
      credentialId: 'cred-2',
      publicKey: 'pk-other',
      counter: 0,
      registeredAt: 200,
    });
    expect(b).toBe(false);

    const stored = await readRegistration((env as any).REGISTRY, VAULT_ID);
    expect(stored?.credentialId).toBe('cred-1'); // unchanged
  });

  it('readRegistration ignores corrupt JSON', async () => {
    await (env as any).REGISTRY.put(VAULT_ID, 'not json');
    const r = await readRegistration((env as any).REGISTRY, VAULT_ID);
    expect(r).toBeNull();
  });

  it('readRegistration ignores wrong-shape JSON', async () => {
    await (env as any).REGISTRY.put(
      VAULT_ID,
      JSON.stringify({ credentialId: 'x' }), // missing required fields
    );
    const r = await readRegistration((env as any).REGISTRY, VAULT_ID);
    expect(r).toBeNull();
  });
});

describe('bumpCounter', () => {
  it('updates the counter without touching other fields', async () => {
    await writeRegistrationOnce((env as any).REGISTRY, VAULT_ID, {
      credentialId: 'cred-1',
      publicKey: 'pk',
      counter: 0,
      registeredAt: 100,
    });
    await bumpCounter((env as any).REGISTRY, VAULT_ID, 7);
    const r = await readRegistration((env as any).REGISTRY, VAULT_ID);
    expect(r?.counter).toBe(7);
    expect(r?.credentialId).toBe('cred-1');
    expect(r?.publicKey).toBe('pk');
  });

  it('is a no-op when no record exists', async () => {
    await expect(bumpCounter((env as any).REGISTRY, VAULT_ID, 5)).resolves.toBeUndefined();
    expect(await readRegistration((env as any).REGISTRY, VAULT_ID)).toBeNull();
  });
});

describe('issueChallenge / consumeChallenge', () => {
  const RAND = (n: number) => new Uint8Array(n).fill(0xab);

  it('issued challenge can be consumed exactly once', async () => {
    const issued = await issueChallenge((env as any).REGISTRY, VAULT_ID, RAND);
    expect(issued.challenge.length).toBeGreaterThan(0);

    const first = await consumeChallenge((env as any).REGISTRY, VAULT_ID);
    expect(first?.challenge).toBe(issued.challenge);

    const second = await consumeChallenge((env as any).REGISTRY, VAULT_ID);
    expect(second).toBeNull();
  });

  it('consumeChallenge returns null when no challenge issued', async () => {
    expect(await consumeChallenge((env as any).REGISTRY, VAULT_ID)).toBeNull();
  });

  it('expired challenge is rejected', async () => {
    // Issue with normal TTL, then move the clock forward past it.
    const issued = await issueChallenge((env as any).REGISTRY, VAULT_ID, RAND);
    const past = issued.expiresAt + 1;
    vi.spyOn(Date, 'now').mockReturnValue(past);
    expect(await consumeChallenge((env as any).REGISTRY, VAULT_ID)).toBeNull();
    vi.restoreAllMocks();
  });

  it('issuing twice replaces the previous challenge', async () => {
    const RAND_A = (n: number) => new Uint8Array(n).fill(0x11);
    const RAND_B = (n: number) => new Uint8Array(n).fill(0x22);
    const a = await issueChallenge((env as any).REGISTRY, VAULT_ID, RAND_A);
    const b = await issueChallenge((env as any).REGISTRY, VAULT_ID, RAND_B);
    expect(b.challenge).not.toBe(a.challenge);
    const consumed = await consumeChallenge((env as any).REGISTRY, VAULT_ID);
    expect(consumed?.challenge).toBe(b.challenge);
  });
});
