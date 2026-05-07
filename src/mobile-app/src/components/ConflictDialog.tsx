import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  ConflictChoice,
  KeyConflict,
} from '@keyshield/extension-sync/src/lib/conflict';
import { maskValue } from '../screens/vaultListHelpers';
import { colors, fontSize, radius, space } from '../theme';

export interface ConflictDialogProps {
  visible?: boolean;
  conflicts: KeyConflict[];
  onResolve: (resolutions: Record<string, ConflictChoice>) => void;
  onCancel: () => void;
}

export function ConflictDialog(props: ConflictDialogProps) {
  const visible = props.visible ?? true;

  // Default to "theirs" — what's already on the sync backend.
  const initial = useMemo<Record<string, ConflictChoice>>(() => {
    const out: Record<string, ConflictChoice> = {};
    for (const c of props.conflicts) out[c.name] = 'theirs';
    return out;
  }, [props.conflicts]);

  const [picks, setPicks] = useState(initial);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const setAll = (choice: ConflictChoice) => {
    const next: Record<string, ConflictChoice> = {};
    for (const c of props.conflicts) next[c.name] = choice;
    setPicks(next);
  };

  const toggleReveal = (name: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={props.onCancel}
      accessibilityViewIsModal
    >
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Vault out of sync</Text>
            <Text style={styles.subtitle}>
              {props.conflicts.length} key
              {props.conflicts.length === 1 ? '' : 's'} differ between this
              device and your other devices. Pick what to keep.
            </Text>
          </View>

          <View style={styles.bulkRow}>
            <Pressable
              onPress={() => setAll('mine')}
              accessibilityRole="button"
              accessibilityLabel="Keep all mine"
              style={({ pressed }) => [
                styles.bulkBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.bulkBtnText}>Keep all mine</Text>
            </Pressable>
            <Pressable
              onPress={() => setAll('theirs')}
              accessibilityRole="button"
              accessibilityLabel="Keep all theirs"
              style={({ pressed }) => [
                styles.bulkBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.bulkBtnText}>Keep all theirs</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.list}>
            {props.conflicts.map((c) => {
              const choice = picks[c.name];
              const showReveal = revealed.has(c.name);
              return (
                <View key={c.name} style={styles.item}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemName}>{c.name}</Text>
                    <Pressable
                      onPress={() => toggleReveal(c.name)}
                      accessibilityRole="button"
                      accessibilityLabel={showReveal ? 'hide' : 'reveal'}
                    >
                      <Text style={styles.revealLink}>
                        {showReveal ? 'hide' : 'reveal'}
                      </Text>
                    </Pressable>
                  </View>
                  {(['mine', 'theirs'] as ConflictChoice[]).map((side) => {
                    const rec = side === 'mine' ? c.mine : c.theirs;
                    const label =
                      side === 'mine' ? 'This device' : 'Other device';
                    const selected = choice === side;
                    return (
                      <Pressable
                        key={side}
                        onPress={() =>
                          setPicks((prev) => ({ ...prev, [c.name]: side }))
                        }
                        accessibilityRole="radio"
                        accessibilityLabel={`${label} for ${c.name}`}
                        accessibilityState={{ selected }}
                        style={[
                          styles.choice,
                          selected && styles.choiceSelected,
                        ]}
                      >
                        <View
                          style={[
                            styles.radio,
                            selected && styles.radioSelected,
                          ]}
                        />
                        <View style={styles.choiceBody}>
                          <Text style={styles.choiceLabel}>{label}</Text>
                          <Text style={styles.choiceValue}>
                            {showReveal ? rec.value : maskValue(rec.value)}
                          </Text>
                          <Text style={styles.choiceTimestamp}>
                            updated{' '}
                            {new Date(rec.createdAt).toISOString().slice(0, 19)}
                            Z
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              onPress={props.onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => props.onResolve(picks)}
              accessibilityRole="button"
              accessibilityLabel="Save merged"
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryBtnText}>Save merged</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
  bulkRow: {
    flexDirection: 'row',
    gap: space.s,
    paddingHorizontal: space.l,
    paddingVertical: space.s,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bulkBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingVertical: 6,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  bulkBtnText: { fontSize: fontSize.xs, color: colors.text },

  list: { flexGrow: 0 },
  item: {
    paddingHorizontal: space.m,
    paddingVertical: space.m,
    borderBottomWidth: 1,
    borderBottomColor: colors.bgMuted,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.s,
  },
  itemName: { fontSize: fontSize.s, fontWeight: '500', color: colors.text },
  revealLink: { fontSize: fontSize.xxs, color: colors.textHint },

  choice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.s,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.s,
    marginBottom: space.xs,
  },
  choiceSelected: {
    borderColor: colors.primaryBg,
    backgroundColor: colors.bgSubtle,
  },
  radio: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginTop: 2,
  },
  radioSelected: {
    borderColor: colors.primaryBg,
    backgroundColor: colors.primaryBg,
  },
  choiceBody: { flex: 1 },
  choiceLabel: {
    fontSize: fontSize.xxs,
    color: colors.textHint,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  choiceValue: {
    marginTop: 2,
    fontFamily: 'Menlo',
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  choiceTimestamp: {
    marginTop: 2,
    fontSize: fontSize.xxs,
    color: colors.textFaint,
  },

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
