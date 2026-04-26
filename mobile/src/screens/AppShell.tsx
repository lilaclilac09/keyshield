/**
 * The root React Native component. Mirrors `extension-sync/src/popup/App.tsx`
 * but uses RN primitives and the `useVaultFlow` hook unchanged.
 *
 * STATUS: scaffolded. The state-machine wiring is real (it imports
 * the same hook the extension uses), but the platform-detection
 * and credentials providers it depends on are not yet implemented
 * (see ../lib/passkeyAdapter.ts). Running this on a real device
 * before those land will throw at the first Face ID prompt.
 *
 * To actually launch this app you'll need:
 *   1. `npx react-native init` to materialise the iOS / Android
 *      platform projects (intentionally NOT in this skeleton —
 *      the iOS / Android folders should live outside the npm
 *      workspace tree to avoid Cocoapods + Gradle confusion).
 *   2. `pod install` in the iOS folder.
 *   3. Wire AsyncStorage + react-native-quick-crypto + the passkey
 *      adapter into `entry.tsx` (a small boot file you provide
 *      that calls `buildMobileServices` and renders this AppShell).
 */

import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useVaultFlow } from '@keyshield/extension-sync/src/popup/hooks/useVaultFlow';
import type { MobileServices } from '../lib/services';

export interface AppShellProps {
  services: MobileServices;
}

export function AppShell({ services }: AppShellProps) {
  // The popup hook works unchanged on RN — it has no React DOM
  // dependencies, only React + the services interface we satisfy.
  const flow = useVaultFlow(services as any);

  switch (flow.state.kind) {
    case 'checking':
      return (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      );
    case 'unsupportedPlatform':
      return (
        <View style={styles.center}>
          <Text style={styles.title}>Device not supported</Text>
          <Text style={styles.body}>
            Your device's passkey support doesn't expose the PRF
            extension yet. Update iOS to 18+ or Android to 14+ and
            try again.
          </Text>
        </View>
      );
    case 'firstRun':
    case 'locked':
      return (
        <View style={styles.center}>
          <Text style={styles.title}>
            {flow.state.kind === 'firstRun'
              ? 'Set up your vault'
              : 'Welcome back'}
          </Text>
          <Text style={styles.body}>
            (UnlockScreen — TODO: port from extension-sync's
            UnlockScreen.tsx using React Native primitives.)
          </Text>
        </View>
      );
    case 'showMnemonic':
      return (
        <View style={styles.center}>
          <Text style={styles.title}>Your recovery phrase</Text>
          <Text style={styles.body}>
            (RecoveryPhraseScreen — TODO: port from
            extension-sync's RecoveryPhraseScreen.tsx.)
          </Text>
        </View>
      );
    case 'restore':
      return (
        <View style={styles.center}>
          <Text style={styles.title}>Restore from recovery phrase</Text>
          <Text style={styles.body}>
            (RestoreScreen — TODO: port from extension-sync's
            RestoreScreen.tsx.)
          </Text>
        </View>
      );
    case 'unlocked':
      return (
        <View style={styles.center}>
          <Text style={styles.title}>Vault unlocked</Text>
          <Text style={styles.body}>
            {Object.keys(flow.state.vault.apiKeys).length} keys.
            (VaultList + SessionBar + AddPasskeyBanner — TODO.)
          </Text>
        </View>
      );
    case 'error':
      return (
        <View style={styles.center}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>{flow.state.message}</Text>
        </View>
      );
  }
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FAFAF9',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1917',
    marginBottom: 8,
  },
  body: {
    fontSize: 13,
    color: '#57534E',
    textAlign: 'center',
    lineHeight: 18,
  },
});
