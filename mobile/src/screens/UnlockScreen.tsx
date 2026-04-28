import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Services } from '@keyshield/extension-sync/src/popup/wiring';
import type { AuthResult } from '@keyshield/extension-sync/src/lib/auth';
import { colors, fontSize, radius, space } from '../theme';

export interface UnlockScreenProps {
  mode: 'firstRun' | 'locked';
  services: Services;
  onFirstRunComplete: (result: AuthResult) => Promise<void>;
  onUnlock: (result: AuthResult) => Promise<void>;
  onStartRestore?: () => void;
  onLostDevice?: () => void;
}

export function UnlockScreen(props: UnlockScreenProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registerAndSetup = async () => {
    setBusy(true);
    setError(null);
    try {
      const userId = new Uint8Array(16);
      globalThis.crypto.getRandomValues(userId);
      const result = await props.services.auth.registerPasskey({
        userId,
        userName: 'keyshield-user',
        userDisplayName: 'KeyShield user',
      });
      if (!result.success) throw new Error(result.error);
      await props.onFirstRunComplete(result);
    } catch (e: any) {
      setError(e?.message ?? 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  const unlock = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await props.services.auth.authenticateWithWebAuthn();
      if (!result.success) throw new Error(result.error);
      await props.onUnlock(result);
    } catch (e: any) {
      setError(e?.message ?? 'Unlock failed');
    } finally {
      setBusy(false);
    }
  };

  const onPrimary = props.mode === 'firstRun' ? registerAndSetup : unlock;
  const primaryLabel =
    props.mode === 'firstRun' ? 'Create vault with Face ID' : 'Unlock with Face ID';
  const heading =
    props.mode === 'firstRun' ? 'Set up your vault' : 'Welcome back';
  const body =
    props.mode === 'firstRun'
      ? 'KeyShield encrypts your API keys end-to-end and syncs them across every device that has your passkey, the same way iCloud Keychain works. Face ID / Touch ID unlocks them. Only your devices can decrypt — the server only sees ciphertext.'
      : 'Unlock your vault to view or use your stored API keys.';

  return (
    <View style={styles.root}>
      <Text style={styles.icon} accessibilityElementsHidden>
        🛡️
      </Text>
      <Text style={styles.title}>{heading}</Text>
      <Text style={styles.body}>{body}</Text>

      <Pressable
        onPress={onPrimary}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={primaryLabel}
        accessibilityState={{ disabled: busy }}
        style={({ pressed }) => [
          styles.primaryBtn,
          busy && styles.dim,
          pressed && styles.pressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={colors.primaryFg} />
        ) : (
          <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
        )}
      </Pressable>

      {props.mode === 'firstRun' && props.onStartRestore && (
        <Pressable
          onPress={props.onStartRestore}
          accessibilityRole="link"
          accessibilityLabel="I have a recovery phrase"
        >
          <Text style={styles.linkSmall}>I have a recovery phrase</Text>
        </Pressable>
      )}

      {props.mode === 'firstRun' && props.onLostDevice && (
        <Pressable
          onPress={props.onLostDevice}
          accessibilityRole="link"
          accessibilityLabel="Lost a device?"
        >
          <Text style={styles.linkXSmall}>Lost a device?</Text>
        </Pressable>
      )}

      {error && (
        <View style={styles.errorBox} accessibilityLiveRegion="polite">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Text style={styles.footer}>
        End-to-end encrypted. The server stores only ciphertext keyed by a
        derived ID; without your passkey nobody — including us — can decrypt
        the vault.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    backgroundColor: colors.bgPage,
  },
  icon: { fontSize: 36, marginBottom: space.l },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.text,
    marginBottom: space.s,
  },
  body: {
    fontSize: fontSize.m,
    color: colors.textMuted,
    marginBottom: space.l,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 19,
  },
  primaryBtn: {
    backgroundColor: colors.primaryBg,
    paddingVertical: space.s,
    paddingHorizontal: space.l,
    borderRadius: radius.lg,
    width: '100%',
    maxWidth: 280,
    alignItems: 'center',
    marginBottom: space.m,
  },
  primaryBtnText: {
    color: colors.primaryFg,
    fontSize: fontSize.m,
    fontWeight: '500',
  },
  pressed: { opacity: 0.85 },
  dim: { opacity: 0.5 },
  linkSmall: {
    fontSize: fontSize.xs,
    color: colors.textHint,
    textDecorationLine: 'underline',
  },
  linkXSmall: {
    fontSize: fontSize.xxs,
    color: colors.textFaint,
    textDecorationLine: 'underline',
    marginTop: space.xs,
  },
  errorBox: {
    marginTop: space.l,
    backgroundColor: colors.errBg,
    padding: space.s,
    borderRadius: radius.md,
    width: '100%',
    maxWidth: 280,
  },
  errorText: { fontSize: fontSize.xs, color: colors.errText },
  footer: {
    marginTop: space.xl,
    fontSize: fontSize.xxs,
    lineHeight: 14,
    color: colors.textFaint,
    textAlign: 'center',
    maxWidth: 280,
  },
});
