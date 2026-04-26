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
      /** Mnemonic-recovery alias; equal to `vaultId` for legacy V1
       *  ciphers and for the post-restore flow that doesn't have a
       *  fresh PRF yet. */
      recoveryVaultId: string;
      /** PRF-wrapped seed copied through to every subsequent push so
       *  cross-device pulls can still unwrap. Undefined for legacy
       *  V1 vaults / post-mnemonic restores without a passkey. */
      seedEnvelope?: import('../../lib/vault').SeedEnvelope;
    }
  | {
      kind: 'unlocked';
      vault: VaultPlain;
      masterKey: CryptoKey;
      vaultId: string;
      recoveryVaultId: string;
      seedEnvelope?: import('../../lib/vault').SeedEnvelope;
      /**
       * Set ONLY by `restoreFromMnemonic` (post-recovery, before the
       * user has added a passkey on this device). Lets
       * `registerPasskeyAfterRestore` re-wrap the seed under the new
       * PRF without round-tripping through the user typing their
       * mnemonic again. Cleared as soon as a passkey is wired up.
       *
       * Lives in memory only — same lifetime as `masterKey` (which
       * is also a secret) and the decrypted `vault.apiKeys` values.
       */
      seed?: Uint8Array;
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
    async (
      authResult: AuthResult,
      opts: { showMnemonicOnNew: boolean; seedForNewVault?: Uint8Array },
    ): Promise<void> => {
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
      let vaultId: string;          // PRF-derived — for daily push/pull
      let recoveryVaultId: string;  // SEED-derived — for mnemonic recovery
      let resultingCipher: VaultCipher;
      let seedEnvelope: import('../../lib/vault').SeedEnvelope | undefined;
      let mnemonicToShow: string | null = null;

      if (remote && remote.seedEnvelope) {
        // V2 path: unwrap seed, derive from seed.
        const seed = await unwrapSeed(
          remote.seedEnvelope,
          authResult.prfSecret,
          services.vault['cfg'].crypto,
        );
        masterKey = await services.vault.deriveMasterKey(seed);
        vaultId = prfDerivedVaultId;
        recoveryVaultId = await services.vault.deriveVaultId(seed);
        vault = await services.vault.decryptVault(remote, masterKey);
        resultingCipher = remote;
        seedEnvelope = remote.seedEnvelope;
      } else if (remote) {
        // Legacy V1 cipher (no envelope, no recovery path).
        masterKey = await services.vault.deriveMasterKey(authResult.prfSecret);
        vaultId = prfDerivedVaultId;
        recoveryVaultId = prfDerivedVaultId;
        vault = await services.vault.decryptVault(remote, masterKey);
        resultingCipher = remote;
        seedEnvelope = undefined;
      } else {
        // First time anywhere — create the V2 vault. Reuse the
        // caller-supplied seed if present so the seed pubkey we
        // pre-registered matches the one we're about to commit.
        const seed = opts.seedForNewVault ?? generateSeed(services.vault['cfg'].crypto);
        masterKey = await services.vault.deriveMasterKey(seed);
        vaultId = prfDerivedVaultId;
        recoveryVaultId = await services.vault.deriveVaultId(seed);
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
        seedEnvelope = envelope;
        mnemonicToShow = seedToMnemonic(seed);
        // Dual-write: PRF-derived ID for daily lookup, SEED-derived
        // ID for mnemonic-only recovery. Same ciphertext at both.
        try {
          await Promise.all([
            services.sync.push(vaultId, resultingCipher),
            services.sync.push(recoveryVaultId, resultingCipher),
          ]);
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
          recoveryVaultId,
          ...(seedEnvelope ? { seedEnvelope } : {}),
        });
      } else {
        setState({
          kind: 'unlocked',
          vault,
          masterKey,
          vaultId,
          recoveryVaultId,
          ...(seedEnvelope ? { seedEnvelope } : {}),
        });
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

      // Generate the seed up-front so we can register its public key
      // alongside the passkey in the same /auth/register call. On a
      // 2nd-device first-run the registerVault call will 409 — the
      // seed we generated here is then discarded inside finalizeUnlock
      // (the unwrapped envelope's seed wins), but the seed pubkey we
      // POSTed is also discarded server-side (first-write-wins).
      let seedForNewVault: Uint8Array | undefined;
      if (services.syncAuth && registrationResult.prfSecret) {
        seedForNewVault = generateSeed(services.vault['cfg'].crypto);
        const vaultId = await services.vault.deriveVaultId(
          registrationResult.prfSecret,
        );
        try {
          await services.syncAuth.registerVault(
            vaultId,
            registrationResult,
            seedForNewVault,
          );
        } catch (e: any) {
          // 409 → vault already registered on the backend (likely the
          // user re-installed). That's recoverable: drop our about-to-
          // be-discarded seed and let finalizeUnlock unwrap the
          // existing one.
          if (e?.name === 'SyncAuthAlreadyRegistered') {
            seedForNewVault = undefined;
          } else {
            // eslint-disable-next-line no-console
            console.warn('[KeyShield] /auth/register failed:', e);
            seedForNewVault = undefined;
          }
        }
      }

      await finalizeUnlock(authResult, {
        showMnemonicOnNew: true,
        seedForNewVault,
      });
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
      // Mnemonic-only recovery looks up the cipher under the
      // SEED-derived ID — that's the dual-write target we wrote on
      // first run specifically so a passkey-less recovery can find
      // the vault.
      const recoveryVaultId = await services.vault.deriveVaultId(seed);

      // No JWT here (no PRF assertion happened). Daily-PRF-bound
      // pushes will 401 until the user adds a fresh passkey. Until
      // then, persist still updates the local cache and the
      // SEED-derived backend slot so future devices that recover
      // see the latest state.
      let cipher = await services.vault.getCachedCipher();
      try {
        const { cipher: remote } = await fetchLatestCipher(
          recoveryVaultId,
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
      // After mnemonic-only restore, vaultId == recoveryVaultId (we
      // don't have a fresh PRF, so there's no separate daily ID to
      // write to). Subsequent persists go to the seed-derived slot
      // only, until the user adds a passkey via
      // `registerPasskeyAfterRestore`.
      setState({
        kind: 'unlocked',
        vault,
        masterKey,
        vaultId: recoveryVaultId,
        recoveryVaultId,
        seed,
      });
    },
    [services],
  );

  /**
   * Post-recovery passkey enrollment.
   *
   * After a mnemonic restore the user is in 'unlocked' state with no
   * PRF — daily unlock would require re-typing the phrase. This
   * method takes a fresh registration AuthResult, re-wraps the
   * already-loaded seed under the new PRF, and dual-writes to a
   * fresh PRF-derived slot (so the next popup open will find the
   * cipher under the new PRF lookup) plus the existing seed-derived
   * slot. It also calls /auth/register so the sync-worker accepts
   * future /auth/exchange under the new passkey.
   *
   * Idempotent in the sense that a 409 from /auth/register (the new
   * PRF id collides with an existing registration) just falls
   * through — the cipher push is what matters for unlock to work.
   */
  const registerPasskeyAfterRestore = useCallback(
    async (registrationResult: AuthResult): Promise<void> => {
      if (state.kind !== 'unlocked' || !state.seed) {
        throw new Error(
          'registerPasskeyAfterRestore can only be called after a ' +
            'mnemonic restore, while the seed is still in memory.',
        );
      }
      if (!registrationResult.success || !registrationResult.prfSecret) {
        throw new Error(
          registrationResult.error ?? 'registration did not return a PRF secret',
        );
      }

      const newPrfVaultId = await services.vault.deriveVaultId(
        registrationResult.prfSecret,
      );
      const newEnvelope = await wrapSeed(
        state.seed,
        registrationResult.prfSecret,
        services.vault['cfg'].crypto,
      );

      // Re-encrypt the current vault content with the existing master
      // key (derived from the same seed — unchanged) and attach the
      // new envelope.
      const baseCipher = await services.vault.encryptVault(
        state.vault,
        state.masterKey,
      );
      const cipher: VaultCipher = {
        ...baseCipher,
        version: VAULT_VERSION,
        seedEnvelope: newEnvelope,
      };
      await services.vault.putCachedCipher(cipher);
      try {
        await Promise.all([
          services.sync.push(newPrfVaultId, cipher),
          services.sync.push(state.recoveryVaultId, cipher),
        ]);
      } catch {
        // Offline — cache is updated; the user can retry later.
      }

      // Register the passkey on the sync worker so future
      // /auth/exchange against newPrfVaultId works. 409 means the
      // slot was already claimed (rare race or re-install) — that's
      // OK since the cipher push is the part that unblocks unlock.
      if (services.syncAuth) {
        try {
          await services.syncAuth.registerVault(
            newPrfVaultId,
            registrationResult,
            state.seed,
          );
        } catch (e: any) {
          if (e?.name !== 'SyncAuthAlreadyRegistered') {
            // eslint-disable-next-line no-console
            console.warn('[KeyShield] post-restore /auth/register failed:', e);
          }
        }
        // Mint a fresh JWT bound to the new vaultId. Some platforms
        // only return PRF on a separate get(); fall back to that.
        const haveAssertion =
          !!registrationResult.authenticationResponseJSON &&
          !!registrationResult.prfSecret;
        const authResult = haveAssertion
          ? registrationResult
          : await services.auth.authenticateWithWebAuthn();
        if (authResult.success && authResult.authenticationResponseJSON) {
          try {
            const exchanged = await services.syncAuth.exchange(
              newPrfVaultId,
              authResult.authenticationResponseJSON,
            );
            services.bearer.set(exchanged.token, exchanged.expiresAt);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn(
              '[KeyShield] post-restore /auth/exchange failed:',
              e,
            );
          }
        }
      }

      // Promote: vaultId now points at the new PRF-derived slot, the
      // envelope is the new one, and we can drop the in-memory seed
      // since we no longer need it for re-wrapping.
      setState({
        kind: 'unlocked',
        vault: state.vault,
        masterKey: state.masterKey,
        vaultId: newPrfVaultId,
        recoveryVaultId: state.recoveryVaultId,
        seedEnvelope: newEnvelope,
      });
    },
    [state, services],
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
  /** Push a cipher to both the daily and recovery slots. The two
   *  pushes can race — we await both so the caller knows when the
   *  cycle is complete. If `vaultId === recoveryVaultId` (legacy V1
   *  vaults, post-mnemonic-restore state) we just push once. */
  const dualPush = useCallback(
    async (
      vaultId: string,
      recoveryVaultId: string,
      cipher: VaultCipher,
    ): Promise<{ daily: boolean; recovery: boolean }> => {
      if (vaultId === recoveryVaultId) {
        const ok = await services.sync.push(vaultId, cipher);
        return { daily: ok, recovery: ok };
      }
      const [daily, recovery] = await Promise.all([
        services.sync.push(vaultId, cipher),
        services.sync.push(recoveryVaultId, cipher),
      ]);
      return { daily, recovery };
    },
    [services],
  );

  const persist = useCallback(
    async (
      next: VaultPlain,
      masterKey: CryptoKey,
      vaultId: string,
      recoveryVaultId: string,
      seedEnvelope: import('../../lib/vault').SeedEnvelope | undefined,
    ): Promise<VaultPlain> => {
      const baseCipher = await services.vault.encryptVault(next, masterKey);
      const cipher = seedEnvelope
        ? { ...baseCipher, seedEnvelope }
        : baseCipher;
      await services.vault.putCachedCipher(cipher);
      let pushOk: { daily: boolean; recovery: boolean };
      try {
        pushOk = await dualPush(vaultId, recoveryVaultId, cipher);
      } catch {
        return next;
      }
      // We only treat a failure on the DAILY slot as a 409 needing
      // merge — the recovery slot is best-effort (it'll catch up on
      // the next push, and recovery only matters when the user has
      // lost everything).
      if (pushOk.daily) return next;

      const fresh = await services.sync.pull(vaultId);
      if (!fresh) return next;
      const remote = await services.vault.decryptVault(fresh, masterKey);
      const report = findConflicts(next, remote);

      if (report.conflicts.length === 0) {
        const merged = report.baseline;
        const retryBase = await services.vault.encryptVault(merged, masterKey);
        const retryCipher = seedEnvelope ? { ...retryBase, seedEnvelope } : retryBase;
        await services.vault.putCachedCipher(retryCipher);
        await dualPush(vaultId, recoveryVaultId, retryCipher);
        return merged;
      }

      return new Promise<VaultPlain>((resolve) => {
        setPendingConflict({
          report,
          resolve: async (resolutions) => {
            const merged = applyResolutions(report, resolutions);
            try {
              const retryBase = await services.vault.encryptVault(
                merged,
                masterKey,
              );
              const retryCipher = seedEnvelope
                ? { ...retryBase, seedEnvelope }
                : retryBase;
              await services.vault.putCachedCipher(retryCipher);
              await dualPush(vaultId, recoveryVaultId, retryCipher);
            } catch {
              /* offline; cache is good */
            }
            setPendingConflict(null);
            resolve(merged);
          },
          cancel: () => {
            setPendingConflict(null);
            resolve(next);
          },
        });
      });
    },
    [services, dualPush],
  );

  /** CRUD: add or replace an API key entry. Clears any tombstone
   *  the key may have had — re-adding revives a deleted key. */
  const upsertKey = useCallback(
    async (name: string, value: string, tags?: string[]) => {
      if (state.kind !== 'unlocked') return;
      const remainingTombstones: Record<string, number> = {
        ...(state.vault.deletedKeys ?? {}),
      };
      delete remainingTombstones[name];
      const next: VaultPlain = {
        ...state.vault,
        apiKeys: {
          ...state.vault.apiKeys,
          [name]: { value, createdAt: Date.now(), tags },
        },
      };
      if (Object.keys(remainingTombstones).length > 0) {
        next.deletedKeys = remainingTombstones;
      } else {
        delete next.deletedKeys;
      }
      const finalState = await persist(
        next,
        state.masterKey,
        state.vaultId,
        state.recoveryVaultId,
        state.seedEnvelope,
      );
      setState({ ...state, vault: finalState });
    },
    [state, persist],
  );

  /** CRUD: delete a key. Drops it from `apiKeys` and writes a
   *  tombstone into `deletedKeys` so the deletion survives a merge
   *  even if another device still has the old value. */
  const removeKey = useCallback(
    async (name: string) => {
      if (state.kind !== 'unlocked') return;
      const { [name]: _, ...rest } = state.vault.apiKeys;
      const next: VaultPlain = {
        ...state.vault,
        apiKeys: rest,
        deletedKeys: {
          ...(state.vault.deletedKeys ?? {}),
          [name]: Date.now(),
        },
      };
      const finalState = await persist(
        next,
        state.masterKey,
        state.vaultId,
        state.recoveryVaultId,
        state.seedEnvelope,
      );
      setState({ ...state, vault: finalState });
    },
    [state, persist],
  );

  /**
   * Bump a key's `lastUsedAt` timestamp. Called when the user
   * reveals or copies a value. The change persists like any other
   * edit but does NOT surface as a ConflictDialog because
   * `recordsDiffer` ignores the field.
   */
  const touchKey = useCallback(
    async (name: string) => {
      if (state.kind !== 'unlocked') return;
      const existing = state.vault.apiKeys[name];
      if (!existing) return;
      const next: VaultPlain = {
        ...state.vault,
        apiKeys: {
          ...state.vault.apiKeys,
          [name]: { ...existing, lastUsedAt: Date.now() },
        },
      };
      const finalState = await persist(
        next,
        state.masterKey,
        state.vaultId,
        state.recoveryVaultId,
        state.seedEnvelope,
      );
      setState({ ...state, vault: finalState });
    },
    [state, persist],
  );

  /**
   * Seed-bound force-revoke. Wipes every existing passkey
   * registration on the sync backend using the in-memory seed as
   * the only credential — the user just typed the recovery phrase
   * and we know they hold it. Idempotent: a 404 (no seed pubkey on
   * file) means there's nothing to force-revoke (the vault was
   * registered before V1.1 added seed pubkeys); anything else gets
   * surfaced.
   *
   * Only callable while `state.seed` is in scope, which means right
   * after `restoreFromMnemonic` and BEFORE
   * `registerPasskeyAfterRestore`. After re-registering a passkey
   * we drop the seed from state.
   */
  const forceRevokeOtherDevices = useCallback(async (): Promise<void> => {
    if (state.kind !== 'unlocked' || !state.seed) {
      throw new Error(
        'forceRevokeOtherDevices can only be called after a mnemonic ' +
          'restore, before adding a new passkey to this device.',
      );
    }
    if (!services.syncAuth) {
      throw new Error('Sync backend is not configured');
    }
    await services.syncAuth.forceRevokeOthers(
      state.recoveryVaultId,
      state.seed,
    );
  }, [state, services]);

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
      recoveryVaultId: state.recoveryVaultId,
      // Carry the envelope through — without it, subsequent persists
      // would write a cipher with no seedEnvelope, breaking
      // cross-device unlock.
      ...(state.seedEnvelope ? { seedEnvelope: state.seedEnvelope } : {}),
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
    registerPasskeyAfterRestore,
    forceRevokeOtherDevices,
    acknowledgeMnemonic,
    upsertKey,
    removeKey,
    touchKey,
    lock,
    retryPlatformCheck,
  };
}
