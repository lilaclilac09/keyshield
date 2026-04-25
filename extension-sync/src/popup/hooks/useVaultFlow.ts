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
import { LocalVault } from '../../lib/vault';
import type { AuthResult } from '../../lib/auth';
import { fetchLatestCipher } from '../../lib/sync';
import { detectPrfSupport } from '../../lib/platform';
import {
  applyResolutions,
  findConflicts,
  type ConflictChoice,
  type ConflictReport,
} from '../../lib/conflict';

export type VaultFlowState =
  | { kind: 'checking' }
  | { kind: 'unsupportedPlatform' }
  | { kind: 'firstRun' }
  | { kind: 'locked' }
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
   * Shared post-authenticate handler. Given an AuthResult that
   * includes a prfSecret, derive the master key + vault ID, sync,
   * and transition into 'unlocked'.
   *
   * If the sync backend has a cipher, we decrypt it. Otherwise we
   * create an empty vault, push it to the backend, and unlock with
   * that. Either way the device joins the user's vault — this is
   * the iCloud Keychain UX.
   */
  const finalizeUnlock = useCallback(
    async (authResult: AuthResult): Promise<void> => {
      if (!authResult.success || !authResult.prfSecret) {
        throw new Error(
          authResult.error ?? 'Authentication did not return a PRF secret',
        );
      }

      const masterKey = await services.vault.deriveMasterKey(authResult.prfSecret);
      const vaultId = await services.vault.deriveVaultId(authResult.prfSecret);
      // PRF secret is no longer needed past this point.

      // Mint a fresh sync-worker JWT from the assertion we just
      // performed (if a syncAuth client is configured). This is also
      // the path the HttpSyncBackend's 401-retry will use.
      if (services.syncAuth && authResult.authenticationResponseJSON) {
        try {
          const exchanged = await services.syncAuth.exchange(
            vaultId,
            authResult.authenticationResponseJSON,
          );
          services.bearer.set(exchanged.token, exchanged.expiresAt);
        } catch (e) {
          // Token exchange failed — likely because we haven't called
          // /auth/register yet (first-run). We let the flow continue
          // with a null bearer; subsequent /vault calls will surface
          // 401 and the caller can recover.
          // eslint-disable-next-line no-console
          console.warn('[KeyShield] /auth/exchange failed:', e);
        }
      }

      // Pull authoritative cipher from sync backend, falling back to
      // local cache if offline.
      const { cipher: remote, source } = await fetchLatestCipher(
        vaultId,
        services.sync,
        () => services.vault.getCachedCipher(),
      );

      let vault: VaultPlain;
      let resultingCipher: VaultCipher;

      if (remote) {
        vault = await services.vault.decryptVault(remote, masterKey);
        resultingCipher = remote;
      } else {
        // First time anywhere — create + push.
        vault = LocalVault.emptyVault();
        resultingCipher = await services.vault.encryptVault(vault, masterKey);
        try {
          await services.sync.push(vaultId, resultingCipher);
        } catch {
          // Offline first-run is OK — the next online edit will push.
        }
      }

      // Update local cache so the next unlock is instant even offline.
      await services.vault.putCachedCipher(resultingCipher);
      // eslint-disable-next-line no-console
      console.info(`[KeyShield] unlocked from ${source}`);

      setState({ kind: 'unlocked', vault, masterKey, vaultId });
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

      await finalizeUnlock(authResult);
    },
    [services, finalizeUnlock],
  );

  /** Called from UnlockScreen after the locked-state Face ID. */
  const unlock = useCallback(
    async (authResult: AuthResult): Promise<void> => {
      await finalizeUnlock(authResult);
    },
    [finalizeUnlock],
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

  return {
    state,
    pendingConflict,
    completeFirstRun,
    unlock,
    upsertKey,
    removeKey,
    lock,
    retryPlatformCheck,
  };
}
