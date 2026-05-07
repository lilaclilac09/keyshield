import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Services } from '@keyshield/extension-sync/src/popup/wiring';
import type { AuthResult } from '@keyshield/extension-sync/src/lib/auth';
import { colors, fontSize, radius, space } from '../theme';

export interface AddPasskeyBannerProps {
  services: Services;
  onRegistered: (result: AuthResult) => Promise<void>;
  /** Optional seed-bound force-revoke action — see the popup's
   *  AddPasskeyBanner for the full rationale. */
  onForceRevoke?: () => Promise<void>;
}

export function AddPasskeyBanner(props: AddPasskeyBannerProps) {
  const [busy, setBusy] = useState(false);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokeStatus, setRevokeStatus] = useState<string | null>(null);

  const onAddPasskey = async () => {
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

  const onForceRevoke = async () => {
    if (!props.onForceRevoke) return;
    setRevokeBusy(true);
    setError(null);
    try {
      await props.onForceRevoke();
      setRevokeStatus('Other devices revoked. Add a passkey here next.');
    } catch (e: any) {
      setError(e?.message ?? 'Force-revoke failed');
    } finally {
      setRevokeBusy(false);
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
          onPress={onAddPasskey}
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

      {props.onForceRevoke && (
        <View style={styles.revokeRow}>
          <Text style={styles.revokeText}>
            Lost a device? Drop every existing passkey registration on the
            sync server.
          </Text>
          <Pressable
            onPress={onForceRevoke}
            disabled={revokeBusy}
            accessibilityRole="button"
            accessibilityLabel="Force-revoke other devices"
            accessibilityState={{ disabled: revokeBusy }}
            style={({ pressed }) => [
              styles.outlineBtn,
              revokeBusy && styles.dim,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.outlineBtnText}>
              {revokeBusy ? 'Revoking…' : 'Force-revoke other devices'}
            </Text>
          </Pressable>
        </View>
      )}

      {revokeStatus && <Text style={styles.okText}>{revokeStatus}</Text>}
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
  revokeRow: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.warnBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s,
  },
  revokeText: {
    flex: 1,
    fontSize: fontSize.xxs,
    color: colors.warnText,
  },
  outlineBtn: {
    borderWidth: 1,
    borderColor: colors.warnButton,
    paddingHorizontal: space.s,
    paddingVertical: 2,
    borderRadius: radius.md,
  },
  outlineBtnText: {
    color: colors.warnHeading,
    fontSize: fontSize.xxs,
    fontWeight: '500',
  },
  okText: {
    marginTop: 4,
    fontSize: fontSize.xxs,
    color: colors.okText,
  },
  errorText: {
    marginTop: 4,
    fontSize: fontSize.xxs,
    color: colors.errText,
  },
});
