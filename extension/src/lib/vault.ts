/**
 * Local encrypted vault.
 *
 * Data model (decision #1 + #2 in docs/technical/LOCAL_VAULT_ARCHITECTURE.md):
 *   - A 32-byte AES-256 master key is generated once and persisted in
 *     chrome.storage.local. Face ID / passkey gates ACCESS to this key:
 *     the extension only reads it after AuthService.authenticateWithWebAuthn
 *     succeeds. This is "方案 2 — WebAuthn 验证 + 本地主密钥".
 *   - The vault payload ({ apiKeys, settings }) is AES-GCM encrypted with
 *     the master key and stored as { iv, ciphertext, version } in
 *     chrome.storage.local. The ciphertext never leaves the device.
 *   - Devices do NOT sync vault contents — only the passkey syncs. Moving
 *     to a new device means re-importing API keys. This is the intentional
 *     trade-off per decision #2.
 */

// ==================== Types ====================

export const VAULT_STORAGE_KEY = 'keyshield.vault';
export const MASTER_KEY_STORAGE_KEY = 'keyshield.masterKey';
export const VAULT_VERSION = 1;

export interface ApiKeyRecord {
  value: string;
  createdAt: number;
  tags?: string[];
}

export interface VaultSettings {
  sessionDurationHours: number;
  promptBeforeExpiryMinutes: number;
}

/** Decrypted vault contents — stays in memory only during an unlocked session. */
export interface VaultPlain {
  apiKeys: Record<string, ApiKeyRecord>;
  settings: VaultSettings;
}

/** Encrypted-at-rest shape saved to chrome.storage.local. */
export interface VaultCipher {
  version: number;
  iv: string; // base64
  ciphertext: string; // base64
  createdAt: number;
}

/** Minimal chrome.storage.local surface we actually use. */
export interface StorageBackend {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Subset of SubtleCrypto we rely on — injectable for tests. */
export interface CryptoBackend {
  subtle: SubtleCrypto;
  getRandomValues: <T extends ArrayBufferView | null>(array: T) => T;
}

/** Wire chrome.storage.local into a StorageBackend. */
export function chromeStorageBackend(): StorageBackend {
  return {
    async get(key) {
      return new Promise((resolve) => {
        chrome.storage.local.get(key, (items) => resolve(items[key]));
      });
    },
    async set(key, value) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ [key]: value }, () => resolve());
      });
    },
    async remove(key) {
      return new Promise((resolve) => {
        chrome.storage.local.remove(key, () => resolve());
      });
    },
  };
}

export function globalCryptoBackend(): CryptoBackend {
  return {
    subtle: globalThis.crypto.subtle,
    getRandomValues: (a) => globalThis.crypto.getRandomValues(a as any) as any,
  };
}

// ==================== Base64 helpers ====================

function u8ToB64(u8: Uint8Array): string {
  // atob/btoa aren't guaranteed in service workers; use Buffer when
  // available (Node tests), fall back to manual conversion elsewhere.
  if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

function b64ToU8(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

// ==================== Vault class ====================

export interface VaultConfig {
  storage: StorageBackend;
  crypto: CryptoBackend;
}

export class LocalVault {
  constructor(private readonly cfg: VaultConfig) {}

  // ---------- Master key ----------

  /** Generate a new 32-byte master key and persist it to storage. */
  async generateMasterKey(): Promise<CryptoKey> {
    const raw = new Uint8Array(32);
    this.cfg.crypto.getRandomValues(raw);
    const key = await this.importAesKey(raw);
    await this.cfg.storage.set(MASTER_KEY_STORAGE_KEY, u8ToB64(raw));
    return key;
  }

  /**
   * Read the persisted master key from storage. Returns null if none has
   * been generated yet (first run — caller should invoke generateMasterKey).
   */
  async loadMasterKey(): Promise<CryptoKey | null> {
    const stored = await this.cfg.storage.get<string>(MASTER_KEY_STORAGE_KEY);
    if (!stored) return null;
    return this.importAesKey(b64ToU8(stored));
  }

  /** Wipe the master key AND the encrypted vault (full local reset). */
  async wipe(): Promise<void> {
    await this.cfg.storage.remove(MASTER_KEY_STORAGE_KEY);
    await this.cfg.storage.remove(VAULT_STORAGE_KEY);
  }

  private importAesKey(raw: Uint8Array): Promise<CryptoKey> {
    return this.cfg.crypto.subtle.importKey(
      'raw',
      raw as BufferSource,
      { name: 'AES-GCM', length: 256 },
      false, // not extractable
      ['encrypt', 'decrypt'],
    );
  }

  // ---------- Encrypt / decrypt ----------

  async encryptVault(plain: VaultPlain, masterKey: CryptoKey): Promise<VaultCipher> {
    const iv = new Uint8Array(12); // AES-GCM standard 96-bit IV
    this.cfg.crypto.getRandomValues(iv);
    const plaintext = new TextEncoder().encode(JSON.stringify(plain));
    const cipher = await this.cfg.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      masterKey,
      plaintext as BufferSource,
    );
    return {
      version: VAULT_VERSION,
      iv: u8ToB64(iv),
      ciphertext: u8ToB64(new Uint8Array(cipher)),
      createdAt: Date.now(),
    };
  }

  async decryptVault(cipher: VaultCipher, masterKey: CryptoKey): Promise<VaultPlain> {
    if (cipher.version !== VAULT_VERSION) {
      throw new Error(`Unsupported vault version: ${cipher.version}`);
    }
    const iv = b64ToU8(cipher.iv);
    const ct = b64ToU8(cipher.ciphertext);
    const plain = await this.cfg.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      masterKey,
      ct as BufferSource,
    );
    return JSON.parse(new TextDecoder().decode(plain)) as VaultPlain;
  }

  // ---------- Storage I/O ----------

  async getVaultCipher(): Promise<VaultCipher | null> {
    return (await this.cfg.storage.get<VaultCipher>(VAULT_STORAGE_KEY)) ?? null;
  }

  async putVaultCipher(cipher: VaultCipher): Promise<void> {
    await this.cfg.storage.set(VAULT_STORAGE_KEY, cipher);
  }

  // ---------- Convenience: unlock / update round-trips ----------

  /** Load + decrypt the vault in one call. Throws if no vault exists. */
  async unlock(masterKey: CryptoKey): Promise<VaultPlain> {
    const cipher = await this.getVaultCipher();
    if (!cipher) throw new Error('No vault exists to unlock');
    return this.decryptVault(cipher, masterKey);
  }

  /** Encrypt + write in one call. */
  async save(plain: VaultPlain, masterKey: CryptoKey): Promise<void> {
    const cipher = await this.encryptVault(plain, masterKey);
    await this.putVaultCipher(cipher);
  }

  /** Create an empty vault with defaults (first-run). */
  static emptyVault(): VaultPlain {
    return {
      apiKeys: {},
      settings: {
        sessionDurationHours: 2,
        promptBeforeExpiryMinutes: 5,
      },
    };
  }
}
