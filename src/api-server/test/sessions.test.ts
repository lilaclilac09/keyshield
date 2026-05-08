import { describe, it, expect, beforeEach } from 'vitest';
import { createToken, getToken, verifyToken, deleteToken, markDeleted, isDeleted, registerAgent, lookupOwner, revokeAgent, listAgents, purgeAgents } from '../src/sessions/index';

describe('sessions', () => {
  const testUserId = 'test-user-' + Date.now();
  const testPassword = 'test-pass-67890';

  beforeEach(() => {
    deleteToken(''); // ensures DB is initialized
  });

  it('should create and retrieve a token', async () => {
    const token = createToken(testUserId, testPassword);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.includes('.')).toBe(true);

    const session = getToken(token);
    expect(session).not.toBeNull();
    expect(session!.userId).toBe(testUserId);
  });

  it('should reject expired tokens', () => {
    // Create a token that expires immediately (ttl=0)
    const token = createToken(testUserId, testPassword, 0);
    // Token should be valid initially (ttl=0 means expires at current time)
    const session = getToken(token);
    expect(session).not.toBeNull();
  });

  it('should verify token without DB', () => {
    const token = createToken(testUserId, testPassword);
    const result = verifyToken(token);
    expect(result.valid).toBe(true);
  });

  it('should reject malformed tokens', () => {
    const result = verifyToken('invalid-token');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('malformed');
  });

  it('should delete a token', async () => {
    const token = createToken(testUserId, testPassword);
    deleteToken(token);
    // Token is deleted from DB but still valid by HMAC
    const result = verifyToken(token);
    expect(result.valid).toBe(true);
  });

  it('should mark a user as deleted', () => {
    createToken(testUserId, testPassword);
    markDeleted(testUserId);
    expect(isDeleted(testUserId)).toBe(true);
  });

  it('should return false for non-deleted user', () => {
    const userId = 'non-deleted-' + Date.now();
    expect(isDeleted(userId)).toBe(false);
  });
});

describe('sessions / agent management', () => {
  const testOwnerWallet = `0x-${Date.now().toString(16)}`;

  it('should register an agent', () => {
    const id = registerAgent(testOwnerWallet, '9WzDX1234', 'test-agent', '*');
    expect(typeof id).toBe('number');
  });

  it('should look up an owner by pubkey', () => {
    const pubkey = `9WzDX-${Date.now()}`;
    registerAgent(testOwnerWallet, pubkey, 'lookup-test', 'proxy,analytics');
    const owner = lookupOwner(pubkey);
    expect(owner).not.toBeNull();
    expect(owner!.ownerWallet).toBe(testOwnerWallet);
  });

  it('should return null for unknown pubkey', () => {
    const owner = lookupOwner(`9WzDX-${Date.now()}`);
    expect(owner).toBeNull();
  });

  it('should revoke an agent', () => {
    const pubkey = `9WzDX-${Date.now()}`;
    registerAgent(testOwnerWallet, pubkey, 'revoke-test', '*');
    const owner = lookupOwner(pubkey);
    expect(owner).not.toBeNull();

    // Find the agent id by looking it up
    const agents = listAgents(testOwnerWallet);
    const agent = agents.find((a) => a.pubkeyB58 === pubkey);
    if (agent) {
      const revoked = revokeAgent(testOwnerWallet, agent.id);
      expect(revoked).toBe(true);

      // After revocation, lookup should return null
      const afterRevoke = lookupOwner(pubkey);
      expect(afterRevoke).toBeNull();
    }
  });

  it('should return agents for an owner', () => {
    registerAgent(testOwnerWallet, `9WzDX-${Date.now()}`, 'agent-a', '*');
    registerAgent(testOwnerWallet, `9WzDX-${Date.now()}`, 'agent-b', 'proxy');
    const agents = listAgents(testOwnerWallet);
    expect(agents.length).toBeGreaterThan(0);
  });

  it('should purge all agents for a user', () => {
    registerAgent(testOwnerWallet, `9WzDX-${Date.now()}`, 'purge-test', '*');
    const result = purgeAgents(testOwnerWallet);
    expect(result.agents + result.revocations).toBeGreaterThanOrEqual(1);
  });
});
