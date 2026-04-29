/**
 * Lit Protocol shim for the content-script.
 *
 * The real integration uses @lit-protocol/lit-node-client (already in
 * package.json) to threshold-encrypt key material against an access-control
 * condition tied to the user's wallet. That codepath isn't wired yet —
 * this shim lets content.ts compile and unit-test, while making it
 * obvious at runtime that nothing is actually being encrypted.
 *
 * When you replace this with the real client:
 *   1. Move encrypt() to call litNodeClient.encrypt({ accessControlConditions, dataToEncrypt }).
 *   2. Hold a session signature on init() — content scripts can talk to
 *      Lit nodes directly via fetch.
 *   3. Decrypt is symmetric: encryptedData + encryptedSymmetricKey →
 *      litNodeClient.decrypt(...).
 */

export interface LitAccessControl {
  conditionType: string;
  chain: string;
  method: string;
  parameters: string[];
}

export interface LitEncryptOptions {
  accessControl: LitAccessControl;
}

export interface LitEncryptResult {
  encryptedData: string;
  encryptedSymmetricKey: string;
}

export class LitProtocol {
  private ready = false;

  async init(): Promise<void> {
    // Placeholder: the real client connects to a Lit network here.
    this.ready = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[KeyShield] LitProtocol shim active — keys are NOT being encrypted. ' +
        'Wire @lit-protocol/lit-node-client before using in production.',
    );
  }

  async encrypt(plaintext: string, _opts: LitEncryptOptions): Promise<LitEncryptResult> {
    if (!this.ready) {
      throw new Error('LitProtocol.init() must be called first');
    }
    // Base64 wrapper labelled so it's clear this is NOT encryption.
    const tagged = 'lit-shim:' + plaintext;
    const enc = typeof btoa === 'function'
      ? btoa(tagged)
      : Buffer.from(tagged, 'utf-8').toString('base64');
    return {
      encryptedData: enc,
      encryptedSymmetricKey: 'shim-symmetric-key',
    };
  }

  async decrypt(encryptedData: string, _encryptedSymmetricKey: string): Promise<string> {
    if (!this.ready) {
      throw new Error('LitProtocol.init() must be called first');
    }
    const dec = typeof atob === 'function'
      ? atob(encryptedData)
      : Buffer.from(encryptedData, 'base64').toString('utf-8');
    if (!dec.startsWith('lit-shim:')) {
      throw new Error('not produced by the LitProtocol shim');
    }
    return dec.slice('lit-shim:'.length);
  }
}
