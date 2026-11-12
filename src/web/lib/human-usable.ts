import type { AppFeedbackKind } from './app-feedback';

export const HUMAN_FEEDBACK_VISIBLE_MS: Record<AppFeedbackKind, number> = {
  success: 6500,
  error: 9000,
  busy: 12000,
  info: 5000,
};

export function feedbackVisibleMs(kind: AppFeedbackKind): number {
  return HUMAN_FEEDBACK_VISIBLE_MS[kind] ?? HUMAN_FEEDBACK_VISIBLE_MS.info;
}

type HumanAction =
  | 'passkey-signin'
  | 'passkey-signup'
  | 'wallet-connect'
  | 'vault-save'
  | 'desktop-touch-id'
  | 'demo-login'
  | 'email-login'
  | 'email-signup'
  | 'google-auth'
  | 'agent-register'
  | 'agent-login';

function normalizeMessage(raw: unknown, fallback: string): string {
  if (raw instanceof Error && raw.message) return raw.message.trim();
  const msg = String(raw ?? '').trim();
  return msg || fallback;
}

function withNextStep(detail: string, step: string): string {
  if (/next step:/i.test(detail)) return detail;
  return `${detail} Next step: ${step}`;
}

function defaultStep(action: HumanAction): string {
  switch (action) {
    case 'passkey-signin':
      return 'click Sign In again, keep KeyShield in front, and approve the passkey prompt';
    case 'passkey-signup':
      return 'click Create account again and approve the passkey prompt';
    case 'wallet-connect':
      return 'click Try Again and approve the wallet popup';
    case 'vault-save':
      return 'paste the full key with prefix and click Save again';
    case 'desktop-touch-id':
      return 'click Sign In again or paste a session token from the hosted dashboard';
    case 'demo-login':
      return 'retry once; if it still fails, sign in with passkey or wallet first';
    case 'email-login':
      return 'check the email and password, or tap Create account if this is your first time';
    case 'email-signup':
      return 'use a valid Gmail address and a password of at least 8 characters';
    case 'google-auth':
      return 'enter your Gmail and a password below, or tap Continue with Google again';
    case 'agent-register':
      return 'enter an agent name and tap Generate & register again';
    case 'agent-login':
      return 'register the agent first, then tap Sign in as this agent';
    default:
      return 'retry once from this screen';
  }
}

function isNetworkError(message: string): boolean {
  return /unreachable|network|failed to fetch|timed out|timeout|offline|econnrefused/i.test(message);
}

export function humanActionError(action: HumanAction, raw: unknown): string {
  const detail = normalizeMessage(raw, 'Request failed');
  const lower = detail.toLowerCase();

  if (action === 'vault-save') {
    if (/paste a key first/i.test(detail)) {
      return withNextStep('Paste an API key first.', 'copy the full key from your provider dashboard and click Save');
    }
    if (/unrecognized key format/i.test(detail)) {
      return withNextStep(
        detail,
        'paste the full key including prefix (for example sk-proj-, sk-ant-, sk-or-, or a Helius UUID)',
      );
    }
    if (/401|unauthorized|log in|sign in/i.test(lower)) {
      return withNextStep('Session expired while saving.', 'sign in again, then retry Save');
    }
    if (/403|insufficient_scope|proxy-only/i.test(lower)) {
      return withNextStep(
        'This session cannot write the vault.',
        'sign in with your Google email (Human tab), then paste the key again',
      );
    }
  }

  if (action === 'wallet-connect') {
    if (/reject|denied|cancel/i.test(lower)) {
      return withNextStep('Wallet request was cancelled.', defaultStep(action));
    }
    if (/does not support message signing|signmessage/i.test(lower)) {
      return withNextStep('This wallet cannot sign messages for KeyShield.', 'switch to Phantom or Solflare and try again');
    }
  }

  if (action === 'passkey-signin' || action === 'passkey-signup' || action === 'desktop-touch-id') {
    if (/abort|cancel|not allowed|visibility|document|interrupted/i.test(lower)) {
      return withNextStep('Passkey prompt was interrupted or cancelled.', defaultStep(action));
    }
    if (/webauthn|not supported|securityerror|invalidstate/i.test(lower)) {
      return withNextStep(
        'Passkey is unavailable in this browser window.',
        'open https://app.ks.aileena.xyz in Chrome or Safari, sign in there, then paste a session token',
      );
    }
  }

  if (action === 'demo-login' && /missing token|missing session/i.test(lower)) {
    return withNextStep('Demo login returned an incomplete session.', defaultStep(action));
  }

  if (action === 'email-signup' || action === 'email-login') {
    if (/already exists/i.test(lower)) {
      return withNextStep('An account already exists for this email.', 'tap Sign in with this email and password');
    }
    if (/invalid credentials/i.test(lower)) {
      return withNextStep('That email or password did not match.', 'check Caps Lock, or create an account if this is your first time');
    }
  }

  if (action === 'google-auth') {
    if (/not configured|503|GOOGLE_CLIENT/i.test(lower)) {
      return withNextStep(
        'Live Google OAuth is not configured on this server.',
        'enter your Gmail address and a password, then Create account',
      );
    }
  }

  if (isNetworkError(lower)) {
    return withNextStep(
      `Cannot reach the KeyShield API right now (${detail}).`,
      'start the backend with npm run dev:api or use the hosted dashboard session token fallback',
    );
  }

  return withNextStep(detail, defaultStep(action));
}
