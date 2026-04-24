/**
 * The popup's single source of truth for "where is the user right now?"
 *
 * States:
 *   checking   — loading persisted state on popup open
 *   firstRun   — no vault exists yet, need to register a passkey +
 *                generate a master key
 *   locked     — vault exists but this popup session hasn't unlocked it
 *   unlocked   — vault is decrypted in memory, CRUD is safe
 */

import { useCallback, useEffect, useState } from 'react';
import type { Services } from '../wiring';
import type { VaultPlain } from '../../lib/vault';
import { LocalVault } from '../../lib/vault';

export type VaultFlowState =
  | { kind: 'checking' }
  | { kind: 'firstRun' }
  | { kind: 'locked' }
  | { kind: 'unlocked'; vault: VaultPlain; masterKey: CryptoKey }
  | { kind: 'error'; message: string };

export function useVaultFlow(services: Services) {
  const [state, setState] = useState<VaultFlowState>({ kind: 'checking' });

  // Decide the starting state by reading persisted storage.
  useEffect(() => {
    (async () => {
      try {
        const existingKey = await services.vault.loadMasterKey();
        const cipher = await services.vault.getVaultCipher();
        if (!existingKey || !cipher) {
          setState({ kind: 'firstRun' });
        } else {
          setState({ kind: 'locked' });
        }
      } catch (e: any) {
        setState({ kind: 'error', message: e?.message ?? 'Load failed' });
      }
    })();
  }, [services]);

  /** Called from UnlockScreen after first-time passkey registration. */
  const completeFirstRun = useCallback(async () => {
    const masterKey = await services.vault.generateMasterKey();
    const empty = LocalVault.emptyVault();
    await services.vault.save(empty, masterKey);
    setState({ kind: 'unlocked', vault: empty, masterKey });
  }, [services]);

  /** Called from UnlockScreen after successful Face ID. */
  const unlock = useCallback(async () => {
    const masterKey = await services.vault.loadMasterKey();
    if (!masterKey) throw new Error('No master key on this device');
    const vault = await services.vault.unlock(masterKey);
    setState({ kind: 'unlocked', vault, masterKey });
  }, [services]);

  /** CRUD: add or replace an API key entry. */
  const upsertKey = useCallback(
    async (name: string, value: string, tags?: string[]) => {
      if (state.kind !== 'unlocked') return;
      const next: VaultPlain = {
        ...state.vault,
        apiKeys: {
          ...state.vault.apiKeys,
          [name]: { value, createdAt: Date.now(), tags },
        },
      };
      await services.vault.save(next, state.masterKey);
      setState({ ...state, vault: next });
    },
    [services, state],
  );

  /** CRUD: delete an API key by name. */
  const removeKey = useCallback(
    async (name: string) => {
      if (state.kind !== 'unlocked') return;
      const { [name]: _, ...rest } = state.vault.apiKeys;
      const next: VaultPlain = { ...state.vault, apiKeys: rest };
      await services.vault.save(next, state.masterKey);
      setState({ ...state, vault: next });
    },
    [services, state],
  );

  /** Lock the current popup session (does NOT revoke on-chain sessions). */
  const lock = useCallback(() => {
    setState({ kind: 'locked' });
  }, []);

  return { state, completeFirstRun, unlock, upsertKey, removeKey, lock };
}
