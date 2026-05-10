export const VAULT_KEY_MESSAGE = 'KeyShield Vault Key Derivation v1';

export async function deriveVaultPassphrase(sigBytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', sigBytes);
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}
