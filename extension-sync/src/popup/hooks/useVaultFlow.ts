/**
 * Path A vault flow.
 *
 * One pass through the user's day with this hook:
 *
 *   first-time on a brand-new device →
 *      registerPasskey → authenticate → derive PRF → derive vaultId
 *      → pull from sync backend
 *         → present? unlock with the existing ciphertext (this is the
 *            "iCloud Keychain new-device" moment)
 *         → absent?  create empty vault, push to sync
 *
 *   subsequent unlocks →
 *      authenticate → derive PRF → derive vaultId
 *      → pull from sync (fall back to local cache if offline)
 *      → decrypt
 *
 *   any vault edit →
 *      encrypt → cache locally → push to sync (latest-wins)
 *
 * The PRF secret only ever lives in this hook's call stack; it is
 * passed into the LocalVault to derive a non-extractable CryptoKey
 * and then dropped. We deliberately do NOT keep prfSecret in React
 * state.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Services } from '../wiring';
import type { VaultPlain, VaultCipher } from '../../lib/vault';
import { LocalVault, VAULT_VERSION } from '../../lib/vault';
import type { AuthResult } from '../../lib/auth';
import { fetchLatestCipher } from '../../lib/sync';
import { detectPrfSupport } from '../../lib/platform';
import {
  applyResolutions,
  findConflicts,
  type ConflictChoice,
  type ConflictReport,
} from '../../lib/conflict';
import { generateMnemonic, mnemonicToSeed, seedToMnemonic } from '../../lib/mnemonic';
import { generateSeed, unwrapSeed, wrapSeed } from '../../lib/seed-envelope';

export type VaultFlowState =
  | { kind: 'checking' }
  | { kind: 'unsupportedPlatform' }
  | { kind: 'firstRun' }
  | { kind: 'restore' }
  | { kind: 'locked' }
  | {
      /**
       * Right after a brand-new vault is created. The popup shows
       * the 24-word recovery phrase and asks the user to confirm
       * they've saved it before transitioning to 'unlocked'.
       */
      kind: 'showMnemonic';
      mnemonic: string;
      vault: VaultPlain;
      masterKey: CryptoKey;
      vaultId: string;
    }
  | {
      kind: 'unlocked';
      vault: VaultPlain;
      masterKey: CryptoKey;
      vaultId: string;
    }
  | { kind: 'error'; message: string };

/**
 * When `persist` hits a 409 with non-trivial conflicts, the popup
 * surfaces this to the user. The hook stores the report and a
 * resolver fn that the ConflictDialog will call.
 */
export interface PendingConflict {
  report: ConflictReport;
  resolve: (resolutions: Record<string, ConflictChoice>) => void;
  cancel: () => void;
}

