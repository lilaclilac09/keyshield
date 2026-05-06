/**
 * The root React Native component. Mirrors `extension-sync/src/popup/App.tsx`
 * but uses RN primitives and the `useVaultFlow` hook unchanged.
 *
 * STATUS: scaffolded with real RN-primitive screens. The state-machine
 * wiring is real (it imports the same hook the extension uses); the
 * platform-detection / credentials providers it depends on are now
 * implemented (see ../lib/passkeyAdapter.ts). What's still missing:
 *
 *   - Owner-wallet wiring for renew (mobile wallets need
 *     a deep-link adapter — separate from the popup's @solana/wallet-standard
 *     hook). Until that lands, the SessionBar shows the countdown but
 *     onRenew throws.
 *
 * To actually launch this app you'll need:
 *   1. `npx react-native init` to materialise the iOS / Android
 *      platform projects (intentionally NOT in this skeleton).
 *   2. `pod install` in the iOS folder.
 *   3. Wire AsyncStorage + react-native-quick-crypto + the passkey
 *      adapter into `entry.tsx` (a small boot file you provide that
 *      calls `buildMobileServices` and renders this AppShell).
 */

import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useVaultFlow } from '@keyshield/extension-sync/src/popup/hooks/useVaultFlow';
import { useSessionCountdown } from '@keyshield/extension-sync/src/popup/hooks/useSessionCountdown';

import type { MobileServices } from '../lib/services';
import { UnlockScreen } from './UnlockScreen';
import { RecoveryPhraseScreen } from './RecoveryPhraseScreen';
import { RestoreScreen } from './RestoreScreen';
import { UpgradeScreen } from './UpgradeScreen';
import { VaultList } from './VaultList';
import { SessionBar } from '../components/SessionBar';
import { ConflictDialog } from '../components/ConflictDialog';
import { AddPasskeyBanner } from '../components/AddPasskeyBanner';
import { LostDeviceDialog } from '../components/LostDeviceDialog';
import { SessionExpiryToast } from '../components/SessionExpiryToast';
import { colors } from '../theme';

export interface AppShellProps {
  services: MobileServices;
}

export function AppShell({ services }: AppShellProps) {
  const flow = useVaultFlow(services as any);
  const countdown = useSessionCountdown(services as any);

  const [lostDeviceOpen, setLostDeviceOpen] = useState(false);

  // The mobile owner-wallet adapter isn't wired yet (deep-link based,
  // separate from the popup's @solana/wallet-standard hook). Until it
  // lands, renew surfaces a clear error to the user.
  const onRenew = async () => {
    throw new Error('Renew is not yet wired on mobile.');
  };

  let body: React.ReactNode;
  switch (flow.state.kind) {
    case 'checking':
      body = (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
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
          services={services as any}
          onFirstRunComplete={flow.completeFirstRun}
          onUnlock={flow.unlock}
          onStartRestore={
            flow.state.kind === 'firstRun' ? flow.startRestore : undefined
          }
          onLostDevice={
            flow.state.kind === 'firstRun'
              ? () => setLostDeviceOpen(true)
              : undefined
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
          onTouchKey={flow.touchKey}
          onLock={flow.lock}
        />
      );
      break;
    case 'error':
      body = (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorBody}>{flow.state.message}</Text>
        </View>
      );
      break;
  }

  const isUnlocked = flow.state.kind === 'unlocked';
  const seedAvailable =
    flow.state.kind === 'unlocked' && flow.state.seed != null;

  return (
    <View style={styles.root}>
      <View style={styles.body}>{body}</View>

      {isUnlocked && (
        <>
          {seedAvailable && (
            <AddPasskeyBanner
              services={services as any}
              onRegistered={flow.registerPasskeyAfterRestore}
              onForceRevoke={flow.forceRevokeOtherDevices}
            />
          )}
          <SessionBar
            countdown={countdown}
            onRenew={onRenew}
          />
          <SessionExpiryToast countdown={countdown} onRenew={onRenew} />
        </>
      )}

      {flow.pendingConflict && (
        <ConflictDialog
          conflicts={flow.pendingConflict.report.conflicts}
          onResolve={flow.pendingConflict.resolve}
          onCancel={flow.pendingConflict.cancel}
        />
      )}

      <LostDeviceDialog
        visible={lostDeviceOpen}
        onStartRestore={() => {
          setLostDeviceOpen(false);
          flow.startRestore();
        }}
        onClose={() => setLostDeviceOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPage },
  body: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  errorBody: {
    fontSize: 13,
    color: colors.errText,
    textAlign: 'center',
    lineHeight: 18,
  },
});
