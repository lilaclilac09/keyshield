/**
 * Sync backend abstraction.
 *
 * Path A's whole point is that the encrypted vault lives somewhere
 * cross-device-reachable, not just on this laptop. This module defines
 * the interface and ships two implementations:
 *
 *   - InMemorySyncBackend       — for unit tests
 *   - HttpSyncBackend           — POST/GET against a KeyShield-hosted
 *                                  or self-hosted blob server
 *
 * The chosen backend is responsible only for **store + fetch by ID**.
 * Authentication and encryption happen above this layer:
 *   - Authentication: backend can require a Bearer token derived from
 *     the passkey credentialId or a session JWT — pass it in via
 *     `HttpSyncBackend.authToken`. The backend must NOT trust the
 *     vault ID alone.
 *   - Encryption: ALWAYS already done (the ciphertext stored here is
 *     AES-GCM encrypted with the PRF-derived master key).
 *
 * Conflict resolution: latest `updatedAt` wins. Backends MUST refuse
 * a push whose `updatedAt` is older than what they already store
 * (server-side compare-and-swap), to avoid an offline edit clobbering
 * a fresher one.
 */

import type { VaultCipher } from './vault';

export interface SyncBackend {
  /** Fetch the latest encrypted vault for this ID. null if absent. */
  pull(vaultId: string): Promise<VaultCipher | null>;

  /**
   * Push a new encrypted vault. Backend may reject (returning false)
   * if `cipher.updatedAt` is not strictly greater than what it already
   * has — that signals the caller to pull, merge locally, then retry.
   */
  push(vaultId: string, cipher: VaultCipher): Promise<boolean>;

  /** Best-effort delete (used by the Reset Vault flow). */
  remove(vaultId: string): Promise<void>;
}

// ==================== InMemory ====================

export class InMemorySyncBackend implements SyncBackend {
  private readonly store = new Map<string, VaultCipher>();

  async pull(vaultId: string): Promise<VaultCipher | null> {
    return this.store.get(vaultId) ?? null;
  }

  async push(vaultId: string, cipher: VaultCipher): Promise<boolean> {
    const existing = this.store.get(vaultId);
    if (existing && existing.updatedAt >= cipher.updatedAt) {
      return false; // stale write
    }
    this.store.set(vaultId, cipher);
    return true;
  }

  async remove(vaultId: string): Promise<void> {
    this.store.delete(vaultId);
  }
}

// ==================== HTTP ====================

export interface HttpSyncBackendConfig {
  /** Base URL e.g. https://sync.keyshield.dev */
  baseUrl: string;
  /**
   * Optional auth token sent as `Authorization: Bearer <token>`. The
   * backend should require this for any non-trivial deployment —
   * passing the vault ID alone in the URL is not authentication.
   */
  authToken?: string;
  /**
   * Override fetch for tests / non-browser runtimes.
   */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms. Defaults to 8 s. */
  timeoutMs?: number;
}

export class HttpSyncBackend implements SyncBackend {
  private readonly baseUrl: string;
  private readonly authToken?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(cfg: HttpSyncBackendConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/$/, '');
    this.authToken = cfg.authToken;
    this.fetchImpl = cfg.fetchImpl ?? fetch.bind(globalThis);
    this.timeoutMs = cfg.timeoutMs ?? 8000;
  }

  private async request(
    method: 'GET' | 'PUT' | 'DELETE',
    vaultId: string,
    body?: unknown,
  ): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(`${this.baseUrl}/vault/${vaultId}`, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(t);
    }
  }

  async pull(vaultId: string): Promise<VaultCipher | null> {
    const res = await this.request('GET', vaultId);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`SyncBackend.pull(${vaultId}) -> ${res.status}`);
    }
    return (await res.json()) as VaultCipher;
  }

  async push(vaultId: string, cipher: VaultCipher): Promise<boolean> {
    const res = await this.request('PUT', vaultId, cipher);
    if (res.status === 409) return false; // CAS rejected (stale write)
    if (!res.ok) {
      throw new Error(`SyncBackend.push(${vaultId}) -> ${res.status}`);
    }
    return true;
  }

  async remove(vaultId: string): Promise<void> {
    const res = await this.request('DELETE', vaultId);
    // 404 is fine — already gone.
    if (res.status !== 404 && !res.ok) {
      throw new Error(`SyncBackend.remove(${vaultId}) -> ${res.status}`);
    }
  }
}

// ==================== High-level helper ====================

/**
 * The full unlock-or-create flow, expressed as one function so the
 * popup doesn't have to orchestrate it.
 *
 *   1. Pull the latest cipher from the sync backend.
 *   2. If absent, return null (caller should create + push a new
 *      empty vault).
 *   3. If present, return the cipher to the caller for decryption.
 *
 * Falls back to the local cache only if the sync backend is
 * unreachable AND the cache exists. The caller can detect "stale"
 * by comparing `updatedAt` later, on the next successful sync.
 */
export async function fetchLatestCipher(
  vaultId: string,
  sync: SyncBackend,
  fallback?: () => Promise<VaultCipher | null>,
): Promise<{ cipher: VaultCipher | null; source: 'sync' | 'cache' | 'none' }> {
  try {
    const cipher = await sync.pull(vaultId);
    if (cipher) return { cipher, source: 'sync' };
    return { cipher: null, source: 'sync' };
  } catch {
    // Network failure — try the local cache as last resort.
    if (fallback) {
      const cached = await fallback();
      if (cached) return { cipher: cached, source: 'cache' };
    }
    return { cipher: null, source: 'none' };
  }
}
