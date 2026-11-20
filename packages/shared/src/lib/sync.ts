/**
 * KeyShield sync — encrypted-blob transport to the Cloudflare Worker.
 *
 * The Worker is the only thing this module knows about; it's a dumb
 * pipe that does GET/PUT/DELETE on `/vault/:id` with a Bearer JWT
 * sourced from `sync-auth.ts`. The cipher payload is opaque from
 * this module's perspective — encrypt/decrypt happens upstream in
 * `vault.ts`. We never see plaintext.
 *
 * Conflict handling is intentionally split: this module surfaces a
 * 409 as `'conflict'` and otherwise hands the cipher back unchanged.
 * Conflicts require a session refresh, without automatic retry or merge.
 */
import type { VaultCipher } from './vault';

/**
 * Thrown on a 401 from the Worker. Callers should re-authenticate
 * (run the `/auth/challenge` → `/auth/exchange` round trip via
 * `sync-auth.ts`) and retry the original request.
 */
export class SyncAuthError extends Error {
  constructor(message = 'sync token rejected — re-authenticate') {
    super(message);
    this.name = 'SyncAuthError';
  }
}

export class SyncHttpError extends Error {
  constructor(public readonly status: number, statusText: string, operation: 'sync' | 'whole-vault-delete' = 'sync') {
    super(status === 428 ? 'Update KeyShield to keep syncing. Update the app and refresh.'
      : status === 409 ? operation === 'whole-vault-delete' ? 'vault changed — nothing was deleted, reload' : 'Vault changed in another tab/device. Reload and unlock to refresh.'
        : operation === 'whole-vault-delete' ? 'Whole-vault deletion failed. Refresh and try again.'
        : `sync request failed: ${status} ${statusText}`);
    this.name = 'SyncHttpError';
  }
}

export interface SyncBackend {
  /** GET /vault/:id. Returns null on 404. Throws SyncAuthError on 401. */
  pull(
    vaultId: string,
    getToken: () => string | null,
  ): Promise<VaultCipher | null>;

  /**
   * PUT /vault/:id. Returns 'ok' on 200 and 'conflict' on 409 — the
   * caller must refresh its session before retrying a conflict. Throws
   * SyncAuthError on 401.
   */
  push(
    vaultId: string,
    cipher: VaultCipher,
    getToken: () => string | null,
    baseRevision: number | null,
  ): Promise<'ok' | 'conflict'>;

  /** Whole-vault DELETE (tombstone), not a single-entry removal. */
  remove(vaultId: string, getToken: () => string | null, baseRevision: number | null): Promise<void>;
}

function authHeaders(getToken: () => string | null): Record<string, string> {
  const token = getToken();
  if (!token) {
    // Surface as auth-error so callers re-key without making a
    // round trip we know will fail.
    throw new SyncAuthError('no bearer token available');
  }
  return { Authorization: `Bearer ${token}` };
}

function vaultUrl(syncUrl: string, vaultId: string): string {
  // Trim trailing slash on syncUrl so we don't accidentally produce
  // `https://host//vault/abc`.
  const base = syncUrl.endsWith('/') ? syncUrl.slice(0, -1) : syncUrl;
  return `${base}/vault/${encodeURIComponent(vaultId)}`;
}

export function makeHttpSyncBackend(syncUrl: string): SyncBackend {
  return {
    async pull(vaultId, getToken) {
      const res = await fetch(vaultUrl(syncUrl, vaultId), {
        method: 'GET',
        headers: authHeaders(getToken),
        // Vault ciphertext is per-user secret; never let the browser
        // serve a stale cached body without re-checking with the worker.
        cache: 'no-store',
      });
      if (res.status === 404) return null;
      if (res.status === 401) throw new SyncAuthError();
      if (!res.ok) {
        throw new Error(`sync pull failed: ${res.status} ${res.statusText}`);
      }
      const json = (await res.json()) as VaultCipher;
      return json;
    },

    async push(vaultId, cipher, getToken, baseRevision) {
      const res = await fetch(vaultUrl(syncUrl, vaultId), {
        method: 'PUT',
        headers: {
          ...authHeaders(getToken),
          'Content-Type': 'application/json',
          'X-Vault-Base-Revision': baseRevision === null ? 'none' : String(baseRevision),
        },
        body: JSON.stringify(cipher),
      });
      if (res.status === 409) return 'conflict';
      if (res.status === 401) throw new SyncAuthError();
      if (!res.ok) {
        throw new SyncHttpError(res.status, res.statusText);
      }
      return 'ok';
    },

    async remove(vaultId, getToken, baseRevision) {
      const res = await fetch(vaultUrl(syncUrl, vaultId), {
        method: 'DELETE',
        headers: { ...authHeaders(getToken), 'X-Vault-Base-Revision': baseRevision === null ? 'none' : String(baseRevision) },
      });
      if (res.status === 401) throw new SyncAuthError();
      // 204 is the Worker's success; treat any 2xx as success.
      if (!res.ok && res.status !== 204) {
        throw new SyncHttpError(res.status, res.statusText, 'whole-vault-delete');
      }
    },
  };
}
