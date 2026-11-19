import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { redact } = require('../src/desktop/redaction.js');
const { createDiagnostics } = require('../src/desktop/diagnostics.cjs');
const { requestShape, installRequestAudit } = require('../src/desktop/request-audit.cjs');
const { startupFailure, validateApiOverride, validateRenderer, authorizeTouchId } = require('../src/desktop/startup-policy.cjs');
const samples = require('../src/desktop/e2e/keys.json').samples;

describe('desktop diagnostics redaction — KS-SEC-001/002', () => {
  it('removes every acceptance fixture FAKE key from all diagnostics outputs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'desktop-security-'));
    try {
      const file = join(dir, 'launch.log');
      const diag = createDiagnostics(file);
      for (const { value } of samples) {
        diag.log(`error ${value}`);
        diag.recordRendererError(`error ${value}`, `https://example.test/failure?token=${encodeURIComponent(value)}#secret`);
      }
      const outputs = [readFileSync(file, 'utf8'), diag.summary(), JSON.stringify(diag.recentErrors())];
      for (const { value } of samples) for (const output of outputs) expect(output).not.toContain(value);
      expect(outputs.join('')).not.toContain('?token=');
    } finally { rmSync(dir, { recursive: true }); }
  });

  it.each([
    ['email=ks-test+1@example.invalid', 'ks-test+1@example.invalid'],
    ['Authorization: Basic short-password', 'short-password'],
    ['Cookie: session=short-secret', 'short-secret'],
    ['Bearer short-secret', 'short-secret'],
    ['AWS access key AKIAIOSFODNN7EXAMPLE', 'AKIAIOSFODNN7EXAMPLE'],
    ['AWS session key ASIAIOSFODNN7EXAMPLE', 'ASIAIOSFODNN7EXAMPLE'],
    ['eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiYWxpY2UifQ.signature', 'eyJ1c2VyIjoiYWxpY2UifQ'],
    ['eyJhbGciOiJIUzI1NiJ9.e30.signature', 'eyJhbGciOiJIUzI1NiJ9.e30.signature'],
    ['sk-proj-short-secret ks_short-secret', 'short-secret'],
    ['abcdef0123456789abcdef0123456789', 'abcdef0123456789abcdef0123456789'],
    ['QWxhZGRpbjpvcGVuIHNlc2FtZQ==', 'QWxhZGRpbjpvcGVuIHNlc2FtZQ=='],
    ['request {"apiKey":"short-value","nested":{"password":"another"}}', 'short-value'],
    ['body=[{"secret":"short-value"}]', 'short-value'],
    ['https://user:short-value@example.test/path?token=short-value#short-value', 'short-value'],
  ])('redacts %s', (input, secret) => {
    expect(redact(input)).not.toContain(secret);
    expect(redact(redact(input))).toBe(redact(input));
  });

  it('keeps empty inputs and ordinary failures useful', () => {
    expect(redact(undefined)).toBe('');
    expect(redact('Cannot access X before initialization')).toBe('Cannot access X before initialization');
    expect(redact('https://example.test/path?a=b#c')).toBe('https://example.test/path');
  });
});

