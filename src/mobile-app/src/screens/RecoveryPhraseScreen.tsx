import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, fontSize, radius, space } from '../theme';

export interface RecoveryPhraseScreenProps {
  mnemonic: string;
  onAcknowledge: () => void;
}

const CONFIRMATION_TEXT = 'I have saved my phrase';

export function RecoveryPhraseScreen(props: RecoveryPhraseScreenProps) {
  const words = props.mnemonic.split(' ');
  const [confirmation, setConfirmation] = useState('');
  const [revealed, setRevealed] = useState(true);

  const canProceed = confirmation.trim() === CONFIRMATION_TEXT;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.icon} accessibilityElementsHidden>
        🔑
      </Text>
      <Text style={styles.title}>Save your recovery phrase</Text>
      <Text style={styles.body}>
        These 24 words are the only way to recover your vault if you lose
        every device with your passkey. Write them down or store them in a
        password manager. Anyone with these words can access your vault.
      </Text>

      <View style={styles.revealRow}>
        <Text style={styles.smallCaps}>Recovery phrase</Text>
        <Pressable
          onPress={() => setRevealed((r) => !r)}
          accessibilityRole="button"
          accessibilityLabel={revealed ? 'hide' : 'reveal'}
        >
          <Text style={styles.revealLink}>{revealed ? 'hide' : 'reveal'}</Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {words.map((word, i) => (
          <View key={i} style={styles.gridCell}>
            <Text style={styles.wordIndex}>{i + 1}</Text>
            <Text style={styles.wordText}>
              {revealed ? word : '••••••'}
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.smallCapsLabel}>
        Type "{CONFIRMATION_TEXT}" to confirm
      </Text>
      <TextInput
        value={confirmation}
        onChangeText={setConfirmation}
        placeholder={CONFIRMATION_TEXT}
        accessibilityLabel="Confirmation text"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />

      <Pressable
        onPress={props.onAcknowledge}
        disabled={!canProceed}
        accessibilityRole="button"
        accessibilityLabel="Continue to vault"
        accessibilityState={{ disabled: !canProceed }}
        style={({ pressed }) => [
          styles.primaryBtn,
          !canProceed && styles.dim,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.primaryBtnText}>Continue to vault</Text>
      </Pressable>

      <Text style={styles.footer}>
        KeyShield does not keep a copy of these words. Lose them and lose
        every device with your passkey, and your vault is unrecoverable.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPage },
  content: { padding: space.l },
  icon: { fontSize: 28, marginBottom: space.xs, textAlign: 'center' },
  title: {
    fontSize: fontSize.l,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  body: {
    marginTop: space.xs,
    fontSize: fontSize.s,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: space.m,
  },
  revealRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.s,
  },
  smallCaps: {
    fontSize: fontSize.xxs,
    color: colors.textHint,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  smallCapsLabel: {
    fontSize: fontSize.xxs,
    color: colors.textHint,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: space.s,
  },
  revealLink: { fontSize: fontSize.xxs, color: colors.textHint },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.s,
    marginBottom: space.l,
  },
  gridCell: {
    width: '33.333%',
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingVertical: space.xs,
    paddingHorizontal: space.xs,
    backgroundColor: colors.bgCard,
    borderRadius: radius.sm,
    marginBottom: space.xs,
    gap: 6,
  },
  wordIndex: {
    fontSize: 9,
    color: colors.textFaint,
    fontVariant: ['tabular-nums'],
    minWidth: 16,
    textAlign: 'right',
  },
  wordText: {
    fontFamily: 'Menlo',
    fontSize: fontSize.xs,
    color: colors.text,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.s,
    paddingVertical: space.s,
    fontSize: fontSize.s,
    marginBottom: space.m,
    color: colors.text,
  },
  primaryBtn: {
    backgroundColor: colors.primaryBg,
    paddingVertical: space.s,
    paddingHorizontal: space.l,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: colors.primaryFg,
    fontSize: fontSize.m,
    fontWeight: '500',
  },
  pressed: { opacity: 0.85 },
  dim: { opacity: 0.5 },
  footer: {
    marginTop: space.m,
    fontSize: fontSize.xxs,
    lineHeight: 14,
    color: colors.textFaint,
  },
});
