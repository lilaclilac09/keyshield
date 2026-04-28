import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, space } from '../theme';

export interface LostDeviceDialogProps {
  visible?: boolean;
  onStartRestore: () => void;
  onClose: () => void;
}

export function LostDeviceDialog(props: LostDeviceDialogProps) {
  const visible = props.visible ?? true;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={props.onClose}
      accessibilityViewIsModal
    >
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Lost a device with KeyShield?</Text>
            <Text style={styles.subtitle}>
              Here&apos;s how to recover access and limit what the lost device
              can still do.
            </Text>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <Step
              n={1}
              title="Restore your vault here."
              text="Enter the 24-word recovery phrase you saved at setup. Your encrypted vault decrypts on this device using only the words — no passkey is needed."
            />
            <Step
              n={2}
              title="Add a passkey to this device."
              text="Right after restoring, the popup will offer to register a new passkey via Face ID / Touch ID. Once you do, this device unlocks normally and any new vault changes are encrypted with a fresh key — the lost device will see stale data only."
            />
            <Step
              n={3}
              title="Cut off the lost device."
              text="Sign out of iCloud Keychain (Apple) or Google Password Manager (Android / Chrome) on the lost device — Find My / Find My Device can do this remotely. That removes the synced passkey from the lost device and stops it reading your vault entirely."
            />

            <View style={styles.note}>
              <Text style={styles.noteText}>
                <Text style={styles.bold}>Server-side lockout: </Text>
                after restoring on this device, the AddPasskeyBanner exposes
                a "Force-revoke other devices" button. While the seed is in
                memory KeyShield asks the sync server to wipe every existing
                passkey registration, so the lost device's next sync attempt
                404s — it can no longer pull fresh ciphertext.
              </Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              onPress={props.onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryBtnText}>Close</Text>
            </Pressable>
            <Pressable
              onPress={props.onStartRestore}
              accessibilityRole="button"
              accessibilityLabel="Restore from phrase"
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryBtnText}>Restore from phrase</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface StepProps {
  n: number;
  title: string;
  text: string;
}

function Step({ n, title, text }: StepProps) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepN}>{n}.</Text>
      <Text style={styles.stepText}>
        <Text style={styles.bold}>{title} </Text>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '88%',
  },
  header: {
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: fontSize.m, fontWeight: '600', color: colors.text },
  subtitle: {
    fontSize: fontSize.xs,
    color: colors.textHint,
    marginTop: 2,
  },
  body: { flexGrow: 0 },
  bodyContent: { padding: space.l },
  step: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: space.m,
  },
  stepN: { fontSize: fontSize.s, color: colors.text, width: 16 },
  stepText: {
    flex: 1,
    fontSize: fontSize.s,
    color: colors.text,
    lineHeight: 18,
  },
  bold: { fontWeight: '600' },
  note: {
    backgroundColor: colors.okBg,
    padding: space.s,
    borderRadius: radius.md,
    marginTop: space.s,
  },
  noteText: { fontSize: fontSize.xs, color: colors.okText },
  footer: {
    flexDirection: 'row',
    gap: space.s,
    padding: space.m,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.primaryBg,
    paddingVertical: 6,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: colors.primaryFg,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingVertical: 6,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: fontSize.xs, color: colors.text },
  pressed: { opacity: 0.85 },
});
