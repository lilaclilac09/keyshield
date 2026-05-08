import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SessionCountdown } from '@keyshield/extension-sync/src/popup/hooks/useSessionCountdown';
import { formatToastRemaining } from './sessionFormat';
import { colors, fontSize, radius, space } from '../theme';

export interface SessionExpiryToastProps {
  countdown: SessionCountdown;
  onRenew: () => void | Promise<void>;
}

export function SessionExpiryToast(props: SessionExpiryToastProps) {
  const { countdown } = props;
  const remaining = countdown.secondsRemaining ?? null;
  const sessionId = countdown.session?.ephemeralPubkey ?? null;

  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId && sessionId !== dismissedFor) {
      setDismissedFor((prev) => (prev === sessionId ? prev : null));
    }
  }, [sessionId, dismissedFor]);

  if (
    !countdown.nearExpiry ||
    remaining === null ||
    !Number.isFinite(remaining) ||
    !sessionId ||
    dismissedFor === sessionId
  ) {
    return null;
  }

  const dismiss = () => setDismissedFor(sessionId);
  const renew = async () => {
    await props.onRenew();
    dismiss();
  };

  return (
    <View
      style={styles.toast}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.row}>
        <Text style={styles.icon} accessibilityElementsHidden>
          ⏳
        </Text>
        <View style={styles.content}>
          <Text style={styles.title}>
            Session expires in {formatToastRemaining(remaining)}
          </Text>
          <Text style={styles.body}>
            Renew now to keep using your vault without re-entering Face ID or
            your recovery phrase.
          </Text>
          <View style={styles.actions}>
            <Pressable
              onPress={renew}
              accessibilityRole="button"
              accessibilityLabel="Renew now"
              style={({ pressed }) => [
                styles.renewBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.renewBtnText}>Renew now</Text>
            </Pressable>
            <Pressable
              onPress={dismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              style={({ pressed }) => [
                styles.dismissBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.dismissBtnText}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: space.m,
    left: space.m,
    right: space.m,
    backgroundColor: colors.warnBg,
    borderWidth: 1,
    borderColor: colors.warnBorder,
    borderRadius: radius.lg,
    padding: space.m,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    zIndex: 40,
  },
  row: { flexDirection: 'row', gap: space.s, alignItems: 'flex-start' },
  icon: { fontSize: 16 },
  content: { flex: 1 },
  title: { fontSize: fontSize.xs, fontWeight: '600', color: colors.warnHeading },
  body: {
    marginTop: 2,
    fontSize: fontSize.xxs,
    color: colors.warnText,
    lineHeight: 14,
  },
  actions: { flexDirection: 'row', gap: space.s, marginTop: space.s },
  renewBtn: {
    backgroundColor: colors.warnButton,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  renewBtnText: {
    color: colors.primaryFg,
    fontSize: fontSize.xxs,
    fontWeight: '500',
  },
  dismissBtn: {
    borderWidth: 1,
    borderColor: colors.warnBorder,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  dismissBtnText: { fontSize: fontSize.xxs, color: colors.warnHeading },
  pressed: { opacity: 0.85 },
});
