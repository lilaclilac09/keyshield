import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { storeKey, loadKey, listKeys, deleteKey, getVaultPath, deleteVault, hashPassword } from '../src/vault/index';

describe('vault', () => {
  const testUserId = 'test-vault-' + Date.now();
  const testPassword = 'test-pass-' + Date.now();

  beforeAll(async () => {
    // Clean up after any previous runs
    deleteVault(testUserId);
  });

  afterAll(() => {
    deleteVault(testUserId);
  });

  it('should store and load a key', async () => {
    const apiKey = 'sk-test-key-' + Date.now();
    await storeKey(testUserId, 'openai', apiKey, testPassword);
    const loaded = await loadKey(testUserId, 'openai', testPassword);
    expect(loaded).toBe(apiKey);
  });

  it('should reject wrong password', async () => {
    const ts = Date.now();
    const apiKey = 'sk-wrong-pass';
    await storeKey(testUserId, 'wrong-pass', apiKey, testPassword);
    const loaded = await loadKey(testUserId, 'wrong-pass', 'WRONG-' + ts);
    expect(loaded).not.toBe(apiKey);
  });

  it('should list stored keys', async () => {
    await storeKey(testUserId, 'openai-' + Date.now(), 'sk-1', testPassword);
    await storeKey(testUserId, 'anthropic-' + Date.now(), 'sk-2', testPassword);
    const keys = listKeys(testUserId);
    expect(keys.some((k) => k.startsWith('openai'))).toBe(true);
    expect(keys.some((k) => k.startsWith('anthropic'))).toBe(true);
  });

  it('should delete a key', async () => {
    const ts = Date.now();
    await storeKey(testUserId, 'del-' + ts, 'sk-del', testPassword);
    const deleted = deleteKey(testUserId, 'del-' + ts);
    expect(deleted).toBe(true);
    const keys = listKeys(testUserId);
    expect(keys.some((k) => k.startsWith('del-'))).toBe(false);
  });

  it('should handle cross-platform paths', () => {
    const vaultPath = getVaultPath(testUserId, '.enc');
    expect(vaultPath.includes('vault')).toBe(true);
  });

  it('should delete entire user vault', async () => {
    const ts = Date.now();
    const apiKey = 'sk-recreate';
    await storeKey(testUserId, 'recreate-' + ts, apiKey, testPassword);
    const deleted = deleteVault(testUserId);
    expect(deleted).toBe(true);
    // Recreate and verify it works
    await storeKey(testUserId, 'recreate-' + ts, apiKey, testPassword);
    // loadKey should find the file by prefix match (not exact name)
    const loaded = await loadKey(testUserId, 'recreate', testPassword);
    expect(loaded).toBe(apiKey);
  });

  it('should handle multiple upstreams', async () => {
    const ts = Date.now();
    await storeKey(testUserId, `multi-${ts}-1`, 'sk-1', testPassword);
    await storeKey(testUserId, `multi-${ts}-2`, 'sk-2', testPassword);
    await storeKey(testUserId, `multi-${ts}-3`, 'sk-3', testPassword);

    const loaded1 = await loadKey(testUserId, `multi-${ts}-1`, testPassword);
    const loaded2 = await loadKey(testUserId, `multi-${ts}-2`, testPassword);
    const loaded3 = await loadKey(testUserId, `multi-${ts}-3`, testPassword);
    expect(loaded1).toBe('sk-1');
    expect(loaded2).toBe('sk-2');
    expect(loaded3).toBe('sk-3');
  });
});
