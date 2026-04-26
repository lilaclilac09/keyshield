import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Services } from '@keyshield/extension-sync/src/popup/wiring';
import type { AuthResult } from '@keyshield/extension-sync/src/lib/auth';
import { colors, fontSize, radius, space } from '../theme';

export interface AddPasskeyBannerProps {
  services: Services;
  onRegistered: (result: AuthResult) => Promise<void>;
}

export function AddPasskeyBanner(props: AddPasskeyBannerProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPress = async () => {
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
      await props.onRegistered(result);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to add passkey');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.banner}>
      <View style={styles.row}>
        <Text style={styles.text}>
          <Text style={styles.bold}>Restored from recovery phrase.</Text> Add a
          passkey on this device so you don&apos;t have to retype your phrase
          next time.
        </Text>
        <Pressable
          onPress={onPress}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={busy ? 'Adding passkey' : 'Add passkey'}
          accessibilityState={{ disabled: busy }}
          style={({ pressed }) => [
            styles.btn,
            busy && styles.dim,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.btnText}>{busy ? 'Adding…' : 'Add passkey'}</Text>
        </Pressable>
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.warnBg,
    borderTopWidth: 1,
    borderTopColor: colors.warnBorder,
    paddingHorizontal: space.l,
    paddingVertical: space.s,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.m,
  },
  text: { fontSize: fontSize.xs, color: colors.warnHeading, flex: 1 },
  bold: { fontWeight: '600' },
  btn: {
    backgroundColor: colors.warnButton,
    paddingHorizontal: space.m,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  btnText: {
    color: colors.primaryFg,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  pressed: { opacity: 0.85 },
  dim: { opacity: 0.5 },
  errorText: {
    marginTop: 4,
    fontSize: fontSize.xxs,
    color: colors.errText,
  },
});
