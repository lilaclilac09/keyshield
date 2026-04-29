/**
 * End-to-end "one-click save" flow test.
 *
 * Pins the contract for the path the user takes when the extension
 * detects a key on a page and they hit Save:
 *
 *     KeyDetector.detectFromText / detectFormFields
 *         │
 *         ▼ DetectedKey { provider, key, ... }
 *     upsertKey()  — VaultPlain.apiKeys[provider] = { value, createdAt }
 *         │
 *         ▼
 *     LocalVault.encryptVault(plain, masterKey)
 *         │
 *         ▼
 *     LocalVault.putCachedCipher(cipher)        ← chrome.storage.local
 *     SyncBackend.push(vaultId, cipher)          ← cross-device sync
 *
 * Inverts:
 *
 *     SyncBackend.pull(vaultId) → LocalVault.decryptVault → plain.apiKeys
 *
 * No React, no chrome runtime — just the libs in their final wiring,
 * with a real webcrypto + InMemorySyncBackend. If this passes, the
 * "save" button on the popup is doing what it claims.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import { KeyDetector, type DetectedKey } from './detector';
import {
  LocalVault,
  type StorageBackend,
  type CryptoBackend,
  type VaultPlain,
} from './vault';
import { InMemorySyncBackend, type SyncBackend } from './sync';

// ─── shared fixtures ─────────────────────────────────────────────────────

const PRF_SECRET = new Uint8Array(32).fill(0x42);

function memoryStorage(): StorageBackend & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    async get(key) { return data.get(key) as any; },
    async set(key, value) { data.set(key, value); },
    async remove(key) { data.delete(key); },
  };
}

const cryptoBackend: CryptoBackend = {
  subtle: webcrypto.subtle as unknown as SubtleCrypto,
  getRandomValues: <T extends ArrayBufferView | null>(a: T) =>
    webcrypto.getRandomValues(a as any) as T,
};

/**
 * One-click-save reducer. Mirrors the hook in useVaultFlow.ts but
 * reduces it to a pure function so the integration test can exercise
 * it directly without React state.
 */
function applyDetectedKey(plain: VaultPlain, detected: DetectedKey): VaultPlain {
  const provider = detected.provider ?? 'unknown';
  return {
    ...plain,
    apiKeys: {
      ...plain.apiKeys,
      [provider]: {
        value: detected.key,
        createdAt: Date.now(),
        tags: [`source:${detected.source}`, `domain:${detected.domain}`],
      },
    },
  };
}

// ─── 1. happy-path round-trip ────────────────────────────────────────────

describe('one-click save — happy path', () => {
  let vault: LocalVault;
  let storage: ReturnType<typeof memoryStorage>;
  let sync: InMemorySyncBackend;
  let masterKey: CryptoKey;
  let vaultId: string;

  beforeEach(async () => {
    storage = memoryStorage();
    vault = new LocalVault({ storage, crypto: cryptoBackend });
    sync = new InMemorySyncBackend();
    masterKey = await vault.deriveMasterKey(PRF_SECRET);
    vaultId = await vault.deriveVaultId(PRF_SECRET);
  });

  it('detects an OpenAI key and round-trips it through the vault', async () => {
    // Step 1: detect (the page has a paste of an OpenAI key)
    const fakeKey = 'sk-live_' + 'a'.repeat(48);
    const detected = KeyDetector.detectFromText(fakeKey, 'platform.openai.com');
    expect(detected.length).toBeGreaterThan(0);
    const openai = detected.find((d) => d.provider === 'OpenAI')!;
    expect(openai).toBeTruthy();

    // Step 2: upsert into a fresh vault
    const next = applyDetectedKey(LocalVault.emptyVault(), openai);
    expect(next.apiKeys['OpenAI'].value).toBe(fakeKey);

    // Step 3: encrypt + cache + push
    const cipher = await vault.encryptVault(next, masterKey);
    await vault.putCachedCipher(cipher);
    const pushed = await sync.push(vaultId, cipher);
    expect(pushed).toBe(true);

    // Step 4: prove the cache is real — exact ciphertext on disk
    const cached = await vault.getCachedCipher();
    expect(cached?.ciphertext).toBe(cipher.ciphertext);

    // Step 5: prove sync is authoritative — pull, decrypt, see the key
    const remote = await sync.pull(vaultId);
    expect(remote).not.toBeNull();
    const recovered = await vault.decryptVault(remote!, masterKey);
    expect(recovered.apiKeys['OpenAI'].value).toBe(fakeKey);
  });

  it('preserves the source provenance in tags', async () => {
    const fakeKey = 'sk-ant-api03-' + 'a1B2c3D4_-'.repeat(5).slice(0, 48);
    const [detected] = KeyDetector.detectFromText(fakeKey, 'console.anthropic.com');

    const next = applyDetectedKey(LocalVault.emptyVault(), detected);
    expect(next.apiKeys['Anthropic'].tags).toContain('source:ocr');
    expect(next.apiKeys['Anthropic'].tags).toContain('domain:console.anthropic.com');
  });

  it('saving 3 different providers in sequence preserves all of them', async () => {
    let plain = LocalVault.emptyVault();

    const env = [
      `OPENAI_API_KEY=sk-live_${'a'.repeat(48)}`,
      `STRIPE_SECRET_KEY=sk_live_${'A1B2'.repeat(8)}`,
      `GROQ_API_KEY=gsk_${'g'.repeat(48)}`,
    ].join('\n');
    const detected = KeyDetector.detectFromText(env, 'paste.local');
    expect(detected.length).toBeGreaterThanOrEqual(3);

    for (const d of detected) {
      plain = applyDetectedKey(plain, d);
    }

    const cipher = await vault.encryptVault(plain, masterKey);
    await vault.putCachedCipher(cipher);
    await sync.push(vaultId, cipher);

    const remote = await sync.pull(vaultId);
    const recovered = await vault.decryptVault(remote!, masterKey);

    const providers = Object.keys(recovered.apiKeys);
    expect(providers).toContain('OpenAI');
    expect(providers).toContain('Stripe');
    expect(providers).toContain('Groq');
  });
});

