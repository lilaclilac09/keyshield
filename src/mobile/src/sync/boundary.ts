export interface VaultCipher {
  version: number;
  iv: string;
  ciphertext: string;
  updatedAt: number;
}

export class SyncHttpError extends Error {
  constructor(public readonly status: number, operation = 'sync') {
    super(status === 428 ? 'Update KeyShield to keep syncing. Update the app and refresh.'
      : status === 409 ? `Vault changed — ${operation === 'delete' ? 'nothing was deleted; ' : ''}reload and unlock to refresh.`
      : `Vault ${operation} failed (${status}).`);
    this.name = 'SyncHttpError';
  }
}

export class UnknownRevision extends SyncHttpError {
  constructor() {
    super(428);
    this.name = 'UnknownRevision';
    this.message = 'Refresh and unlock before syncing: the server revision is unknown.';
  }
}

export class PairedSyncUnsupported extends Error {
  constructor() {
    super('Paired daily/recovery sync is disabled: atomicity is not guaranteed.');
    this.name = 'PairedSyncUnsupported';
  }
}

function validateCipher(value: VaultCipher): VaultCipher {
  if (!value || Object.keys(value).sort().join(',') !== 'ciphertext,iv,updatedAt,version'
    || !Number.isSafeInteger(value.version) || value.version < 0
    || !Number.isSafeInteger(value.updatedAt) || value.updatedAt < 0
    || typeof value.iv !== 'string' || !value.iv
    || typeof value.ciphertext !== 'string' || !value.ciphertext) {
    throw new Error('Invalid vault ciphertext envelope.');
  }
  return { version: value.version, iv: value.iv, ciphertext: value.ciphertext, updatedAt: value.updatedAt };
}

export interface MobileSyncConfig {
  baseUrl: string;
  getToken: () => string | null | Promise<string | null>;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** Ciphertext boundary only; it neither collects credentials nor decrypts vaults. */
export class MobileSyncBoundary {
  private readonly confirmed = new Map<string, VaultCipher | null>();
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: MobileSyncConfig) {
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  revision(vaultId: string): number | null | undefined {
    const cipher = this.confirmed.get(vaultId);
    return cipher === undefined ? undefined : cipher?.updatedAt ?? null;
  }

  cached(vaultId: string): VaultCipher | null | undefined {
    const cipher = this.confirmed.get(vaultId);
    return cipher ? { ...cipher } : cipher;
  }

  private async request(vaultId: string, method: string, headers: Record<string, string> = {}, body?: string) {
    const token = await this.config.getToken();
    if (!token) throw new SyncHttpError(401);
    return this.fetchImpl(`${this.config.baseUrl.replace(/\/+$/, '')}/vault/${encodeURIComponent(vaultId)}`, {
      method, headers: { Authorization: `Bearer ${token}`, ...headers },
      ...(body === undefined ? {} : { body }), cache: 'no-store',
    });
  }

  async pull(vaultId: string): Promise<VaultCipher | null> {
    const res = await this.request(vaultId, 'GET');
    if (res.status === 304) throw new UnknownRevision();
    if (res.status === 404) {
      this.confirmed.set(vaultId, null);
      return null;
    }
    if (!res.ok) throw new SyncHttpError(res.status);
    const cipher = validateCipher(await res.json() as VaultCipher);
    this.confirmed.set(vaultId, cipher);
    return { ...cipher };
  }

  private base(vaultId: string): number | null {
    const base = this.revision(vaultId);
    if (base === undefined) throw new UnknownRevision();
    return base;
  }

  async push(vaultId: string, encrypted: VaultCipher): Promise<VaultCipher> {
    const base = this.base(vaultId);
    const next = validateCipher({ ...validateCipher(encrypted), updatedAt: Math.max((this.config.now ?? Date.now)(), (base ?? -1) + 1) });
    const res = await this.request(vaultId, 'PUT', {
      'Content-Type': 'application/json',
      'X-Vault-Base-Revision': base === null ? 'none' : String(base),
    }, JSON.stringify(next));
    if (!res.ok) throw new SyncHttpError(res.status);
    this.confirmed.set(vaultId, next);
    return { ...next };
  }

  async remove(vaultId: string): Promise<void> {
    const base = this.base(vaultId);
    const res = await this.request(vaultId, 'DELETE', {
      'X-Vault-Base-Revision': base === null ? 'none' : String(base),
    });
    if (!res.ok) throw new SyncHttpError(res.status, 'delete');
    this.confirmed.set(vaultId, null);
  }

  async pushPair(..._args: unknown[]): Promise<never> { throw new PairedSyncUnsupported(); }
  async removePair(..._args: unknown[]): Promise<never> { throw new PairedSyncUnsupported(); }
}
