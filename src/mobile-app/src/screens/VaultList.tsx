import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {
  ApiKeyRecord,
  VaultPlain,
} from '@keyshield/extension-sync/src/lib/vault';
import {
  collectTags,
  filterEntries,
  maskedDots,
  parseTagsInput,
  relativeTime,
} from './vaultListHelpers';
import { colors, fontSize, radius, space } from '../theme';

export interface VaultListProps {
  vault: VaultPlain;
  onUpsertKey: (name: string, value: string, tags?: string[]) => Promise<void>;
  onRemoveKey: (name: string) => Promise<void>;
  onTouchKey?: (name: string) => Promise<void>;
  onLock: () => void;
}

export function VaultList(props: VaultListProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newTags, setNewTags] = useState('');
  const [revealedName, setRevealedName] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const allTags = useMemo(() => collectTags(props.vault), [props.vault]);
  const entries = useMemo(
    () => filterEntries(props.vault, search, activeTag),
    [props.vault, search, activeTag],
  );

  const totalCount = Object.keys(props.vault.apiKeys).length;
  const filtered = entries.length !== totalCount;

  const onSave = async () => {
    const name = newName.trim();
    const value = newValue.trim();
    if (!name || !value) return;
    await props.onUpsertKey(name, value, parseTagsInput(newTags));
    setNewName('');
    setNewValue('');
    setNewTags('');
    setShowAdd(false);
  };

  const onReveal = async (name: string) => {
    if (revealedName === name) {
      setRevealedName(null);
      return;
    }
    setRevealedName(name);
    if (props.onTouchKey) {
      props.onTouchKey(name).catch(() => {});
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Your API keys</Text>
          <Text style={styles.subtitle}>
            {filtered
              ? `${entries.length} of ${totalCount} shown`
              : `${totalCount} stored on this device`}
          </Text>
        </View>
        <Pressable
          onPress={props.onLock}
          accessibilityRole="button"
          accessibilityLabel="Lock"
        >
          <Text style={styles.lockLink}>Lock</Text>
        </Pressable>
      </View>

      {totalCount > 0 && (
        <View style={styles.searchRow}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or tag…"
            accessibilityLabel="Search keys"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
          />
          {allTags.length > 0 && (
            <View style={styles.tagRow}>
              {allTags.map((t) => {
                const active = activeTag === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => setActiveTag(active ? null : t)}
                    accessibilityRole="button"
                    accessibilityLabel={`#${t}`}
                    accessibilityState={{ selected: active }}
                    style={[styles.tagPill, active && styles.tagPillActive]}
                  >
                    <Text
                      style={[
                        styles.tagPillText,
                        active && styles.tagPillTextActive,
                      ]}
                    >
                      #{t}
                    </Text>
                  </Pressable>
                );
              })}
              {activeTag && (
                <Pressable
                  onPress={() => setActiveTag(null)}
                  accessibilityRole="button"
                  accessibilityLabel="clear filter"
                >
                  <Text style={styles.clearLink}>clear</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      >
        {totalCount === 0 && !showAdd && (
          <Text style={styles.emptyText}>
            No keys yet. Tap "+ Add key" below.
          </Text>
        )}
        {totalCount > 0 && entries.length === 0 && (
          <Text style={styles.emptyText}>
            No matches. Adjust your search or clear the tag filter.
          </Text>
        )}

        {entries.map(([name, rec]) => (
          <KeyRow
            key={name}
            name={name}
            rec={rec}
            revealed={revealedName === name}
            onReveal={() => onReveal(name)}
            onRemove={() => props.onRemoveKey(name)}
          />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        {showAdd ? (
          <View>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Name (e.g. openai-prod)"
              accessibilityLabel="Key name"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <TextInput
              value={newValue}
              onChangeText={setNewValue}
              placeholder="Value (sk-…)"
              accessibilityLabel="Key value"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={[styles.input, styles.mono]}
            />
            <TextInput
              value={newTags}
              onChangeText={setNewTags}
              placeholder="Tags (comma-separated, optional)"
              accessibilityLabel="Tags"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <View style={styles.btnRow}>
              <Pressable
                onPress={onSave}
                accessibilityRole="button"
                accessibilityLabel="Save"
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.primaryBtnText}>Save</Text>
              </Pressable>
              <Pressable
                onPress={() => setShowAdd(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => setShowAdd(true)}
            accessibilityRole="button"
            accessibilityLabel="Add key"
            style={({ pressed }) => [
              styles.addBtn,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.addBtnText}>+ Add key</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

interface KeyRowProps {
  name: string;
  rec: ApiKeyRecord;
  revealed: boolean;
  onReveal: () => void;
  onRemove: () => void;
}

function KeyRow({ name, rec, revealed, onReveal, onRemove }: KeyRowProps) {
  return (
    <View style={styles.keyCard}>
      <View style={styles.keyHeader}>
        <Text style={styles.keyName}>{name}</Text>
        <View style={styles.keyActions}>
          <Pressable
            onPress={onReveal}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'hide' : 'reveal'}
          >
            <Text style={styles.keyAction}>
              {revealed ? 'hide' : 'reveal'}
            </Text>
          </Pressable>
          <Pressable
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel="delete"
          >
            <Text style={styles.keyDelete}>delete</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.keyValue}>
        {revealed ? rec.value : maskedDots(rec.value)}
      </Text>
      <View style={styles.keyMeta}>
        <Text style={styles.keyMetaText}>{relativeTime(rec.lastUsedAt)}</Text>
        {rec.tags && rec.tags.length > 0 && (
          <View style={styles.keyTags}>
            {rec.tags.map((t) => (
              <Text key={t} style={styles.keyTag}>
                #{t}
              </Text>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPage },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: fontSize.m, fontWeight: '600', color: colors.text },
  subtitle: { fontSize: fontSize.xxs, color: colors.textHint },
  lockLink: { fontSize: fontSize.xs, color: colors.textHint },

  searchRow: {
    paddingHorizontal: space.l,
    paddingVertical: space.s,
    borderBottomWidth: 1,
    borderBottomColor: colors.bgMuted,
  },
  searchInput: {
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.s,
    paddingVertical: 6,
    fontSize: fontSize.s,
    color: colors.text,
  },
  tagRow: {
    marginTop: space.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  tagPill: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgCard,
    paddingHorizontal: space.s,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  tagPillActive: {
    backgroundColor: colors.primaryBg,
    borderColor: colors.primaryBg,
  },
  tagPillText: { fontSize: fontSize.xxs, color: colors.textMuted },
  tagPillTextActive: { color: colors.primaryFg },
  clearLink: {
    fontSize: fontSize.xxs,
    color: colors.textHint,
    textDecorationLine: 'underline',
    marginLeft: 4,
  },

  list: { flex: 1 },
  listContent: { padding: space.l, gap: space.s },
  emptyText: {
    marginTop: space.xl,
    textAlign: 'center',
    fontSize: fontSize.s,
    color: colors.textHint,
  },

  keyCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: space.s,
  },
  keyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  keyName: { fontSize: fontSize.s, fontWeight: '500', color: colors.text },
  keyActions: { flexDirection: 'row', gap: space.s },
  keyAction: { fontSize: fontSize.xxs, color: colors.textHint },
  keyDelete: { fontSize: fontSize.xxs, color: colors.errStrong },
  keyValue: {
    marginTop: space.xs,
    fontFamily: 'Menlo',
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  keyMeta: {
    marginTop: space.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  keyMetaText: { fontSize: fontSize.xxs, color: colors.textFaint },
  keyTags: { flexDirection: 'row', gap: 4 },
  keyTag: {
    fontSize: fontSize.xxs,
    color: colors.textFaint,
    backgroundColor: colors.bgMuted,
    paddingHorizontal: 4,
    borderRadius: radius.sm,
  },

  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: space.m,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.s,
    paddingVertical: 6,
    fontSize: fontSize.xs,
    marginBottom: space.s,
    color: colors.text,
  },
  mono: { fontFamily: 'Menlo' },
  btnRow: { flexDirection: 'row', gap: space.s },
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
  addBtn: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderStyle: 'dashed',
    paddingVertical: space.s,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  addBtnText: { fontSize: fontSize.xs, color: colors.textMuted },
  pressed: { opacity: 0.85 },
});