describe('startup policy — KS-HUM-003/SEC-002/SAFE-002', () => {
  const healthy = { packaged: true, preflight: { ok: true }, rendererValid: true, api: '' };
  it('accepts a complete offline bundle', () => expect(startupFailure(healthy)).toBeNull());
  it.each([
    { preflight: { ok: false } }, { rendererValid: false }, { interceptError: true }, { api: 'http://example.test' },
  ])('blocks unsafe packaged startup %j', (failure) => expect(startupFailure({ ...healthy, ...failure })).toBeTruthy());
  it.each(['http://127.0.0.1:8001', 'http://localhost:8001', 'http://[::1]:8001', 'https://example.test', ''])('allows API %s', (url) => expect(() => validateApiOverride(url)).not.toThrow());
  it.each(['http://example.test', 'http://127.0.0.1.evil.test', 'file:///tmp/api', 'not a url', 'https://user:pass@example.test', 'https://example.test?token=secret'])('rejects API %s', (url) => expect(() => validateApiOverride(url)).toThrow());
  it('validates local renderer assets, rejecting missing entrypoints and assets', () => {
    const dir = mkdtempSync(join(tmpdir(), 'desktop-renderer-'));
    try {
      expect(validateRenderer(dir)).toBe(false);
      writeFileSync(join(dir, 'index.html'), '<div id="root"></div><script src="/assets/app.js"></script><link href="/assets/app.css">');
      expect(validateRenderer(dir)).toBe(false);
      mkdirSync(join(dir, 'assets'));
      writeFileSync(join(dir, 'assets/app.js'), 'void 0');
      writeFileSync(join(dir, 'assets/app.css'), 'body{}');
      expect(validateRenderer(dir)).toBe(true);
      writeFileSync(join(dir, 'index.html'), '<div id="root"></div>');
      expect(validateRenderer(dir)).toBe(false);
    } finally { rmSync(dir, { recursive: true }); }
  });
  it('fails unsupported, canceled and unavailable Touch ID closed; approval succeeds', async () => {
    expect((await authorizeTouchId({}, 'darwin', 'Approve')).ok).toBe(false);
    expect((await authorizeTouchId({}, 'linux', 'Approve')).ok).toBe(false);
    expect((await authorizeTouchId({ canPromptTouchID: () => false, promptTouchID: vi.fn() }, 'darwin', 'Approve')).ok).toBe(false);
    const denied = await authorizeTouchId({ promptTouchID: () => Promise.reject(new Error('secret')) }, 'darwin', 'Approve');
    expect(denied).toEqual({ ok: false, error: expect.stringContaining('canceled') });
    expect(await authorizeTouchId({ promptTouchID: () => Promise.resolve() }, 'darwin', 'Approve')).toEqual({ ok: true });
  });
});

describe('opt-in request audit — KS-SEC-002', () => {
  const request = (body: string) => ({ method: 'POST', url: 'https://example.test/manage/store?token=hidden#secret', uploadData: [{ bytes: Buffer.from(body) }] });
  it('records plaintext presence without recording values, headers or queries', () => {
    const value = samples[0].value;
    const shape = requestShape({ ...request(JSON.stringify({ apiKey: value, value, upstream: 'openai' })), headers: { Authorization: 'Bearer secret' } });
    expect(shape).toEqual({ method: 'POST', route: '/manage/store', bodyFieldNames: ['apiKey', 'upstream', 'value'], hasCiphertextEnvelope: false, plaintextFieldPresent: true, syntheticMarkerPresent: true });
    expect(JSON.stringify(shape)).not.toContain(value);
    expect(JSON.stringify(shape)).not.toContain('hidden');
  });
  it('detects encrypted envelopes, mixed requests, and empty/invalid bodies', () => {
    expect(requestShape(request('{"cipher":"opaque","iv":"nonce"}')).hasCiphertextEnvelope).toBe(true);
    expect(requestShape(request('{"cipher":"opaque","iv":"nonce","nested":{"rawKey":"FAKE"}}')).plaintextFieldPresent).toBe(true);
    for (const body of ['', 'not JSON', 'null']) expect(requestShape(request(body)).bodyFieldNames).toEqual([]);
  });
  it('is off by default and always releases requests even on a write error', () => {
    const onBeforeRequest = vi.fn();
    const ses = { webRequest: { onBeforeRequest } };
    expect(installRequestAudit(ses, '')).toBe(false);
    expect(onBeforeRequest).not.toHaveBeenCalled();
    installRequestAudit(ses, '/nonexistent-directory/audit.jsonl');
    expect(onBeforeRequest.mock.calls[0][0]).toEqual({ urls: ['http://*/*', 'https://*/*'] });
    const callback = vi.fn();
    onBeforeRequest.mock.calls[0][1](request('{}'), callback);
    expect(callback).toHaveBeenCalledWith({ cancel: false });
  });
});
