import React, { useCallback, useMemo, useState } from 'react';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { SessionManager } from '@keyshield/agent-sdk';

import { services } from './wiring';
import { useVaultFlow } from './hooks/useVaultFlow';
import { useSessionCountdown } from './hooks/useSessionCountdown';
import { useOwnerWallet } from './hooks/useOwnerWallet';
import { RecoveryPhraseScreen } from './screens/RecoveryPhraseScreen';
import { RestoreScreen } from './screens/RestoreScreen';
import { UnlockScreen } from './screens/UnlockScreen';
import { UpgradeScreen } from './screens/UpgradeScreen';
import { VaultList } from './screens/VaultList';
import { SessionBar } from './components/SessionBar';
import { ConflictDialog } from './components/ConflictDialog';
import { AddPasskeyBanner } from './components/AddPasskeyBanner';

// Read at module load so the popup doesn't have to query chrome.storage
// on every render. These can be replaced by per-user settings later.
const RPC_URL =
  (globalThis as any).process?.env?.VITE_SOLANA_RPC_URL ??
  (import.meta as any)?.env?.VITE_SOLANA_RPC_URL ??
  'https://api.devnet.solana.com';
const PROGRAM_ID =
  (globalThis as any).process?.env?.VITE_KEYSHIELD_PROGRAM_ID ??
  (import.meta as any)?.env?.VITE_KEYSHIELD_PROGRAM_ID ??
  '11111111111111111111111111111112';

export function App() {
  const flow = useVaultFlow(services);
  const countdown = useSessionCountdown(services);

  const connection = useMemo(() => new Connection(RPC_URL, 'confirmed'), []);
  const wallet = useOwnerWallet(connection);

  const sessionManager = useMemo(() => {
    if (!wallet.state.publicKey) return null;
    return new SessionManager({
      connection,
      programId: new PublicKey(PROGRAM_ID),
      ownerPubkey: wallet.state.publicKey,
    });
  }, [connection, wallet.state.publicKey]);

  const [busy, setBusy] = useState(false);

  /**
   * Renew this device's session. We need an ephemeral pubkey to renew —
   * if the popup already has one in chrome.storage.session we reuse it,
   * otherwise we generate a fresh one.
   */
  const onRenew = useCallback(async () => {
    if (!sessionManager) {
      alert('Connect your wallet first.');
      return;
    }
    setBusy(true);
    try {
      const existing = await services.session.getSession();
      const agentPubkey = existing
        ? new PublicKey(existing.ephemeralPubkey)
        : Keypair.generate().publicKey;

      const tx = sessionManager.buildRenewSessionTx(agentPubkey);
      const sig = await wallet.signAndSend(tx);
      const newState = services.session.buildStateFromGrant({
        ephemeralPubkey: agentPubkey.toBase58(),
        deviceLabel: existing?.deviceLabel ?? 'this device',
      });
      await services.session.setSession(newState);
      // eslint-disable-next-line no-console
      console.info('[KeyShield] Renewed session, signature:', sig);
    } catch (e: any) {
      alert(`Renew failed: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }, [sessionManager, wallet]);

  /** Sign-out everywhere — calls the on-chain revoke_all_agents ix. */
  const onRevokeAll = useCallback(async () => {
    if (!sessionManager) {
      alert('Connect your wallet first.');
      return;
    }
    if (!confirm('Revoke every active session on every device?')) return;
    setBusy(true);
    try {
      const tx = sessionManager.buildRevokeAllSessionsTx();
      const sig = await wallet.signAndSend(tx);
      await services.session.clearSession();
      // eslint-disable-next-line no-console
      console.info('[KeyShield] Revoked all sessions, signature:', sig);
    } catch (e: any) {
      alert(`Revoke-all failed: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }, [sessionManager, wallet]);

  let body: React.ReactNode;
  switch (flow.state.kind) {
    case 'checking':
      body = (
        <div className="flex h-full items-center justify-center text-xs text-stone-400">
          Loading…
        </div>
      );
      break;
    case 'unsupportedPlatform':
      body = <UpgradeScreen onRetry={flow.retryPlatformCheck} />;
      break;
    case 'firstRun':
    case 'locked':
      body = (
        <UnlockScreen
          mode={flow.state.kind}
          services={services}
          onFirstRunComplete={flow.completeFirstRun}
          onUnlock={flow.unlock}
          onStartRestore={
            flow.state.kind === 'firstRun' ? flow.startRestore : undefined
          }
        />
      );
      break;
    case 'restore':
      body = (
        <RestoreScreen
          onRestore={flow.restoreFromMnemonic}
          onCancel={flow.cancelRestore}
        />
      );
      break;
    case 'showMnemonic':
      body = (
        <RecoveryPhraseScreen
          mnemonic={flow.state.mnemonic}
          onAcknowledge={flow.acknowledgeMnemonic}
        />
      );
      break;
    case 'unlocked':
      body = (
        <VaultList
          vault={flow.state.vault}
          onUpsertKey={flow.upsertKey}
          onRemoveKey={flow.removeKey}
          onLock={flow.lock}
        />
      );
      break;
    case 'error':
      body = (
        <div className="flex h-full items-center justify-center p-4 text-center text-xs text-red-600">
          {flow.state.message}
        </div>
      );
      break;
  }

  return (
    <div className="flex h-[520px] flex-col">
      <div className="flex-1 overflow-hidden">{body}</div>
      {flow.state.kind === 'unlocked' && (
        <>
          {flow.state.seed && (
            <AddPasskeyBanner
              services={services}
              onRegistered={flow.registerPasskeyAfterRestore}
            />
          )}
          <WalletConnectStrip wallet={wallet} />
          <SessionBar
            countdown={countdown}
            onRenew={onRenew}
            onRevokeAll={onRevokeAll}
            disabled={busy || !sessionManager}
          />
        </>
      )}
      {flow.pendingConflict && (
        <ConflictDialog
          conflicts={flow.pendingConflict.report.conflicts}
          onResolve={flow.pendingConflict.resolve}
          onCancel={flow.pendingConflict.cancel}
        />
      )}
    </div>
  );
}

function WalletConnectStrip({
  wallet,
}: {
  wallet: ReturnType<typeof useOwnerWallet>;
}) {
  if (wallet.state.publicKey) {
    const pk = wallet.state.publicKey.toBase58();
    return (
      <div className="flex items-center justify-between border-t border-stone-200 px-4 py-1 text-[10px]">
        <span className="text-stone-500">
          {wallet.state.walletName}: {pk.slice(0, 4)}…{pk.slice(-4)}
        </span>
        <button
          onClick={wallet.disconnect}
          className="text-stone-500 hover:text-stone-900"
        >
          disconnect
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between border-t border-stone-200 bg-amber-50 px-4 py-1 text-[10px]">
      <span className="text-amber-800">
        {wallet.state.error ?? 'Wallet not connected (needed for renew/revoke).'}
      </span>
      <button
        onClick={wallet.connect}
        disabled={wallet.state.isConnecting}
        className="font-medium text-amber-900 hover:text-amber-950 disabled:opacity-50"
      >
        {wallet.state.isConnecting ? 'connecting…' : 'connect'}
      </button>
    </div>
  );
}