export function useVaultFlow(services: Services) {
  const [state, setState] = useState<VaultFlowState>({ kind: 'checking' });
  const [pendingConflict, setPendingConflict] = useState<PendingConflict | null>(null);
  // Bumped by retryPlatformCheck() to force a re-detect.
  const [probeNonce, setProbeNonce] = useState(0);

  // Initial state: probe platform support first, then look at local
  // cache. 'unknown' falls through to the normal flow — the user will
  // get a more specific error at the actual authenticate call if PRF
  // really isn't there.
  useEffect(() => {
    (async () => {
      try {
        const support = await detectPrfSupport();
        if (support === 'unsupported') {
          setState({ kind: 'unsupportedPlatform' });
          return;
        }
        const cached = await services.vault.getCachedCipher();
        setState({ kind: cached ? 'locked' : 'firstRun' });
      } catch (e: any) {
        setState({ kind: 'error', message: e?.message ?? 'Load failed' });
      }
    })();
  }, [services, probeNonce]);

  /** UpgradeScreen calls this — re-run the platform probe in case the
   *  user upgraded their browser since the popup opened. */
  const retryPlatformCheck = useCallback(() => {
    setState({ kind: 'checking' });
    setProbeNonce((n) => n + 1);
  }, []);

  /**
   * Shared post-authenticate handler.
   *
   * V2 happy path:
   *   1. Pull the cipher from sync.
   *   2. If it has a seedEnvelope, unwrap it with the PRF output
   *      → seed → derive K, V → decrypt vault.
   *   3. If absent (legacy V1 cipher OR brand-new vault), fall back
   *      to deriving K, V directly from PRF.
   *   4. If the cipher does not yet exist anywhere (truly first
   *      device ever), generate a fresh seed, wrap it under PRF,
   *      encrypt an empty vault, push, and surface the recovery
   *      phrase via the 'showMnemonic' state. Subsequent devices
   *      with the same passkey skip the mnemonic display entirely
   *      because they pull the existing cipher.
   *
   * The PRF secret only ever lives in this call stack.
   */
  const finalizeUnlock = useCallback(
    async (authResult: AuthResult, opts: { showMnemonicOnNew: boolean }): Promise<void> => {
      if (!authResult.success || !authResult.prfSecret) {
        throw new Error(
          authResult.error ?? 'Authentication did not return a PRF secret',
        );
      }

      // Try the V2 path: derive a *temporary* PRF-only ID for token
      // exchange + cipher pull. If a v2 cipher exists, we'll re-derive
      // ID and key from the seed inside it. If only a v1 cipher
      // exists, the PRF-derived ID matches.
      const prfDerivedVaultId = await services.vault.deriveVaultId(authResult.prfSecret);

      // Mint a fresh sync-worker JWT.
      if (services.syncAuth && authResult.authenticationResponseJSON) {
        try {
          const exchanged = await services.syncAuth.exchange(
            prfDerivedVaultId,
            authResult.authenticationResponseJSON,
          );
          services.bearer.set(exchanged.token, exchanged.expiresAt);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[KeyShield] /auth/exchange failed:', e);
        }
      }

      const { cipher: remote, source } = await fetchLatestCipher(
        prfDerivedVaultId,
        services.sync,
        () => services.vault.getCachedCipher(),
      );

      let vault: VaultPlain;
      let masterKey: CryptoKey;
      let vaultId: string;
      let resultingCipher: VaultCipher;
      let mnemonicToShow: string | null = null;

      if (remote && remote.seedEnvelope) {
        // V2 path: unwrap seed, derive from seed.
        const seed = await unwrapSeed(
          remote.seedEnvelope,
          authResult.prfSecret,
          services.vault['cfg'].crypto,
        );
        masterKey = await services.vault.deriveMasterKey(seed);
        vaultId = await services.vault.deriveVaultId(seed);
        vault = await services.vault.decryptVault(remote, masterKey);
        resultingCipher = remote;
      } else if (remote) {
        // Legacy V1 cipher (no envelope). Derive from PRF directly.
        masterKey = await services.vault.deriveMasterKey(authResult.prfSecret);
        vaultId = prfDerivedVaultId;
        vault = await services.vault.decryptVault(remote, masterKey);
        resultingCipher = remote;
      } else {
        // First time anywhere — create the v2 vault.
        const seed = generateSeed(services.vault['cfg'].crypto);
        masterKey = await services.vault.deriveMasterKey(seed);
        vaultId = await services.vault.deriveVaultId(seed);
        vault = LocalVault.emptyVault();
        const baseCipher = await services.vault.encryptVault(vault, masterKey);
        const envelope = await wrapSeed(
          seed,
          authResult.prfSecret,
          services.vault['cfg'].crypto,
        );
        resultingCipher = {
          ...baseCipher,
          version: VAULT_VERSION,
          seedEnvelope: envelope,
        };
        // Surface the mnemonic to the user before pushing — they
        // need to write it down to recover.
        mnemonicToShow = seedToMnemonic(seed);
        try {
          await services.sync.push(vaultId, resultingCipher);
        } catch {
          // Offline first-run: cache wins for now, push catches up.
        }
      }

      await services.vault.putCachedCipher(resultingCipher);
      // eslint-disable-next-line no-console
      console.info(`[KeyShield] unlocked from ${source}`);

      if (mnemonicToShow && opts.showMnemonicOnNew) {
        setState({
          kind: 'showMnemonic',
          mnemonic: mnemonicToShow,
          vault,
          masterKey,
          vaultId,
        });
      } else {
        setState({ kind: 'unlocked', vault, masterKey, vaultId });
      }
    },
    [services],
  );

  /** Called from UnlockScreen after first-time passkey registration.
   *  Registers the vault on the sync backend, then unlocks. */
  const completeFirstRun = useCallback(
    async (registrationResult: AuthResult): Promise<void> => {
      // Some platforms only return PRF on a subsequent get() call —
      // do an explicit authenticate right after registration to be sure.
      const haveSecret =
        registrationResult.success && !!registrationResult.prfSecret;
      const authResult = haveSecret
        ? registrationResult
        : await services.auth.authenticateWithWebAuthn();

      // Push the attestation to the sync worker so future devices can
      // /auth/exchange against it. If a syncAuth client isn't
      // configured (in-memory sync), we skip this entirely.
      if (services.syncAuth && registrationResult.prfSecret) {
        const vaultId = await services.vault.deriveVaultId(
          registrationResult.prfSecret,
        );
        try {
          await services.syncAuth.registerVault(vaultId, registrationResult);
        } catch (e: any) {
          // 409 → vault already registered on the backend (likely the
          // user re-installed). That's recoverable: just skip and fall
          // through to authenticate + exchange below.
          if (e?.name !== 'SyncAuthAlreadyRegistered') {
            // eslint-disable-next-line no-console
            console.warn('[KeyShield] /auth/register failed:', e);
          }
        }
      }

      await finalizeUnlock(authResult, { showMnemonicOnNew: true });
    },
    [services, finalizeUnlock],
  );

  /** Called from UnlockScreen after the locked-state Face ID. */
  const unlock = useCallback(
    async (authResult: AuthResult): Promise<void> => {
      await finalizeUnlock(authResult, { showMnemonicOnNew: false });
    },
    [finalizeUnlock],
  );

  /** From the RestoreScreen — switch into the restore-from-mnemonic
   *  flow. Doesn't need a passkey at all. */
  const startRestore = useCallback(() => {
    setState({ kind: 'restore' });
  }, []);

  /** Cancel restore, go back to firstRun. */
  const cancelRestore = useCallback(() => {
    setState({ kind: 'firstRun' });
  }, []);

  /**
   * Recover the vault from a 24-word phrase. No passkey is required
   * — the mnemonic IS the root of trust. After a successful restore
   * the user should register a passkey so subsequent unlocks don't
   * require typing the phrase; that's handled by a follow-up
   * registerPasskey call which will write a fresh seedEnvelope.
   */
  const restoreFromMnemonic = useCallback(
    async (phrase: string): Promise<void> => {
      const seed = mnemonicToSeed(phrase); // throws InvalidMnemonicError
      const masterKey = await services.vault.deriveMasterKey(seed);
      const vaultId = await services.vault.deriveVaultId(seed);

      // We don't have a JWT yet (no PRF assertion) so HttpSyncBackend
      // calls will 401. For Path A V1.1 we accept that recovery
      // requires the user to also re-register a passkey afterwards;
      // until they do, the popup runs in "in-memory only" mode using
      // the local cache.
      let cipher = await services.vault.getCachedCipher();
      try {
        const { cipher: remote } = await fetchLatestCipher(
          vaultId,
          services.sync,
          () => services.vault.getCachedCipher(),
        );
        if (remote) cipher = remote;
      } catch {
        /* offline — keep cache */
      }

      if (!cipher) {
        throw new Error(
          'No vault found for this recovery phrase. Either the phrase ' +
            'is from a different vault, or the vault has not synced yet.',
        );
      }

      const vault = await services.vault.decryptVault(cipher, masterKey);
      await services.vault.putCachedCipher(cipher);
      setState({ kind: 'unlocked', vault, masterKey, vaultId });
    },
    [services],
  );

  /**
   * Save a new vault state both locally and to the sync backend.
   *
   * Happy path: encrypt + push. Done.
   *
   * Stale-write path (409): we pull the latest, find per-key
   * conflicts, and:
   *   - if there are NO real conflicts (e.g. another device added
   *     a different key), silently merge and re-push.
   *   - if there ARE conflicts, raise a PendingConflict the popup
   *     resolves via a ConflictDialog. The promise returned from
   *     persist resolves once the user picks (or cancels — in
   *     which case we keep the user's intended state in memory
   *     but skip the re-push so the remote stays untouched).
   */
  const persist = useCallback(
    async (next: VaultPlain, masterKey: CryptoKey, vaultId: string): Promise<VaultPlain> => {
      const cipher = await services.vault.encryptVault(next, masterKey);
      await services.vault.putCachedCipher(cipher);
      let ok = false;
      try {
        ok = await services.sync.push(vaultId, cipher);
      } catch {
        // Offline — local cache is still updated, sync catches up later.
        return next;
      }
      if (ok) return next;

      // Stale-write — pull, diff, decide.
      const fresh = await services.sync.pull(vaultId);
      if (!fresh) {
        // 409 with no remote? Backend bug or race; treat as resolved.
        return next;
      }
      const remote = await services.vault.decryptVault(fresh, masterKey);
      const report = findConflicts(next, remote);

      if (report.conflicts.length === 0) {
        // Pure additive merge — no user input needed.
        const merged = report.baseline;
        const retryCipher = await services.vault.encryptVault(merged, masterKey);
        await services.vault.putCachedCipher(retryCipher);
        await services.sync.push(vaultId, retryCipher);
        return merged;
      }

      // Real conflict — wait on the ConflictDialog.
      return new Promise<VaultPlain>((resolve) => {
        setPendingConflict({
          report,
          resolve: async (resolutions) => {
            const merged = applyResolutions(report, resolutions);
            try {
              const retryCipher = await services.vault.encryptVault(
                merged,
                masterKey,
              );
              await services.vault.putCachedCipher(retryCipher);
              await services.sync.push(vaultId, retryCipher);
            } catch {
              /* offline; cache is good, server retries later */
            }
            setPendingConflict(null);
            resolve(merged);
          },
          cancel: () => {
            // User backed out — keep their in-memory edit but don't
            // overwrite the remote. The next successful edit will
            // sync as usual.
            setPendingConflict(null);
            resolve(next);
          },
        });
      });
    },
    [services],
  );

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
      const finalState = await persist(next, state.masterKey, state.vaultId);
      setState({ ...state, vault: finalState });
    },
    [state, persist],
  );

  /** CRUD: delete an API key by name. */
  const removeKey = useCallback(
    async (name: string) => {
      if (state.kind !== 'unlocked') return;
      const { [name]: _, ...rest } = state.vault.apiKeys;
      const next: VaultPlain = { ...state.vault, apiKeys: rest };
      const finalState = await persist(next, state.masterKey, state.vaultId);
      setState({ ...state, vault: finalState });
    },
    [state, persist],
  );

  /** Lock — drops in-memory state but keeps the encrypted cache. */
  const lock = useCallback(() => {
    setState({ kind: 'locked' });
  }, []);

  /** RecoveryPhraseScreen "I've saved my recovery phrase" handler. */
  const acknowledgeMnemonic = useCallback(() => {
    if (state.kind !== 'showMnemonic') return;
    setState({
      kind: 'unlocked',
      vault: state.vault,
      masterKey: state.masterKey,
      vaultId: state.vaultId,
    });
  }, [state]);

  return {
    state,
    pendingConflict,
    completeFirstRun,
    unlock,
    startRestore,
    cancelRestore,
    restoreFromMnemonic,
    acknowledgeMnemonic,
    upsertKey,
    removeKey,
    lock,
    retryPlatformCheck,
  };
}
