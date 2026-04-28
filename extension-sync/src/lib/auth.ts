/**
 * WebAuthn / passkey authentication — Path A variant with **PRF support**.
 *
 * Differences vs the V1 `extension/src/lib/auth.ts`:
 *   - register and authenticate calls request the WebAuthn `prf`
 *     extension. The PRF returns a deterministic 32-byte secret tied to
 *     the passkey itself, available on every device that has the
 *     passkey synced (iCloud Keychain / Google Password Manager).
 *   - We use that secret upstream as the source for the vault's master
 *     key (see `vault.ts`) and the vault's stable cross-device ID.
 *
 * No PBKDF2 fallback. No locally-stored master key. The vault key is
 * re-derived on every unlock and never persisted.
 *
 * Browser support: Safari 17+, Chrome 116+, Firefox 119+. On older
 * browsers `prf.results.first` is undefined and authentication fails
 * with an explicit error — Path A explicitly does not fall back to
 * a locally-stored master key (that would defeat the cross-device
 * UX goal).
 */

/**
 * RegistrationResponseJSON / AuthenticationResponseJSON shapes that
 * mirror @simplewebauthn/server's expected input. Kept here as a thin
 * structural type so we don't pull the simplewebauthn package into
 * the extension bundle just for a type alias.
 */
export interface RegistrationResponseJSON {
  id: string;
  rawId: string;
  type: 'public-key';
  response: {
    clientDataJSON: string;
    attestationObject: string;
    transports?: string[];
  };
  clientExtensionResults: any;
  authenticatorAttachment?: string;
}

export interface AuthenticationResponseJSON {
  id: string;
  rawId: string;
  type: 'public-key';
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
  clientExtensionResults: any;
  authenticatorAttachment?: string;
}

export interface AuthResult {
  success: boolean;
  credentialId?: string;
  /**
   * 32-byte PRF output, undefined if the platform did not return one.
   * NEVER persist this value. Pass it to `LocalVault.deriveMasterKey`
   * inside the unlock handler and let it go out of scope.
   */
  prfSecret?: Uint8Array;
  /**
   * Base64url of the WebAuthn challenge we sent. The sync-worker uses
   * it as `expectedChallenge` when verifying the registration. Only
   * populated by `registerPasskey`.
   */
  expectedChallenge?: string;
  /** Serialised attestation, set by registerPasskey for sync-auth use. */
  registrationResponseJSON?: RegistrationResponseJSON;
  /** Serialised assertion, set by authenticateWithWebAuthn. */
  authenticationResponseJSON?: AuthenticationResponseJSON;
  error?: string;
}

// ==================== Base64url helpers ====================

function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function credentialToRegistrationJSON(
  cred: Credential & { rawId?: ArrayBuffer; response?: any; getClientExtensionResults?: () => any; type?: string; authenticatorAttachment?: string | null },
): RegistrationResponseJSON {
  const response = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: bufferToBase64Url(cred.rawId!),
    type: 'public-key',
    response: {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      attestationObject: bufferToBase64Url(response.attestationObject),
      transports:
        typeof (response as any).getTransports === 'function'
          ? (response as any).getTransports()
          : undefined,
    },
    clientExtensionResults: cred.getClientExtensionResults?.() ?? {},
    ...(cred.authenticatorAttachment
      ? { authenticatorAttachment: cred.authenticatorAttachment }
      : {}),
  };
}

function credentialToAuthenticationJSON(
  cred: Credential & { rawId?: ArrayBuffer; response?: any; getClientExtensionResults?: () => any; type?: string },
): AuthenticationResponseJSON {
  const response = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: bufferToBase64Url(cred.rawId!),
    type: 'public-key',
    response: {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      authenticatorData: bufferToBase64Url(response.authenticatorData),
      signature: bufferToBase64Url(response.signature),
      userHandle: response.userHandle
        ? bufferToBase64Url(response.userHandle)
        : undefined,
    },
    clientExtensionResults: cred.getClientExtensionResults?.() ?? {},
  };
}

export interface CredentialsProvider {
  create(options: CredentialCreationOptions): Promise<Credential | null>;
  get(options: CredentialRequestOptions): Promise<Credential | null>;
  hasPublicKeyCredential: boolean;
}

export function browserCredentialsProvider(): CredentialsProvider {
  return {
    create: (opts) => navigator.credentials.create(opts),
    get: (opts) => navigator.credentials.get(opts),
    hasPublicKeyCredential:
      typeof (globalThis as any).PublicKeyCredential !== 'undefined',
  };
}

/**
 * Constant salt fed into the PRF. The PRF spec guarantees that
 * `prf.eval(first=PRF_SALT)` returns the same 32 bytes for the same
 * passkey on any device that has the passkey synced. We rely on that
 * to derive a cross-device-stable vault key.
 *
 * Changing this value would orphan every existing vault — treat it
 * like the discriminator on a Solana account.
 */
export const PRF_SALT = new TextEncoder().encode(
  'keyshield-prf-v1:vault-master-secret',
);

export interface AuthServiceConfig {
  credentials: CredentialsProvider;
  getRandomBytes?: (len: number) => Uint8Array;
  rpName?: string;
  rpId?: string;
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
   * Register a brand-new passkey for this user. Requests the PRF
   * extension upfront so subsequent get() calls can use it. Some
   * platforms only return PRF output during a separate get() call
   * AFTER registration, so prfSecret may be undefined here even on
   * success — call authenticateWithWebAuthn() right after to get it.
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
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            residentKey: 'required',
            userVerification: 'required',
          },
          timeout: this.timeoutMs,
          extensions: { prf: { eval: { first: PRF_SALT } } },
        },
      } as any)) as (Credential & { id: string }) | null;

      if (!credential) {
        return { success: false, error: 'Registration cancelled' };
      }

      const prfSecret = extractPrfSecret(credential);
      const expectedChallenge = bufferToBase64Url(challenge);
      const registrationResponseJSON = credentialToRegistrationJSON(
        credential as any,
      );
      return {
        success: true,
        credentialId: credential.id,
        expectedChallenge,
        registrationResponseJSON,
        ...(prfSecret ? { prfSecret } : {}),
      };
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Registration failed' };
    }
  }

  /**
   * Authenticate with the platform passkey AND extract the PRF output
   * as the vault's master secret. Without prfSecret the caller cannot
   * unlock — Path A explicitly does not store a fallback master key
   * on the device.
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
          extensions: { prf: { eval: { first: PRF_SALT } } },
        },
      } as any)) as (Credential & { id: string }) | null;

      if (!credential) {
        return { success: false, error: 'Authentication cancelled' };
      }

      const prfSecret = extractPrfSecret(credential);
      if (!prfSecret) {
        return {
          success: false,
          credentialId: credential.id,
          error:
            'Browser/platform did not return a PRF output. ' +
            'KeyShield-sync requires Safari 17+, Chrome 116+, or Firefox 119+ ' +
            'with a passkey-capable authenticator.',
        };
      }
      const authenticationResponseJSON = credentialToAuthenticationJSON(
        credential as any,
      );
      return {
        success: true,
        credentialId: credential.id,
        prfSecret,
        authenticationResponseJSON,
      };
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

/**
 * Pull the 32-byte PRF output out of a PublicKeyCredential. Returns
 * undefined if the platform didn't include one.
 */
function extractPrfSecret(
  credential: Credential & { getClientExtensionResults?: () => any },
): Uint8Array | undefined {
  const ext = credential.getClientExtensionResults?.();
  const first: ArrayBuffer | undefined = ext?.prf?.results?.first;
  if (!first) return undefined;
  return new Uint8Array(first);
}
