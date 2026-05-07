import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SessionCountdown } from '@keyshield/extension-sync/src/popup/hooks/useSessionCountdown';
import { formatBarRemaining } from './sessionFormat';
import { colors, fontSize, space } from '../theme';

export interface SessionBarProps {
  countdown: SessionCountdown;
  onRenew: () => void;
  disabled?: boolean;
}

export function SessionBar(props: SessionBarProps) {
  const { countdown } = props;
  const active =
    countdown.session != null && (countdown.secondsRemaining ?? 0) > 0;
  const nearExpiry = countdown.nearExpiry;

  const tone = nearExpiry ? styles.warn : active ? styles.ok : styles.idle;
  const toneBorder = nearExpiry
    ? styles.warnBorder
    : active
    ? styles.okBorder
    : styles.idleBorder;

  return (
    <View style={[styles.bar, tone, toneBorder]}>
      <View style={styles.row}>
        <Text style={styles.label}>
          {active ? (
            <>
              Session:{' '}
              <Text style={styles.mono}>
                {formatBarRemaining(countdown.secondsRemaining)}
              </Text>{' '}
              on{' '}
              <Text style={styles.muted}>
                {countdown.session?.deviceLabel ?? 'this device'}
              </Text>
            </>
          ) : (
            <Text style={styles.muted}>No active on-chain session</Text>
          )}
        </Text>
        <View style={styles.actions}>
          {active && nearExpiry && (
            <Pressable
              onPress={props.onRenew}
              disabled={props.disabled}
              accessibilityRole="button"
              accessibilityLabel="Renew"
              accessibilityState={{ disabled: !!props.disabled }}
            >
              <Text style={[styles.actionText, styles.warnText]}>Renew</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: space.l,
    paddingVertical: space.s,
    borderTopWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: { fontSize: fontSize.xs, color: colors.textMuted, flex: 1 },
  mono: { fontFamily: 'Menlo' },
  muted: { color: colors.textHint },
  actions: { flexDirection: 'row', gap: 12 },
  actionText: { fontSize: fontSize.xs, fontWeight: '500' },
  warn: { backgroundColor: colors.warnBg },
  warnBorder: { borderTopColor: colors.warnBorder },
  warnText: { color: colors.warnButton },
  ok: { backgroundColor: colors.okBg },
  okBorder: { borderTopColor: colors.okBorder },
  idle: { backgroundColor: colors.bgMuted },
  idleBorder: { borderTopColor: colors.border },
  errText: { color: colors.errStrong },
});
