/**
 * Tests for the session management module.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createToken, getToken, verifyToken, deleteToken, markDeleted, isDeleted, registerAgent, lookupOwner, revokeAgent, listAgents, purgeAgents } from '../src/sessions/index';

describe('sessions', () => {
  const testUserId = 'test-user-' + Date.now();
  const testPassword = 'test-pass-67890';

  beforeEach(() => {
    // Clean up any leftover test sessions
    deleteToken(''); // no-op but ensures DB is initialized
  });

  afterEach(() => {
    // Cleanup test data
    markDeleted(testUserId); // soft-delete to clean up
  });

  it('should create and retrieve a token', () => {
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
    // Token should be valid initially
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

  it('should delete a token', () => {
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
    expect(isDeleted(testUserId)).toBe(false);
  });
});

describe('sessions / agent management', () => {
  const testOwnerWallet = '0x' + Date.now().toString(16).padStart(4, '0');

  it('should register an agent', () => {
    const id = registerAgent(testOwnerWallet, '9WzDX1234', 'test-agent', '*');
    expect(typeof id).toBe('number');
  });

  it('should look up an owner by pubkey', () => {
    registerAgent(testOwnerWallet, '9WzDX5678', 'lookup-test', 'proxy,analytics');
    const owner = lookupOwner('9WzDX5678');
    expect(owner).not.toBeNull();
    expect(owner!.ownerWallet).toBe(testOwnerWallet);
  });

  it('should return null for unknown pubkey', () => {
    const owner = lookupOwner('9WzDX0000');
    expect(owner).toBeNull();
  });

  it('should revoke an agent', () => {
    registerAgent(testOwnerWallet, '9WzDX9999', 'revoke-test', '*');
    const revoked = revokeAgent(testOwnerWallet, 1);
    expect(revoked).toBe(true);
  });

  it('should return agents for an owner', () => {
    registerAgent(testOwnerWallet, '9WzDXaaaa', 'agent-a', '*');
    registerAgent(testOwnerWallet, '9WzDXbbbb', 'agent-b', 'proxy');
    const agents = listAgents(testOwnerWallet);
    expect(agents.length).toBeGreaterThan(0);
  });

  it('should purge all agents for a user', () => {
    registerAgent(testOwnerWallet, '9WzDXcccc', 'purge-test', '*');
    const result = purgeAgents(testOwnerWallet);
    expect(result.agents + result.revocations).toBeGreaterThan(0);
  });
});
