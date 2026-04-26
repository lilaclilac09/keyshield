/**
 * Local encrypted vault — Path A variant.
 *
 * Differences vs the V1 `extension/src/lib/vault.ts`:
 *   - The master key is **derived from the WebAuthn PRF output** via
 *     HKDF, not generated randomly and stored locally. Every device
 *     with the same passkey derives the same master key.
 *   - We expose `deriveVaultId` so the same passkey produces a stable
 *     ID to address the ciphertext on the sync backend (see sync.ts).
 *   - The local store (`chrome.storage.local`) holds only the most
 *     recently fetched ciphertext as a cache for instant unlock. The
 *     authoritative copy lives in the sync backend.
 *
 * Why two derived values? A single 32-byte PRF output is split via
 * HKDF into:
 *   - the AES-256-GCM master key (info = "encryption-key")
 *   - a stable 16-byte vault ID (info = "vault-id"), base64url'd
 *
 * Different `info` strings mean the AES key cannot be inferred from
 * the public vault ID and vice versa.
 */

// ==================== Types ====================

export const VAULT_STORAGE_KEY = 'keyshield-sync.vault-cache';
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

export interface VaultPlain {
  apiKeys: Record<string, ApiKeyRecord>;
  /**
   * V1.1+: tombstones for delete-vs-edit conflict resolution.
   * Maps key name → unix-ms timestamp the deletion happened.
   * - When merging across devices, a tombstone with `deletedAt` >
   *   the active record's `createdAt` suppresses the record.
   * - Once a key is re-added (upsertKey), its tombstone is cleared.
   * Optional so legacy V1 vaults round-trip unchanged.
   */
  deletedKeys?: Record<string, number>;
  settings: VaultSettings;
}

/**
 * Wrapped recovery seed (V2+). Devices with the synced passkey
 * unwrap with their PRF output; recovery via 24-word phrase bypasses
 * this entirely. Written by `seed-envelope.ts`.
 */
export interface SeedEnvelope {
  iv: string; // base64
  ciphertext: string; // base64
}

export interface VaultCipher {
  version: number;
  iv: string; // base64
  ciphertext: string; // base64
  /** Wall-clock timestamp set on every encryption — used for sync
   *  conflict resolution: latest-write-wins. */
  updatedAt: number;
  /** V2-and-up: PRF-wrapped vault seed enabling 24-word recovery.
   *  Absent on legacy V1 ciphers (no recovery path). */
  seedEnvelope?: SeedEnvelope;
}

export interface StorageBackend {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface CryptoBackend {
  subtle: SubtleCrypto;
  getRandomValues: <T extends ArrayBufferView | null>(array: T) => T;
}

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

function u8ToB64Url(u8: Uint8Array): string {
  return u8ToB64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ==================== Vault class ====================

export interface VaultConfig {
  storage: StorageBackend;
  crypto: CryptoBackend;
}

export class LocalVault {
  constructor(private readonly cfg: VaultConfig) {}

  // ---------- Master key (derived, not stored) ----------

  /**
   * HKDF-derive a non-extractable AES-256-GCM key from a 32-byte PRF
   * output. Called fresh on every authenticate; the resulting CryptoKey
   * is unwrappable / unexportable so even our own code can't read its
   * raw bytes.
   */
  async deriveMasterKey(prfSecret: Uint8Array): Promise<CryptoKey> {
    if (prfSecret.length !== 32) {
      throw new Error(
        `PRF secret must be 32 bytes, got ${prfSecret.length}`,
      );
    }
    const ikm = await this.cfg.crypto.subtle.importKey(
      'raw',
      prfSecret as BufferSource,
      'HKDF',
      false,
      ['deriveKey'],
    );
    return this.cfg.crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(),
        info: new TextEncoder().encode('keyshield-prf-v1:encryption-key'),
      },
      ikm,
      { name: 'AES-GCM', length: 256 },
      false, // not extractable
      ['encrypt', 'decrypt'],
    );
  }

  /**
   * HKDF-derive a stable 16-byte vault ID (URL-safe base64) from the
   * same PRF output. Same passkey → same ID on every device.
   */
  async deriveVaultId(prfSecret: Uint8Array): Promise<string> {
    if (prfSecret.length !== 32) {
      throw new Error(
        `PRF secret must be 32 bytes, got ${prfSecret.length}`,
      );
    }
    const ikm = await this.cfg.crypto.subtle.importKey(
      'raw',
      prfSecret as BufferSource,
      'HKDF',
      false,
      ['deriveBits'],
    );
    const bits = await this.cfg.crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(),
        info: new TextEncoder().encode('keyshield-prf-v1:vault-id'),
      },
      ikm,
      128, // 16 bytes
    );
    return u8ToB64Url(new Uint8Array(bits));
  }

  // ---------- Encrypt / decrypt ----------

  async encryptVault(plain: VaultPlain, masterKey: CryptoKey): Promise<VaultCipher> {
    const iv = new Uint8Array(12);
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
      updatedAt: Date.now(),
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

  // ---------- Local cache I/O (NOT authoritative) ----------

  /**
   * Local cache only — used for instant unlock when the sync backend
   * is unreachable. Always treat the sync backend's copy as
   * authoritative if both exist (latest-`updatedAt` wins).
   */
  async getCachedCipher(): Promise<VaultCipher | null> {
    return (await this.cfg.storage.get<VaultCipher>(VAULT_STORAGE_KEY)) ?? null;
  }

  async putCachedCipher(cipher: VaultCipher): Promise<void> {
    await this.cfg.storage.set(VAULT_STORAGE_KEY, cipher);
  }

  async clearCache(): Promise<void> {
    await this.cfg.storage.remove(VAULT_STORAGE_KEY);
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
