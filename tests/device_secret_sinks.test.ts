import { afterEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock('@sentry/browser', () => sentry);
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('device-save diagnostic sinks', () => {
  it('redacts Sentry exceptions, breadcrumbs and transactions before they can be queued', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://synthetic@telemetry.invalid/1');
    const { initSentry } = await import('../src/web/lib/sentry');
    const { registerSavingSecret } = await import('../src/web/lib/secret-guard');
    initSentry();
    const options = sentry.init.mock.calls[0][0];
    const raw = 'sk-test-SYNTHETIC-sentry-secret';
    const release = registerSavingSecret(raw);
    try {
      for (const hook of ['beforeSend', 'beforeBreadcrumb', 'beforeSendTransaction']) {
        const result = options[hook]({ message: raw, data: { url: `https://synthetic.invalid/${raw}`, body: JSON.stringify({ raw }) } });
        expect(JSON.stringify(result)).not.toContain(raw);
        expect(JSON.stringify(result)).toContain('[REDACTED]');
      }
      expect(options.beforeSend({ exception: { values: [{ type: 'NetworkError' }] } })).toBeNull();
    } finally { release(); }
  });
  it('redacts all console outputs and retains protection until the final concurrent save completes', async () => {
    const { registerSavingSecret, assertSafeRequest } = await import('../src/web/lib/secret-guard');
    const raw = 'sk-test-SYNTHETIC-console-secret';
    const outputs: unknown[] = [];
    const methods = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'dirxml', 'table', 'assert', 'count', 'countReset', 'time', 'timeLog', 'timeEnd', 'group', 'groupCollapsed'] as const;
    for (const method of methods) vi.spyOn(console, method).mockImplementation((...args: unknown[]) => { outputs.push(args); });
    const original = console.log;
    const first = registerSavingSecret(raw);
    const second = registerSavingSecret(raw);
    try {
      first(); first();
      for (const method of methods) (console[method] as (...args: unknown[]) => void)(raw, new Error(raw), { [raw]: raw });
      expect(JSON.stringify(outputs)).not.toContain(raw);
      expect(() => assertSafeRequest('/synthetic', { body: raw })).toThrow('Refusing request');
      expect(() => assertSafeRequest('/synthetic', { body: new Blob([raw]) })).toThrow('Refusing opaque request');
    } finally { first(); second(); }
    expect(console.log).toBe(original);
    expect(() => assertSafeRequest('/synthetic', { body: raw })).not.toThrow();
  });
});
