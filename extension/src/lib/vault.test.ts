import { describe, it, expect, beforeEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  LocalVault,
  VAULT_STORAGE_KEY,
  MASTER_KEY_STORAGE_KEY,
  type StorageBackend,
  type VaultPlain,
  type CryptoBackend,
} from './vault';

/** In-memory StorageBackend for tests. */
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

// Node's webcrypto.SubtleCrypto and the DOM's SubtleCrypto differ slightly
// in their `generateKey` overloads (Node has Ed25519, DOM doesn't). We
// don't call generateKey anywhere in the vault, so cast to satisfy tsc.
const crypto: CryptoBackend = {
  subtle: webcrypto.subtle as unknown as SubtleCrypto,
  getRandomValues: <T extends ArrayBufferView | null>(a: T) =>
    webcrypto.getRandomValues(a as any) as T,
};

describe('LocalVault.generateMasterKey / loadMasterKey', () => {
  it('persists a fresh key to storage and returns a CryptoKey', async () => {
    const storage = memoryStorage();
    const v = new LocalVault({ storage, crypto });

    const k = await v.generateMasterKey();
    expect(k).toBeDefined();

    const stored = storage.data.get(MASTER_KEY_STORAGE_KEY);
    expect(typeof stored).toBe('string');
    // Base64 of 32 bytes = ~44 chars.
    expect((stored as string).length).toBeGreaterThan(40);
  });

  it('loadMasterKey returns null when no key exists yet', async () => {
    const v = new LocalVault({ storage: memoryStorage(), crypto });
    expect(await v.loadMasterKey()).toBeNull();
  });

  it('generate then load returns an equivalent key (encrypt/decrypt round-trip)', async () => {
    const storage = memoryStorage();
    const v = new LocalVault({ storage, crypto });

    const fresh = await v.generateMasterKey();
    const loaded = await v.loadMasterKey();
    expect(loaded).not.toBeNull();

    const plain = LocalVault.emptyVault();
    plain.apiKeys['openai'] = { value: 'sk-abc', createdAt: 1714000000 };

    const cipher = await v.encryptVault(plain, fresh);
    const roundTripped = await v.decryptVault(cipher, loaded!);
    expect(roundTripped).toEqual(plain);
  });
});

describe('LocalVault encrypt/decrypt', () => {
  let storage: ReturnType<typeof memoryStorage>;
  let vault: LocalVault;
  let masterKey: CryptoKey;

  beforeEach(async () => {
    storage = memoryStorage();
    vault = new LocalVault({ storage, crypto });
    masterKey = await vault.generateMasterKey();
  });

  it('round-trips an empty vault', async () => {
    const plain = LocalVault.emptyVault();
    const cipher = await vault.encryptVault(plain, masterKey);
    const decrypted = await vault.decryptVault(cipher, masterKey);
    expect(decrypted).toEqual(plain);
  });

  it('round-trips a populated vault', async () => {
    const plain: VaultPlain = {
      apiKeys: {
        openai: { value: 'sk-openai', createdAt: 1, tags: ['prod'] },
        stripe: { value: 'sk_live_stripe', createdAt: 2 },
      },
      settings: { sessionDurationHours: 2, promptBeforeExpiryMinutes: 5 },
    };
    const cipher = await vault.encryptVault(plain, masterKey);
    expect(cipher.version).toBe(1);
    expect(cipher.iv).toBeTypeOf('string');
    expect(cipher.ciphertext).toBeTypeOf('string');

    const decrypted = await vault.decryptVault(cipher, masterKey);
    expect(decrypted).toEqual(plain);
  });

  it('generates a fresh IV on every encryption (ciphertexts differ even with identical plaintext)', async () => {
    const plain = LocalVault.emptyVault();
    const a = await vault.encryptVault(plain, masterKey);
    const b = await vault.encryptVault(plain, masterKey);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('decryption throws with the wrong master key', async () => {
    const plain = LocalVault.emptyVault();
    const cipher = await vault.encryptVault(plain, masterKey);

    const otherVault = new LocalVault({ storage: memoryStorage(), crypto });
    const otherKey = await otherVault.generateMasterKey();
    await expect(vault.decryptVault(cipher, otherKey)).rejects.toBeTruthy();
  });

  it('refuses an unsupported vault version', async () => {
    const plain = LocalVault.emptyVault();
    const cipher = await vault.encryptVault(plain, masterKey);
    cipher.version = 999 as any;
    await expect(vault.decryptVault(cipher, masterKey)).rejects.toThrow(/version/);
  });
});

describe('LocalVault storage I/O', () => {
  it('putVaultCipher then getVaultCipher round-trips the same object', async () => {
    const storage = memoryStorage();
    const v = new LocalVault({ storage, crypto });
    const mk = await v.generateMasterKey();
    const cipher = await v.encryptVault(LocalVault.emptyVault(), mk);

    await v.putVaultCipher(cipher);
    expect(await v.getVaultCipher()).toEqual(cipher);
  });

  it('getVaultCipher returns null before anything is written', async () => {
    const v = new LocalVault({ storage: memoryStorage(), crypto });
    expect(await v.getVaultCipher()).toBeNull();
  });

  it('save + unlock is a clean round-trip', async () => {
    const v = new LocalVault({ storage: memoryStorage(), crypto });
    const mk = await v.generateMasterKey();
    const original = LocalVault.emptyVault();
    original.apiKeys['anthropic'] = { value: 'sk-ant-test', createdAt: 100 };

    await v.save(original, mk);
    const unlocked = await v.unlock(mk);
    expect(unlocked).toEqual(original);
  });

  it('unlock throws when no vault exists', async () => {
    const v = new LocalVault({ storage: memoryStorage(), crypto });
    const mk = await v.generateMasterKey();
    await expect(v.unlock(mk)).rejects.toThrow(/No vault/);
  });

  it('wipe removes both master key and vault cipher', async () => {
    const storage = memoryStorage();
    const v = new LocalVault({ storage, crypto });
    const mk = await v.generateMasterKey();
    await v.save(LocalVault.emptyVault(), mk);

    expect(storage.data.get(MASTER_KEY_STORAGE_KEY)).toBeDefined();
    expect(storage.data.get(VAULT_STORAGE_KEY)).toBeDefined();

    await v.wipe();
    expect(storage.data.get(MASTER_KEY_STORAGE_KEY)).toBeUndefined();
    expect(storage.data.get(VAULT_STORAGE_KEY)).toBeUndefined();
  });
});
