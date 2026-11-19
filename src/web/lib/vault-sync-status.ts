export const SAVE_SYNC_FAILED = 'Key NOT saved because vault sync could not be reached. Press Save again once vault sync is back.';
export const DELETE_SYNC_FAILED = 'Entry NOT deleted and is still in the vault. Delete again after vault sync returns.';
export const SAVE_SYNC_CONFLICT = 'Key NOT saved: the vault changed on another device. Reload, unlock and try again.';
export const DELETE_SYNC_CONFLICT = 'Entry NOT deleted and is still in the vault: the vault changed on another device. Reload, unlock and try again.';

function failureMessage(operation: 'save' | 'delete', reason: 'unreachable' | 'conflict') {
  if (reason === 'conflict') return operation === 'save' ? SAVE_SYNC_CONFLICT : DELETE_SYNC_CONFLICT;
  return operation === 'save' ? SAVE_SYNC_FAILED : DELETE_SYNC_FAILED;
}

let state: { outcome: 'unknown' | 'saved' | 'failed'; message: string | null } = { outcome: 'unknown', message: null };
const listeners = new Set<() => void>();

export const getVaultSyncStatus = () => state;
export const subscribeVaultSyncStatus = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function reportVaultSyncChange(operation: 'save' | 'delete', saved: boolean, reason: 'unreachable' | 'conflict' = 'unreachable') {
  state = { outcome: saved ? 'saved' : 'failed', message: saved ? null : failureMessage(operation, reason) };
  listeners.forEach(listener => listener());
}

export function dismissVaultSyncError() {
  state = { ...state, message: null };
  listeners.forEach(listener => listener());
}

export class VaultSyncChangeError extends Error {
  constructor(operation: 'save' | 'delete', reason: 'unreachable' | 'conflict' = 'unreachable') {
    super(failureMessage(operation, reason));
    this.name = 'VaultSyncChangeError';
  }
}
