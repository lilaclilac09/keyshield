import { describe, it, expect, vi } from 'vitest';
import {
  detectPrfSupport,
  getUpgradeMessage,
  type PlatformProbe,
} from './platform';

function probe(opts: Partial<PlatformProbe>): PlatformProbe {
  return {
    hasPublicKeyCredential: opts.hasPublicKeyCredential ?? true,
    getClientCapabilities: opts.getClientCapabilities,
  };
}

describe('detectPrfSupport', () => {
  it("reports 'unsupported' when PublicKeyCredential is missing entirely", async () => {
    const r = await detectPrfSupport(probe({ hasPublicKeyCredential: false }));
    expect(r).toBe('unsupported');
  });

  it("reports 'unknown' when getClientCapabilities is missing (older browser)", async () => {
    const r = await detectPrfSupport(probe({ getClientCapabilities: undefined }));
    expect(r).toBe('unknown');
  });

  it("reports 'supported' when getClientCapabilities reports 'extension:prf': true", async () => {
    const r = await detectPrfSupport(
      probe({ getClientCapabilities: async () => ({ 'extension:prf': true }) }),
    );
    expect(r).toBe('supported');
  });

  it("reports 'unsupported' when getClientCapabilities reports 'extension:prf': false", async () => {
    const r = await detectPrfSupport(
      probe({ getClientCapabilities: async () => ({ 'extension:prf': false }) }),
    );
    expect(r).toBe('unsupported');
  });

  it("reports 'unknown' when capabilities omit any prf key", async () => {
    const r = await detectPrfSupport(
      probe({
        getClientCapabilities: async () => ({
          userVerifyingPlatformAuthenticator: true,
        }),
      }),
    );
    expect(r).toBe('unknown');
  });

  it('also accepts the older extensionPrf alias', async () => {
    const r = await detectPrfSupport(
      probe({ getClientCapabilities: async () => ({ extensionPrf: true } as any) }),
    );
    expect(r).toBe('supported');
  });

  it("returns 'unknown' if getClientCapabilities throws", async () => {
    const cap = vi.fn(async () => {
      throw new Error('platform not ready');
    });
    const r = await detectPrfSupport(probe({ getClientCapabilities: cap }));
    expect(r).toBe('unknown');
    expect(cap).toHaveBeenCalledOnce();
  });
});

describe('getUpgradeMessage', () => {
  it('mentions Safari, Chrome, and Firefox version floors', () => {
    const msg = getUpgradeMessage();
    expect(msg).toMatch(/Safari 17/i);
    expect(msg).toMatch(/Chrome 116/i);
    expect(msg).toMatch(/Firefox 119/i);
  });
});