// ─── 2. overwrite semantics ──────────────────────────────────────────────

describe('one-click save — overwriting an existing entry', () => {
  it('saving a new value for the same provider replaces the old one', async () => {
    const storage = memoryStorage();
    const vault = new LocalVault({ storage, crypto: cryptoBackend });
    const masterKey = await vault.deriveMasterKey(PRF_SECRET);

    const oldKey = 'sk-live_' + 'a'.repeat(48);
    const newKey = 'sk-live_' + 'b'.repeat(48);

    let plain = LocalVault.emptyVault();
    plain = applyDetectedKey(plain, KeyDetector.detectFromText(oldKey, 'd1')[0]);
    expect(plain.apiKeys['OpenAI'].value).toBe(oldKey);

    // user comes back later, pastes a rotated key
    plain = applyDetectedKey(plain, KeyDetector.detectFromText(newKey, 'd2')[0]);
    expect(plain.apiKeys['OpenAI'].value).toBe(newKey);

    // and the old one is gone
    expect(Object.keys(plain.apiKeys)).toHaveLength(1);

    // round-trip still works
    const cipher = await vault.encryptVault(plain, masterKey);
    const back = await vault.decryptVault(cipher, masterKey);
    expect(back.apiKeys['OpenAI'].value).toBe(newKey);
  });
});

// ─── 3. offline / sync-failure resilience ────────────────────────────────

describe('one-click save — offline cache fallback', () => {
  it('cache is written even when sync.push throws', async () => {
    const storage = memoryStorage();
    const vault = new LocalVault({ storage, crypto: cryptoBackend });
    const masterKey = await vault.deriveMasterKey(PRF_SECRET);
    const vaultId = await vault.deriveVaultId(PRF_SECRET);

    // sync that always fails (network down)
    const brokenSync: SyncBackend = {
      async pull() { return null; },
      async push() { throw new Error('ECONNREFUSED'); },
      async remove() {},
    };

    const fakeKey = 'sk-live_' + 'a'.repeat(48);
    const detected = KeyDetector.detectFromText(fakeKey, 'platform.openai.com')[0];
    const plain = applyDetectedKey(LocalVault.emptyVault(), detected);

    const cipher = await vault.encryptVault(plain, masterKey);

    // Production code (persist() in useVaultFlow.ts) does cache FIRST,
    // then push, swallowing the push error. We mirror that ordering.
    await vault.putCachedCipher(cipher);
    let syncFailed = false;
    try {
      await brokenSync.push(vaultId, cipher);
    } catch {
      syncFailed = true;
    }
    expect(syncFailed).toBe(true);

    // The cache must still have the cipher so the next popup open
    // can decrypt the new key.
    const cached = await vault.getCachedCipher();
    expect(cached?.ciphertext).toBe(cipher.ciphertext);
  });

  it('a stale push (older updatedAt) is rejected by the sync backend', async () => {
    const storage = memoryStorage();
    const vault = new LocalVault({ storage, crypto: cryptoBackend });
    const masterKey = await vault.deriveMasterKey(PRF_SECRET);
    const vaultId = await vault.deriveVaultId(PRF_SECRET);
    const sync = new InMemorySyncBackend();

    const fresh = await vault.encryptVault(LocalVault.emptyVault(), masterKey);
    fresh.updatedAt = 2_000_000;
    await sync.push(vaultId, fresh);

    const stale = await vault.encryptVault(LocalVault.emptyVault(), masterKey);
    stale.updatedAt = 1_000_000;

    expect(await sync.push(vaultId, stale)).toBe(false);
  });
});

