import { describe, it, expect } from 'vitest';
import {
  ExtensionSession,
  SESSION_STORAGE_KEY,
  type SessionState,
  type SessionStorageBackend,
} from './session';

function memoryStorage(): SessionStorageBackend & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    async get(key) {
      return data.get(key) as any;
    },
    async set(key, value) {
      data.set(key, value);
    },
    async remove(key) {
      data.delete(key);
    },
  };
}

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    ephemeralPubkey: 'FakePubkey',
    deviceLabel: 'MacBook Pro',
    createdAt: 1_000_000,
    expiresAt: 1_000_000 + 7200,
    ...overrides,
  };
}

describe('ExtensionSession basic state', () => {
  it('returns null before anything is set', async () => {
    const s = new ExtensionSession({ storage: memoryStorage() });
    expect(await s.getSession()).toBeNull();
    expect(await s.isUnlocked()).toBe(false);
    expect(await s.secondsRemaining()).toBeNull();
    expect(await s.isNearExpiry()).toBe(false);
  });

  it('persists and reads back a session', async () => {
    const storage = memoryStorage();
    const s = new ExtensionSession({ storage });
    const state = makeState();
    await s.setSession(state);
    expect(storage.data.get(SESSION_STORAGE_KEY)).toEqual(state);
    expect(await s.getSession()).toEqual(state);
  });

  it('clearSession wipes the entry', async () => {
    const storage = memoryStorage();
    const s = new ExtensionSession({ storage });
    await s.setSession(makeState());
    await s.clearSession();
    expect(storage.data.get(SESSION_STORAGE_KEY)).toBeUndefined();
  });
});

describe('ExtensionSession expiry math', () => {
  it('isUnlocked = true just before expiry', async () => {
    const now = 2_000_000;
    const s = new ExtensionSession({ storage: memoryStorage(), now: () => now });
    await s.setSession(makeState({ createdAt: now - 100, expiresAt: now + 1 }));
    expect(await s.isUnlocked()).toBe(true);
  });

  it('isUnlocked = false at exact expiry', async () => {
    const now = 2_000_000;
    const s = new ExtensionSession({ storage: memoryStorage(), now: () => now });
    await s.setSession(makeState({ expiresAt: now }));
    expect(await s.isUnlocked()).toBe(false);
  });

  it('secondsRemaining matches the gap', async () => {
    const now = 2_000_000;
    const s = new ExtensionSession({ storage: memoryStorage(), now: () => now });
    await s.setSession(makeState({ expiresAt: now + 300 }));
    expect(await s.secondsRemaining()).toBe(300);
  });

  it('secondsRemaining clamps to 0, never negative', async () => {
    const now = 2_000_000;
    const s = new ExtensionSession({ storage: memoryStorage(), now: () => now });
    await s.setSession(makeState({ expiresAt: now - 100 }));
    expect(await s.secondsRemaining()).toBe(0);
  });

  it('expiresAt=0 means never expires', async () => {
    const now = 2_000_000;
    const s = new ExtensionSession({ storage: memoryStorage(), now: () => now });
    await s.setSession(makeState({ expiresAt: 0 }));
    expect(await s.isUnlocked()).toBe(true);
    expect(await s.secondsRemaining()).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('ExtensionSession isNearExpiry', () => {
  it('is true when within the warning window', async () => {
    const now = 5000;
    const s = new ExtensionSession({
      storage: memoryStorage(),
      now: () => now,
      warnBeforeExpirySecs: 60,
    });
    await s.setSession(makeState({ expiresAt: now + 30 }));
    expect(await s.isNearExpiry()).toBe(true);
  });

  it('is false when further out', async () => {
    const now = 5000;
    const s = new ExtensionSession({
      storage: memoryStorage(),
      now: () => now,
      warnBeforeExpirySecs: 60,
    });
    await s.setSession(makeState({ expiresAt: now + 500 }));
    expect(await s.isNearExpiry()).toBe(false);
  });

  it('is false when already expired', async () => {
    const now = 5000;
    const s = new ExtensionSession({ storage: memoryStorage(), now: () => now });
    await s.setSession(makeState({ expiresAt: now - 1 }));
    expect(await s.isNearExpiry()).toBe(false);
  });

  it('is false for never-expiring sessions', async () => {
    const s = new ExtensionSession({ storage: memoryStorage(), now: () => 1 });
    await s.setSession(makeState({ expiresAt: 0 }));
    expect(await s.isNearExpiry()).toBe(false);
  });
});

describe('ExtensionSession.buildStateFromGrant', () => {
  it('uses the default 2-hour duration when unspecified', () => {
    const s = new ExtensionSession({
      storage: memoryStorage(),
      now: () => 100,
    });
    const built = s.buildStateFromGrant({
      ephemeralPubkey: 'pk',
      deviceLabel: 'Phone',
    });
    expect(built.createdAt).toBe(100);
    expect(built.expiresAt).toBe(100 + 7200);
    expect(built.deviceLabel).toBe('Phone');
    expect(built.ephemeralPubkey).toBe('pk');
  });

  it('honors a custom durationSecs', () => {
    const s = new ExtensionSession({
      storage: memoryStorage(),
      now: () => 100,
    });
    const built = s.buildStateFromGrant({
      ephemeralPubkey: 'pk',
      deviceLabel: 'Phone',
      durationSecs: 10,
    });
    expect(built.expiresAt).toBe(110);
  });

  it('treats durationSecs=0 as "no expiry"', () => {
    const s = new ExtensionSession({
      storage: memoryStorage(),
      now: () => 100,
    });
    const built = s.buildStateFromGrant({
      ephemeralPubkey: 'pk',
      deviceLabel: 'Phone',
      durationSecs: 0,
    });
    expect(built.expiresAt).toBe(0);
  });
});
