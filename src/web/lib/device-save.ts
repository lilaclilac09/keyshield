import { addEntry, isVaultUnlocked } from './vault-session';
import { registerSavingSecret } from './secret-guard';

export const DEVICE_VAULT_REQUIRED = 'Keys are saved only on this device. Unlock or create your device vault to save.';
export const DEVICE_CALL_SKIPPED = "Saved on this device. Call skipped — device-local keys aren't sent to KeyShield.";

export class DeviceVaultRequiredError extends Error {
  constructor() {
    super(DEVICE_VAULT_REQUIRED);
    this.name = 'DeviceVaultRequiredError';
  }
}

export async function saveKeyOnDevice(upstream: string, rawKey: string): Promise<void> {
  const release = registerSavingSecret(rawKey);
  try {
    if (!isVaultUnlocked()) throw new DeviceVaultRequiredError();
    if (!rawKey.trim()) throw new Error('Paste a key first');
    await addEntry(upstream, rawKey);
  } catch (err) {
    if (err instanceof DeviceVaultRequiredError) throw err;
    throw new Error('Device vault save failed. Unlock the vault and retry.');
  } finally {
    release();
  }
}
