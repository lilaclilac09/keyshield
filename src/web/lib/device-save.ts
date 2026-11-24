import { addEntry, isVaultUnlocked } from './vault-session';
import { containsSavingSecret, registerSavingSecret } from './secret-guard';
import type { VaultEntryMetadata } from './vault';
import { VaultSyncChangeError } from './vault-sync-status';

export const DEVICE_VAULT_REQUIRED = 'Keys are saved only on this device. Unlock or create your device vault to save.';
export const DEVICE_CALL_SKIPPED = "Saved on this device. Call skipped — device-local keys aren't sent to KeyShield.";

export class DeviceVaultRequiredError extends Error {
  constructor() {
    super(DEVICE_VAULT_REQUIRED);
    this.name = 'DeviceVaultRequiredError';
  }
}

export async function saveKeyOnDevice(upstream: string, rawKey: string, metadata: VaultEntryMetadata = {}): Promise<void> {
  const release = registerSavingSecret(rawKey);
  try {
    if (!isVaultUnlocked()) throw new DeviceVaultRequiredError();
    if (!rawKey.trim()) throw new Error('Paste a key first');
    const safeMetadata: VaultEntryMetadata = {};
    for (const field of ['name', 'expiresAt', 'domain'] as const) {
      const value = metadata[field];
      if (typeof value !== 'string' || !value.trim()) continue;
      if (!containsSavingSecret(value)) safeMetadata[field] = value;
      else if (field === 'name') safeMetadata.name = rawKey.length > 12 ? `${rawKey.slice(0, 6)}…${rawKey.slice(-4)}` : '••••';
    }
    await addEntry(upstream, rawKey, safeMetadata);
  } catch (err) {
    if (err instanceof DeviceVaultRequiredError || err instanceof VaultSyncChangeError) throw err;
    throw new Error('Device vault save failed. Unlock the vault and retry.');
  } finally {
    release();
  }
}
