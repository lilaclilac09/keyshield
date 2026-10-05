/** Local zero-knowledge verify — passkey PRF unlocks Device Vault.

The server never sees the agent password or private key. Retrieve = Face ID /
Touch ID → PRF → AES-GCM decrypt in this tab only.
*/

import { requestVaultUnlock } from './auth';
import { isVaultUnlocked } from './vault-session';

export async function ensureVerified(): Promise<{ ok: boolean; unlocked: boolean; detail?: string }> {
  if (isVaultUnlocked()) return { ok: true, unlocked: true };
  try {
    await requestVaultUnlock();
    return { ok: isVaultUnlocked(), unlocked: isVaultUnlocked() };
  } catch (err) {
    return {
      ok: false,
      unlocked: false,
      detail: err instanceof Error ? err.message : 'passkey verify failed',
    };
  }
}
