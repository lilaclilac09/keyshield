import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getUpgradeMessage } from '@keyshield/extension-sync/src/lib/platform';
import { colors, fontSize, radius, space } from '../theme';

export interface UpgradeScreenProps {
  onRetry: () => void;
}

export function UpgradeScreen({ onRetry }: UpgradeScreenProps) {
  return (
    <View style={styles.root}>
      <Text style={styles.icon} accessibilityElementsHidden>
        🛑
      </Text>
      <Text style={styles.title}>Browser not supported</Text>
      <Text style={styles.body}>{getUpgradeMessage()}</Text>

      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Try again"
        style={styles.primaryBtn}
      >
        <Text style={styles.primaryBtnText}>Try again</Text>
      </Pressable>

      <Text style={styles.footer}>
        KeyShield uses the WebAuthn PRF extension to derive an
        end-to-end-encryption key from your passkey. Older platforms
        don&apos;t expose the PRF output, so we can&apos;t safely sync your
        vault across devices.
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
  },
  primaryBtn: {
    backgroundColor: colors.primaryBg,
    paddingVertical: space.s,
    paddingHorizontal: space.l,
    borderRadius: radius.lg,
    width: '100%',
    maxWidth: 280,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: colors.primaryFg,
    fontSize: fontSize.m,
    fontWeight: '500',
  },
  footer: {
    marginTop: space.xl,
    fontSize: fontSize.xxs,
    lineHeight: 14,
    color: colors.textFaint,
    textAlign: 'center',
    maxWidth: 280,
  },
});
