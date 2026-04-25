/**
 * Session state in the extension.
 *
 * This is the extension-side counterpart of
 * packages/agent-sdk/src/session.ts:
 *   - agent-sdk builds & decodes on-chain instructions (the source of truth)
 *   - this module persists the CURRENT device's session to
 *     chrome.storage.session so background-script restarts don't force
 *     an extra Face ID prompt WITHIN one OS session, while still being
 *     cleared on browser restart (decision #7, "方案 X")
 *
 * The ephemeral private key never touches chrome.storage. When the
 * service worker is killed, the key is lost and the next call re-
 * creates a session (which costs one Face ID prompt). This is the
 * safety / UX trade we made.
 */

import type { Keypair, PublicKey, Connection } from '@solana/web3.js';

export const SESSION_STORAGE_KEY = 'keyshield.session';

export interface SessionState {
  /** Base58 of the ephemeral agent pubkey used to sign during this session. */
  ephemeralPubkey: string;
  /** Unix seconds. 0 means "no expiry" (rare). */
  expiresAt: number;
  /** Unix seconds — when the session was granted. */
  createdAt: number;
  /** The device that opened this session (for the "active sessions" UI). */
  deviceLabel: string;
}

/** Same minimal storage surface as vault.ts — reused. */
export interface SessionStorageBackend {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Back by chrome.storage.session (cleared on browser restart, not idle). */
export function chromeSessionStorageBackend(): SessionStorageBackend {
  return {
    async get(key) {
      return new Promise((resolve) => {
        chrome.storage.session.get(key, (items) => resolve(items[key]));
      });
    },
    async set(key, value) {
      return new Promise((resolve) => {
        chrome.storage.session.set({ [key]: value }, () => resolve());
      });
    },
    async remove(key) {
      return new Promise((resolve) => {
        chrome.storage.session.remove(key, () => resolve());
      });
    },
  };
}

export interface ExtensionSessionConfig {
  storage: SessionStorageBackend;
  /** How long a fresh session lives. Defaults to 2 hours (decision #3). */
  defaultDurationSecs?: number;
  /** How early to warn the user before expiry. Defaults to 5 minutes. */
  warnBeforeExpirySecs?: number;
  /** For tests — inject a clock. */
  now?: () => number; // unix seconds
}

/**
 * High-level session state manager for the extension popup / background.
 * Does NOT sign transactions itself — call the agent-sdk SessionManager
 * to build/send grant/revoke transactions, then `setSession` here to
 * persist local bookkeeping.
 */
export class ExtensionSession {
  private readonly storage: SessionStorageBackend;
  private readonly defaultDurationSecs: number;
  private readonly warnBeforeExpirySecs: number;
  private readonly now: () => number;

  constructor(cfg: ExtensionSessionConfig) {
    this.storage = cfg.storage;
    this.defaultDurationSecs = cfg.defaultDurationSecs ?? 2 * 60 * 60;
    this.warnBeforeExpirySecs = cfg.warnBeforeExpirySecs ?? 5 * 60;
    this.now = cfg.now ?? (() => Math.floor(Date.now() / 1000));
  }

  /** Read the persisted session, if any. */
  async getSession(): Promise<SessionState | null> {
    return (await this.storage.get<SessionState>(SESSION_STORAGE_KEY)) ?? null;
  }

  /** Persist a new session (call after a successful on-chain grant). */
  async setSession(state: SessionState): Promise<void> {
    await this.storage.set(SESSION_STORAGE_KEY, state);
  }

  /** Wipe the local session record. Does NOT revoke on chain. */
  async clearSession(): Promise<void> {
    await this.storage.remove(SESSION_STORAGE_KEY);
  }

  /** true iff there is a session and it hasn't expired yet. */
  async isUnlocked(): Promise<boolean> {
    const s = await this.getSession();
    if (!s) return false;
    if (s.expiresAt === 0) return true;
    return this.now() < s.expiresAt;
  }

  /**
   * How many seconds remain on the current session, or null if no session.
   * Returns 0 when already expired.
   */
  async secondsRemaining(): Promise<number | null> {
    const s = await this.getSession();
    if (!s) return null;
    if (s.expiresAt === 0) return Number.POSITIVE_INFINITY;
    return Math.max(0, s.expiresAt - this.now());
  }

  /**
   * true when the session is within `warnBeforeExpirySecs` of expiring.
   * Useful for wiring the "your session expires in 5 minutes" nudge.
   */
  async isNearExpiry(): Promise<boolean> {
    const remaining = await this.secondsRemaining();
    if (remaining === null) return false;
    if (remaining === Number.POSITIVE_INFINITY) return false;
    return remaining <= this.warnBeforeExpirySecs && remaining > 0;
  }

  /**
   * Compute a SessionState from a successful grant. The caller does the
   * actual on-chain grant; this just records the result.
   */
  buildStateFromGrant(params: {
    ephemeralPubkey: string;
    durationSecs?: number;
    deviceLabel: string;
  }): SessionState {
    const createdAt = this.now();
    const duration = params.durationSecs ?? this.defaultDurationSecs;
    return {
      ephemeralPubkey: params.ephemeralPubkey,
      deviceLabel: params.deviceLabel,
      createdAt,
      expiresAt: duration > 0 ? createdAt + duration : 0,
    };
  }
}
