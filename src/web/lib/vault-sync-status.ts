export const SAVE_SYNC_FAILED = 'Key NOT saved because vault sync could not be reached. Press Save again once vault sync is back.';
export const DELETE_SYNC_FAILED = 'Entry NOT deleted and is still in the vault. Delete again after vault sync returns.';

let state: { outcome: 'unknown' | 'saved' | 'failed'; message: string | null } = { outcome: 'unknown', message: null };
const listeners = new Set<() => void>();

export const getVaultSyncStatus = () => state;
export const subscribeVaultSyncStatus = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function reportVaultSyncChange(operation: 'save' | 'delete', saved: boolean) {
  state = { outcome: saved ? 'saved' : 'failed', message: saved ? null : operation === 'save' ? SAVE_SYNC_FAILED : DELETE_SYNC_FAILED };
  listeners.forEach(listener => listener());
}

export function dismissVaultSyncError() {
  state = { ...state, message: null };
  listeners.forEach(listener => listener());
}

export class VaultSyncChangeError extends Error {
  constructor(operation: 'save' | 'delete') {
    super(operation === 'save' ? SAVE_SYNC_FAILED : DELETE_SYNC_FAILED);
    this.name = 'VaultSyncChangeError';
  }
}
