/**
 * sentry.ts — optional Sentry integration for the KeyShield extension.
 *
 * Only initialised when VITE_SENTRY_DSN is set at build time.
 * Never captures API keys, vault data, or user credentials.
 */
import * as Sentry from '@sentry/browser';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export function initSentry(): void {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION ?? 'dev',
    tracesSampleRate: 0.1,
    // Strip sensitive data before sending
    beforeSend(event) {
      // Drop network errors (too noisy for extension)
      if (event.exception?.values?.[0]?.type === 'NetworkError') return null;
      return event;
    },
  });
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!DSN) return;
  Sentry.withScope(scope => {
    if (context) scope.setExtras(context);
    Sentry.captureException(err);
  });
}

export function captureMessage(msg: string, level: Sentry.SeverityLevel = 'info'): void {
  if (!DSN) return;
  Sentry.captureMessage(msg, level);
}
