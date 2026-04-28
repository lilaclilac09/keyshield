import { describe, it, expect, beforeEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  LocalVault,
  VAULT_STORAGE_KEY,
  type StorageBackend,
  type VaultPlain,
  type CryptoBackend,
} from './vault';

function memoryStorage(): StorageBackend & { data: Map<string, unknown> } {
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

const crypto: CryptoBackend = {
  subtle: webcrypto.subtle as unknown as SubtleCrypto,
  getRandomValues: <T extends ArrayBufferView | null>(a: T) =>
    webcrypto.getRandomValues(a as any) as T,
};

const PRF_A = new Uint8Array(32).fill(0xaa);
const PRF_B = new Uint8Array(32).fill(0xbb);

describe('LocalVault.deriveMasterKey', () => {
  it('rejects PRF inputs that are not 32 bytes', async () => {
    const v = new LocalVault({ storage: memoryStorage(), crypto });
    await expect(v.deriveMasterKey(new Uint8Array(16))).rejects.toThrow(/32/);
    await expect(v.deriveMasterKey(new Uint8Array(64))).rejects.toThrow(/32/);
  });

  it('produces a key that can encrypt/decrypt', async () => {
    const v = new LocalVault({ storage: memoryStorage(), crypto });
    const k = await v.deriveMasterKey(PRF_A);
    const plain = LocalVault.emptyVault();
    plain.apiKeys['openai'] = { value: 'sk-test', createdAt: 1 };
    const cipher = await v.encryptVault(plain, k);
    const back = await v.decryptVault(cipher, k);
    expect(back).toEqual(plain);
  });

  it('two different PRF outputs yield different keys (cross-decrypt fails)', async () => {
    const v = new LocalVault({ storage: memoryStorage(), crypto });
    const ka = await v.deriveMasterKey(PRF_A);
    const kb = await v.deriveMasterKey(PRF_B);
    const cipher = await v.encryptVault(LocalVault.emptyVault(), ka);
    await expect(v.decryptVault(cipher, kb)).rejects.toBeTruthy();
  });

  it('is deterministic — same PRF on a "different device" decrypts the same cipher', async () => {
    const deviceA = new LocalVault({ storage: memoryStorage(), crypto });
    const deviceB = new LocalVault({ storage: memoryStorage(), crypto });

    const keyA = await deviceA.deriveMasterKey(PRF_A);
    const plain: VaultPlain = {
      apiKeys: { x: { value: 'sk-x', createdAt: 1 } },
      settings: { sessionDurationHours: 2, promptBeforeExpiryMinutes: 5 },
    };
    const cipher = await deviceA.encryptVault(plain, keyA);

    const keyB = await deviceB.deriveMasterKey(PRF_A);
    const back = await deviceB.decryptVault(cipher, keyB);
    expect(back).toEqual(plain);
  });
});

describe('LocalVault.deriveVaultId', () => {
  it('rejects PRF inputs that are not 32 bytes', async () => {
    const v = new LocalVault({ storage: memoryStorage(), crypto });
    await expect(v.deriveVaultId(new Uint8Array(16))).rejects.toThrow(/32/);
  });

  it('returns a base64url-shaped string of consistent length', async () => {
    const v = new LocalVault({ storage: memoryStorage(), crypto });
    const id = await v.deriveVaultId(PRF_A);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('is deterministic — same PRF → same ID, different PRF → different ID', async () => {
    const v = new LocalVault({ storage: memoryStorage(), crypto });
    expect(await v.deriveVaultId(PRF_A)).toBe(await v.deriveVaultId(PRF_A));
    expect(await v.deriveVaultId(PRF_A)).not.toBe(await v.deriveVaultId(PRF_B));
  });
});

describe('LocalVault encrypt/decrypt', () => {
  let storage: ReturnType<typeof memoryStorage>;
  let vault: LocalVault;
  let masterKey: CryptoKey;

  beforeEach(async () => {
    storage = memoryStorage();
    vault = new LocalVault({ storage, crypto });
    masterKey = await vault.deriveMasterKey(PRF_A);
  });

  it('round-trips populated vaults', async () => {
    const plain: VaultPlain = {
      apiKeys: {
        openai: { value: 'sk-openai', createdAt: 1, tags: ['prod'] },
      },
      settings: { sessionDurationHours: 2, promptBeforeExpiryMinutes: 5 },
    };
    const cipher = await vault.encryptVault(plain, masterKey);
    const back = await vault.decryptVault(cipher, masterKey);
    expect(back).toEqual(plain);
  });

  it('generates a fresh IV on every encryption', async () => {
    const a = await vault.encryptVault(LocalVault.emptyVault(), masterKey);
    const b = await vault.encryptVault(LocalVault.emptyVault(), masterKey);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('refuses an unsupported vault version', async () => {
    const cipher = await vault.encryptVault(LocalVault.emptyVault(), masterKey);
    cipher.version = 999 as any;
    await expect(vault.decryptVault(cipher, masterKey)).rejects.toThrow(/version/);
  });

  it('updatedAt is set on every encryption', async () => {
    const before = Date.now();
    const c = await vault.encryptVault(LocalVault.emptyVault(), masterKey);
    expect(c.updatedAt).toBeGreaterThanOrEqual(before);
  });
});

describe('LocalVault cache I/O', () => {
  it('round-trips through chrome.storage.local-shaped backend', async () => {
    const storage = memoryStorage();
    const v = new LocalVault({ storage, crypto });
    const k = await v.deriveMasterKey(PRF_A);
    const cipher = await v.encryptVault(LocalVault.emptyVault(), k);

    await v.putCachedCipher(cipher);
    expect(await v.getCachedCipher()).toEqual(cipher);
    expect(storage.data.get(VAULT_STORAGE_KEY)).toEqual(cipher);
  });

  it('clearCache removes the entry', async () => {
    const storage = memoryStorage();
    const v = new LocalVault({ storage, crypto });
    const k = await v.deriveMasterKey(PRF_A);
    await v.putCachedCipher(await v.encryptVault(LocalVault.emptyVault(), k));
    await v.clearCache();
    expect(storage.data.get(VAULT_STORAGE_KEY)).toBeUndefined();
  });

  it('getCachedCipher returns null on first run', async () => {
    const v = new LocalVault({ storage: memoryStorage(), crypto });
    expect(await v.getCachedCipher()).toBeNull();
  });
});
