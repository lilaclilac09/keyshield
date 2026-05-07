import { describe, it, expect } from 'vitest';

/**
 * Smoke test that the vitest harness itself is wired up correctly.
 * Real SDK tests live alongside the modules they cover (e.g. session.test.ts).
 */
describe('agent-sdk test harness', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
