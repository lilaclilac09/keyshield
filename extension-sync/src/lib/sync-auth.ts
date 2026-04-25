/**
 * Client-side sync-worker auth.
 *
 *   1. registerVault(vaultId, authResult)            // POST /auth/register
 *   2. getJwt(vaultId, freshAssertionFn)            // challenge → exchange
 *
 * The `BearerHolder` caches the current JWT and exposes it via a
 * getter the `HttpSyncBackend` can call. On 401 the holder calls back
 * to a refresh function (which performs a fresh WebAuthn assertion).
 *
 * No tokens are persisted to chrome.storage — they're 15-minute
 * bearers that get re-minted from the passkey on demand.
 */

import type {
  AuthResult,
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from './auth';

export interface SyncAuthClientConfig {
  baseUrl: string;
  /** Override fetch for tests / non-browser runtimes. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface ChallengeResponse {
  challenge: string;
  expiresAt: number;
}

export interface ExchangeResponse {
  token: string;
  expiresAt: number;
}

export class SyncAuthClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(cfg: SyncAuthClientConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/$/, '');
    this.fetchImpl = cfg.fetchImpl ?? fetch.bind(globalThis);
    this.timeoutMs = cfg.timeoutMs ?? 8000;
  }

  /**
   * Register the vault on the sync backend with the attestation we
   * just got from `auth.registerPasskey`. First write wins per
   * vaultId — re-registration returns 409 from the server, which we
   * surface so the caller knows the vault was already claimed
   * (e.g. an attacker raced us, or this is actually our own vault
   * and we should switch to /auth/exchange instead).
   */
  async registerVault(vaultId: string, authResult: AuthResult): Promise<void> {
    if (
      !authResult.registrationResponseJSON ||
      !authResult.expectedChallenge
    ) {
      throw new Error(
        'AuthResult is missing registrationResponseJSON / expectedChallenge — ' +
          'pass the result of registerPasskey, not authenticateWithWebAuthn',
      );
    }
    const res = await this.request('/auth/register', 'POST', {
      vaultId,
      attestation: authResult.registrationResponseJSON,
      expectedChallenge: authResult.expectedChallenge,
    });
    if (res.status === 409) {
      throw new SyncAuthAlreadyRegistered(vaultId);
    }
    if (!res.ok) {
      throw new Error(`registerVault(${vaultId}) -> ${res.status}`);
    }
  }

  async fetchChallenge(vaultId: string): Promise<ChallengeResponse> {
    const res = await this.request('/auth/challenge', 'POST', { vaultId });
    if (!res.ok) {
      throw new Error(`fetchChallenge(${vaultId}) -> ${res.status}`);
    }
    return (await res.json()) as ChallengeResponse;
  }

  async exchange(
    vaultId: string,
    assertion: AuthenticationResponseJSON,
  ): Promise<ExchangeResponse> {
    const res = await this.request('/auth/exchange', 'POST', {
      vaultId,
      assertion,
    });
    if (!res.ok) {
      throw new Error(`exchange(${vaultId}) -> ${res.status}`);
    }
    return (await res.json()) as ExchangeResponse;
  }

  private async request(
    path: string,
    method: 'GET' | 'POST',
    body?: unknown,
  ): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(t);
    }
  }
}

export class SyncAuthAlreadyRegistered extends Error {
  constructor(public readonly vaultId: string) {
    super(`vault ${vaultId} is already registered on the sync backend`);
    this.name = 'SyncAuthAlreadyRegistered';
  }
}

// ============================================================
// BearerHolder — JWT cache with 401-driven refresh
// ============================================================

export interface BearerHolderConfig {
  /** Slack period before claimed expiry to start treating the token
   *  as expired. Default: 30 seconds. */
  earlyExpirySecs?: number;
}

/**
 * Stores the current JWT and the timestamp it expires at. A consumer
 * (typically `HttpSyncBackend`) calls `getValidToken()` before every
 * request and `markExpired()` if the server still returns 401 despite
 * a non-expired cached token.
 */
export class BearerHolder {
  private token: string | null = null;
  private expiresAt = 0;
  private readonly earlyExpiryMs: number;

  constructor(cfg: BearerHolderConfig = {}) {
    this.earlyExpiryMs = (cfg.earlyExpirySecs ?? 30) * 1000;
  }

  set(token: string, expiresAt: number): void {
    this.token = token;
    this.expiresAt = expiresAt;
  }

  /** Return the cached token if it's not (about to be) expired. */
  getValidToken(): string | null {
    if (!this.token) return null;
    if (Date.now() + this.earlyExpiryMs >= this.expiresAt) return null;
    return this.token;
  }

  markExpired(): void {
    this.token = null;
    this.expiresAt = 0;
  }
}
