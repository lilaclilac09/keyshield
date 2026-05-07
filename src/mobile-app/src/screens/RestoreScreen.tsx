import React, { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  isValidMnemonic,
  normalizePhrase,
} from '@keyshield/extension-sync/src/lib/mnemonic';
import { colors, fontSize, radius, space } from '../theme';

export interface RestoreScreenProps {
  onRestore: (phrase: string) => Promise<void>;
  onCancel: () => void;
}

export function RestoreScreen(props: RestoreScreenProps) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalised = useMemo(() => normalizePhrase(input), [input]);
  const wordCount = normalised ? normalised.split(' ').length : 0;
  const valid = wordCount === 24 && isValidMnemonic(normalised);

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await props.onRestore(normalised);
    } catch (e: any) {
      setError(e?.message ?? 'Restore failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.icon} accessibilityElementsHidden>
        🌱
      </Text>
      <Text style={styles.title}>Restore from recovery phrase</Text>
      <Text style={styles.body}>
        Enter the 24-word phrase you saved when you set up your vault. The
        vault will decrypt locally — KeyShield never sees the phrase.
      </Text>

      <TextInput
        value={input}
        onChangeText={setInput}
        multiline
        numberOfLines={6}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Recovery phrase input"
        placeholder="word1 word2 word3 ... word24"
        style={styles.textArea}
      />

      <View style={styles.statusRow}>
        <Text style={styles.statusText}>
          {wordCount} / 24 words
          {wordCount === 24 && !valid ? ' (checksum failed — check spelling)' : ''}
        </Text>
        {valid && <Text style={styles.statusOk}>phrase looks good ✓</Text>}
      </View>

      {error && (
        <View style={styles.errorBox} accessibilityLiveRegion="polite">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.btnRow}>
        <Pressable
          onPress={props.onCancel}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [
            styles.secondaryBtn,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.secondaryBtnText}>Back</Text>
        </Pressable>
        <Pressable
          onPress={submit}
          disabled={!valid || busy}
          accessibilityRole="button"
          accessibilityLabel="Restore vault"
          accessibilityState={{ disabled: !valid || busy }}
          style={({ pressed }) => [
            styles.primaryBtn,
            (!valid || busy) && styles.dim,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.primaryBtnText}>
            {busy ? 'Restoring…' : 'Restore vault'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.footer}>
        After restoring, register a new passkey so future unlocks don&apos;t
        require typing the phrase again.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: space.l, backgroundColor: colors.bgPage },
  icon: { fontSize: 28, textAlign: 'center', marginBottom: space.xs },
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
  textArea: {
    width: '100%',
    minHeight: 110,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    padding: space.s,
    fontFamily: 'Menlo',
    fontSize: fontSize.xs,
    marginBottom: space.s,
    textAlignVertical: 'top',
    color: colors.text,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.m,
  },
  statusText: { fontSize: fontSize.xxs, color: colors.textHint, flex: 1 },
  statusOk: { fontSize: fontSize.xxs, color: colors.okText },
  errorBox: {
    backgroundColor: colors.errBg,
    padding: space.s,
    borderRadius: radius.md,
    marginBottom: space.m,
  },
  errorText: { fontSize: fontSize.xs, color: colors.errText },
  btnRow: { flexDirection: 'row', gap: space.s },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.primaryBg,
    paddingVertical: space.s,
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
    paddingVertical: space.s,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: fontSize.xs, color: colors.text },
  pressed: { opacity: 0.85 },
  dim: { opacity: 0.5 },
  footer: {
    marginTop: space.l,
    fontSize: fontSize.xxs,
    lineHeight: 14,
    color: colors.textFaint,
  },
});
