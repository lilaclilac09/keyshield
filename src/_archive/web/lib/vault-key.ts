/**
 * Deterministic vault-key derivation.
 * Used by WalletConnector (first login) and SettingsSection (passkey binding).
 *
 * ed25519 signatures are deterministic, so signing this fixed message
 * produces the same passphrase every session for the same wallet —
 * but unguessable without the private key.
 */

export const VAULT_KEY_MESSAGE = 'KeyShield Vault Key Derivation v1';

export async function deriveVaultPassphrase(sigBytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', sigBytes);
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}
