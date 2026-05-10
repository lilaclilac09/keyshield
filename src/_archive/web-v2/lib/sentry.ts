import * as Sentry from '@sentry/browser';
const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export function initSentry(): void {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN, environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    beforeSend(event) { if (event.exception?.values?.[0]?.type === 'NetworkError') return null; return event; },
  });
}
