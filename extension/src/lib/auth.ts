/**
 * WebAuthn / passkey authentication for KeyShield.
 *
 * Migrated from disabled_extension/src/lib/auth.ts with three deliberate
 * changes:
 *   1. PBKDF2 master-password fallback removed — we are passkey-first
 *      per decision #1 in docs/technical/LOCAL_VAULT_ARCHITECTURE.md.
 *   2. `registerPasskey` added so first-run setup works without an
 *      external account system.
 *   3. Dependencies (navigator.credentials, crypto) are injectable to
 *      keep tests out of jsdom.
 */

export interface AuthResult {
  success: boolean;
  credentialId?: string;
  error?: string;
}

/**
 * Minimal surface of `navigator.credentials` + `window.PublicKeyCredential`
 * that we depend on. Tests provide a mock; production passes the real thing.
 */
export interface CredentialsProvider {
  create(options: CredentialCreationOptions): Promise<Credential | null>;
  get(options: CredentialRequestOptions): Promise<Credential | null>;
  hasPublicKeyCredential: boolean;
}

/** Default provider wiring for the browser runtime. */
export function browserCredentialsProvider(): CredentialsProvider {
  return {
    create: (opts) => navigator.credentials.create(opts),
    get: (opts) => navigator.credentials.get(opts),
    hasPublicKeyCredential:
      typeof (globalThis as any).PublicKeyCredential !== 'undefined',
  };
}

export interface AuthServiceConfig {
  credentials: CredentialsProvider;
  /** Randomness source. Defaults to globalThis.crypto if present. */
  getRandomBytes?: (len: number) => Uint8Array;
  /** Human-facing app name shown in the OS Face ID prompt. */
  rpName?: string;
  /** Relying-party ID. Use the bare domain in production, omit for extensions. */
  rpId?: string;
  /** How long the prompt may wait for user verification. */
  timeoutMs?: number;
}

export class AuthService {
  private readonly credentials: CredentialsProvider;
  private readonly randomBytes: (len: number) => Uint8Array;
  private readonly rpName: string;
  private readonly rpId?: string;
  private readonly timeoutMs: number;

  constructor(config: AuthServiceConfig) {
    this.credentials = config.credentials;
    this.randomBytes =
      config.getRandomBytes ??
      ((len) => {
        const buf = new Uint8Array(len);
        globalThis.crypto.getRandomValues(buf);
        return buf;
      });
    this.rpName = config.rpName ?? 'KeyShield';
    this.rpId = config.rpId;
    this.timeoutMs = config.timeoutMs ?? 60_000;
  }

  /**
   * Register a brand-new passkey for this user. Called once at vault
   * creation time. The credential is synced across devices by
   * iCloud / Google Password Manager if the platform supports it.
   */
  async registerPasskey(params: {
    userId: Uint8Array;
    userName: string;
    userDisplayName?: string;
  }): Promise<AuthResult> {
    if (!this.credentials.hasPublicKeyCredential) {
      return { success: false, error: 'WebAuthn not supported' };
    }
    try {
      const challenge = this.randomBytes(32);
      const credential = (await this.credentials.create({
        publicKey: {
          challenge,
          rp: { name: this.rpName, ...(this.rpId ? { id: this.rpId } : {}) },
          user: {
            id: params.userId,
            name: params.userName,
            displayName: params.userDisplayName ?? params.userName,
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 }, // ES256
            { type: 'public-key', alg: -257 }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            residentKey: 'required',
            userVerification: 'required',
          },
          timeout: this.timeoutMs,
        },
      } as any)) as (Credential & { id: string }) | null;

      if (!credential) {
        return { success: false, error: 'Registration cancelled' };
      }
      return { success: true, credentialId: credential.id };
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Registration failed' };
    }
  }

  /**
   * Prompt Face ID / Touch ID / Windows Hello and return a successful
   * AuthResult if the user verifies. Does NOT persist anything — vault
   * unlock happens in the caller after this resolves.
   */
  async authenticateWithWebAuthn(
    allowedCredentialIds?: Uint8Array[],
  ): Promise<AuthResult> {
    if (!this.credentials.hasPublicKeyCredential) {
      return { success: false, error: 'WebAuthn not supported' };
    }
    try {
      const challenge = this.randomBytes(32);
      const credential = (await this.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: (allowedCredentialIds ?? []).map((id) => ({
            type: 'public-key' as const,
            id,
          })),
          userVerification: 'required',
          timeout: this.timeoutMs,
          ...(this.rpId ? { rpId: this.rpId } : {}),
        },
      } as any)) as (Credential & { id: string }) | null;

      if (!credential) {
        return { success: false, error: 'Authentication cancelled' };
      }
      return { success: true, credentialId: credential.id };
    } catch (e: any) {
      return {
        success: false,
        error: e?.message ?? 'WebAuthn authentication failed',
      };
    }
  }

  isWebAuthnAvailable(): boolean {
    return this.credentials.hasPublicKeyCredential;
  }
}
