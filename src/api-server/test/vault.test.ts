import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import { storeKey, loadKey, listKeys, deleteKey, getVaultPath, deleteVault } from '../src/vault/index';

describe('vault', () => {
  const testUserId = 'test-user-vault-' + Date.now();
  const testPassword = 'test-pass-12345';

  beforeAll(() => deleteVault(testUserId));
  afterAll(() => deleteVault(testUserId));

  it('should store and load a key', async () => {
    await storeKey(testUserId, 'openai', 'sk-test-key-67890', testPassword);
    const loaded = loadKey(testUserId, 'openai', testPassword);
    expect(loaded).toBe('sk-test-key-67890');
  });

  it('should reject wrong password', async () => {
    await storeKey(testUserId, 'openai', 'sk-test-key', testPassword);
    const loaded = loadKey(testUserId, 'openai', 'wrong-password');
    expect(loaded).not.toBe('sk-test-key');
  });

  it('should list stored keys', async () => {
    await storeKey(testUserId, 'openai', 'sk-1', testPassword);
    await storeKey(testUserId, 'anthropic', 'sk-2', testPassword);
    const keys = listKeys(testUserId);
    expect(keys).toContain('openai');
    expect(keys).toContain('anthropic');
  });

  it('should delete a key', async () => {
    await storeKey(testUserId, 'openai', 'sk-del', testPassword);
    const deleted = deleteKey(testUserId, 'openai');
    expect(deleted).toBe(true);
    expect(listKeys(testUserId)).not.toContain('openai');
  });

  it('should handle cross-platform paths', () => {
    const vaultPath = getVaultPath(testUserId, '.enc');
    expect(vaultPath).toContain('vault');
  });

  it('should delete entire user vault', async () => {
    await storeKey(testUserId, 'openai', 'sk-re', testPassword);
    const deleted = deleteVault(testUserId);
    expect(deleted).toBe(true);
    await storeKey(testUserId, 'openai', 'sk-re', testPassword);
    expect(loadKey(testUserId, 'openai', testPassword)).toBe('sk-re');
  });

  it('should handle multiple upstreams', async () => {
    await storeKey(testUserId, 'openai', 'sk-1', testPassword);
    await storeKey(testUserId, 'anthropic', 'sk-2', testPassword);
    await storeKey(testUserId, 'groq', 'gsk-3', testPassword);
    expect(loadKey(testUserId, 'openai', testPassword)).toBe('sk-1');
    expect(loadKey(testUserId, 'anthropic', testPassword)).toBe('sk-2');
    expect(loadKey(testUserId, 'groq', testPassword)).toBe('gsk-3');
  });
});
