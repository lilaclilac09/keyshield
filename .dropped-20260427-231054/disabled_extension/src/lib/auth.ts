/**
 * Off-Chain Authentication
 * Supports WebAuthn (biometric) and master password (PBKDF2)
 */

export interface AuthResult {
  success: boolean;
  sessionToken?: string;
  error?: string;
}

export interface MasterPasswordConfig {
  password: string;
  salt?: Uint8Array;
  iterations?: number;
}

export class AuthService {
  private static readonly SESSION_DURATION = 30 * 60 * 1000; // 30 minutes
  private static readonly PBKDF2_ITERATIONS = 100000;
  private static readonly PBKDF2_KEY_LENGTH = 256;

  /**
   * Authenticate using WebAuthn (biometric)
   */
  static async authenticateWithWebAuthn(): Promise<AuthResult> {
    try {
      // Check if WebAuthn is available
      if (!navigator.credentials || !navigator.credentials.get) {
        return {
          success: false,
          error: 'WebAuthn not supported',
        };
      }

      // Generate challenge
      const challenge = crypto.getRandomValues(new Uint8Array(32));

      // Request credential
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [],
          userVerification: 'required',
          timeout: 60000,
        },
      });

      if (!credential) {
        return {
          success: false,
          error: 'Authentication cancelled',
        };
      }

      // Generate session token
      const sessionToken = await this.generateSessionToken(credential.id);

      return {
        success: true,
        sessionToken,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'WebAuthn authentication failed',
      };
    }
  }

  /**
   * Authenticate using master password
   */
  static async authenticateWithPassword(
    password: string,
    storedHash?: string
  ): Promise<AuthResult> {
    try {
      if (!password || password.length < 8) {
        return {
          success: false,
          error: 'Password must be at least 8 characters',
        };
      }

      // If verifying against stored hash
      if (storedHash) {
        const isValid = await this.verifyPassword(password, storedHash);
        if (!isValid) {
          return {
            success: false,
            error: 'Invalid password',
          };
        }
      }

      // Generate session token from password
      const sessionToken = await this.generateSessionTokenFromPassword(password);

      return {
        success: true,
        sessionToken,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Password authentication failed',
      };
    }
  }

  /**
   * Set master password (first time setup)
   */
  static async setMasterPassword(password: string): Promise<string> {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    // Generate salt
    const salt = crypto.getRandomValues(new Uint8Array(16));

    // Derive key
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const hash = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: this.PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      this.PBKDF2_KEY_LENGTH
    );

    // Combine salt and hash for storage
    const combined = new Uint8Array(salt.length + hash.byteLength);
    combined.set(salt);
    combined.set(new Uint8Array(hash), salt.length);

    // Return as base64 for storage
    return btoa(String.fromCharCode(...combined));
  }

  /**
   * Verify password against stored hash
   */
  static async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    try {
      // Decode stored hash
      const combined = Uint8Array.from(atob(storedHash), c => c.charCodeAt(0));
      const salt = combined.slice(0, 16);
      const storedHashBytes = combined.slice(16);

      // Derive key from password
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
      );

      const derivedHash = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt,
          iterations: this.PBKDF2_ITERATIONS,
          hash: 'SHA-256',
        },
        keyMaterial,
        this.PBKDF2_KEY_LENGTH
      );

      // Compare hashes
      const derivedArray = new Uint8Array(derivedHash);
      if (derivedArray.length !== storedHashBytes.length) {
        return false;
      }

      for (let i = 0; i < derivedArray.length; i++) {
        if (derivedArray[i] !== storedHashBytes[i]) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Password verification failed:', error);
      return false;
    }
  }

  /**
   * Generate session token from credential ID
   */
  private static async generateSessionToken(credentialId: string): Promise<string> {
    const data = new TextEncoder().encode(
      `${credentialId}:${Date.now()}:${crypto.getRandomValues(new Uint8Array(16)).join(',')}`
    );
    const hash = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)));
  }

  /**
   * Generate session token from password
   */
  private static async generateSessionTokenFromPassword(password: string): Promise<string> {
    const data = new TextEncoder().encode(
      `${password}:${Date.now()}:${crypto.getRandomValues(new Uint8Array(16)).join(',')}`
    );
    const hash = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)));
  }

  /**
   * Check if session is valid
   */
  static isSessionValid(expiresAt: number): boolean {
    return expiresAt > Date.now();
  }

  /**
   * Get session expiration time
   */
  static getSessionExpiration(): number {
    return Date.now() + this.SESSION_DURATION;
  }

  /**
   * Check if WebAuthn is available
   */
  static isWebAuthnAvailable(): boolean {
    return !!(
      navigator.credentials &&
      navigator.credentials.get &&
      window.PublicKeyCredential
    );
  }
}
