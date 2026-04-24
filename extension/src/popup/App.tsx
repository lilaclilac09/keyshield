import React, { useCallback } from 'react';
import { services } from './wiring';
import { useVaultFlow } from './hooks/useVaultFlow';
import { useSessionCountdown } from './hooks/useSessionCountdown';
import { UnlockScreen } from './screens/UnlockScreen';
import { VaultList } from './screens/VaultList';
import { SessionBar } from './components/SessionBar';

export function App() {
  const flow = useVaultFlow(services);
  const countdown = useSessionCountdown(services);

  // Placeholders for the on-chain session actions. The real implementation
  // lives in packages/agent-sdk SessionManager — this component just needs
  // callbacks wired up so the popup UI can call them. A future PR will
  // bolt the owner-wallet signer onto these.
  const onRenew = useCallback(async () => {
    // TODO: call SessionManager.buildRenewSessionTx + sign + send
    // (requires owner-wallet adapter wired in)
  }, []);
  const onRevokeAll = useCallback(async () => {
    // TODO: call SessionManager.buildRevokeAllSessionsTx + sign + send
    await services.session.clearSession();
  }, []);

  let body: React.ReactNode;
  switch (flow.state.kind) {
    case 'checking':
      body = (
        <div className="flex h-full items-center justify-center text-xs text-stone-400">
          Loading…
        </div>
      );
      break;
    case 'firstRun':
    case 'locked':
      body = (
        <UnlockScreen
          mode={flow.state.kind}
          services={services}
          onFirstRunComplete={flow.completeFirstRun}
          onUnlock={flow.unlock}
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
        <SessionBar
          countdown={countdown}
          onRenew={onRenew}
          onRevokeAll={onRevokeAll}
        />
      )}
    </div>
  );
}