// ─── 4. cross-device replay ──────────────────────────────────────────────

describe('one-click save — cross-device replay', () => {
  it('device B can pull and decrypt what device A pushed (same passkey)', async () => {
    // Device A
    const storageA = memoryStorage();
    const vaultA = new LocalVault({ storage: storageA, crypto: cryptoBackend });
    const masterKeyA = await vaultA.deriveMasterKey(PRF_SECRET);
    const vaultId = await vaultA.deriveVaultId(PRF_SECRET);
    const sync = new InMemorySyncBackend();

    const fakeKey = 'sk-live_' + 'a'.repeat(48);
    const detected = KeyDetector.detectFromText(fakeKey, 'platform.openai.com')[0];
    const plain = applyDetectedKey(LocalVault.emptyVault(), detected);

    const cipher = await vaultA.encryptVault(plain, masterKeyA);
    await sync.push(vaultId, cipher);

    // Device B — same PRF (same passkey synced via iCloud Keychain etc.)
    const storageB = memoryStorage();
    const vaultB = new LocalVault({ storage: storageB, crypto: cryptoBackend });
    const masterKeyB = await vaultB.deriveMasterKey(PRF_SECRET);
    const vaultIdB = await vaultB.deriveVaultId(PRF_SECRET);

    expect(vaultIdB).toBe(vaultId);

    const remote = await sync.pull(vaultIdB);
    expect(remote).not.toBeNull();
    const recovered = await vaultB.decryptVault(remote!, masterKeyB);
    expect(recovered.apiKeys['OpenAI'].value).toBe(fakeKey);
  });

  it('a device with a different passkey cannot read another vault', async () => {
    const sync = new InMemorySyncBackend();

    const storageA = memoryStorage();
    const vaultA = new LocalVault({ storage: storageA, crypto: cryptoBackend });
    const keyA = await vaultA.deriveMasterKey(new Uint8Array(32).fill(0x42));
    const vaultIdA = await vaultA.deriveVaultId(new Uint8Array(32).fill(0x42));

    const fakeKey = 'sk-live_' + 'a'.repeat(48);
    const plain = applyDetectedKey(
      LocalVault.emptyVault(),
      KeyDetector.detectFromText(fakeKey, 'd')[0],
    );
    const cipher = await vaultA.encryptVault(plain, keyA);
    await sync.push(vaultIdA, cipher);

    // Attacker / unrelated device
    const storageB = memoryStorage();
    const vaultB = new LocalVault({ storage: storageB, crypto: cryptoBackend });
    const keyB = await vaultB.deriveMasterKey(new Uint8Array(32).fill(0x99));
    const vaultIdB = await vaultB.deriveVaultId(new Uint8Array(32).fill(0x99));

    // First, the vault IDs differ — they don't even hit the same blob
    expect(vaultIdB).not.toBe(vaultIdA);

    // And if they somehow target the same ID, decryption fails
    const peeked = await sync.pull(vaultIdA);
    await expect(vaultB.decryptVault(peeked!, keyB)).rejects.toBeTruthy();
  });
});

// ─── 5. real-world-ish form scenario via jsdom ───────────────────────────

describe('one-click save — paste-into-form via jsdom', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('paste-into-input → detect → save → round-trip', async () => {
    document.body.innerHTML = `
      <form>
        <label>OpenAI API Key</label>
        <input id="apiKey" name="OPENAI_API_KEY" type="password" />
      </form>
    `;
    const fakeKey = 'sk-live_' + 'a'.repeat(48);
    const input = document.querySelector<HTMLInputElement>('#apiKey')!;
    input.value = fakeKey;

    // detect what the content script would see
    const detected = KeyDetector.detectFormFields();
    const openai = detected.find((d) => d.provider === 'OpenAI')!;
    expect(openai.confidence).toBeGreaterThanOrEqual(70); // fires save prompt

    // user clicks Save → upsert + persist
    const storage = memoryStorage();
    const vault = new LocalVault({ storage, crypto: cryptoBackend });
    const masterKey = await vault.deriveMasterKey(PRF_SECRET);
    const sync = new InMemorySyncBackend();
    const vaultId = await vault.deriveVaultId(PRF_SECRET);

    const next = applyDetectedKey(LocalVault.emptyVault(), openai);
    const cipher = await vault.encryptVault(next, masterKey);
    await vault.putCachedCipher(cipher);
    expect(await sync.push(vaultId, cipher)).toBe(true);

    // user reopens popup → pull cipher → decrypt → see the key in the list
    const remote = await sync.pull(vaultId);
    const back = await vault.decryptVault(remote!, masterKey);
    expect(back.apiKeys['OpenAI'].value).toBe(fakeKey);
  });
});
