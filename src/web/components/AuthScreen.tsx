import React, { useEffect, useRef, useState } from 'react';
import { Fingerprint, Loader2, AlertCircle, Play, Bot } from 'lucide-react';
import { WalletConnector } from './WalletConnector';
import { ExtensionInstallHint } from './ExtensionInstallHint';
import {
  passkeyLogin,
  passkeySignup,
  setToken,
  setWalletAddress,
  notifyAuthChanged,
  clearPasskeyTrust,
  startDemoSession,
  API_BASE,
  passwordLogin,
  passwordSignup,
  googleAuthStatus,
  startGoogleAuth,
  pollGoogleAuth,
  exchangeGoogleTicket,
  agentSelfRegister,
  fetchAgentChallenge,
  agentChallengeLogin,
  type GoogleAuthStatus,
} from '../lib/auth';
import { focusLoginWindow, isDesktopShell, openDesktopExternal } from '../lib/desktop-shell';
import { emitAppFeedback } from '../lib/app-feedback';
import { humanActionError } from '../lib/human-usable';
import { readPasskeyUserIdFromStorage, shortPasskeyLabel } from '../lib/passkey-id';
import { generateAgentKeypair, signAgentChallenge, type AgentKeypair } from '../lib/agent-pubkey';

interface Props { onAuthenticated: () => void; }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.5-5.2l-6.2-5.2C29.3 35.1 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.7-6.5 7.1l6.2 5.2C38.8 37.3 44 31.5 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

export const AuthScreen: React.FC<Props> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'human' | 'agent'>('human');
  const [userId, setUserId] = useState<string | null>(() => readPasskeyUserIdFromStorage());
  const [, setPreferWallet] = useState(false);
  const [pkLoading, setPkLoading] = useState(false);
  const [pkAction, setPkAction] = useState<'signin' | 'signup' | null>(null);
  const [pkError, setPkError] = useState('');
  const [demoOn, setDemoOn] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState('');
  const [demoModel, setDemoModel] = useState('');
  const [desktopToken, setDesktopToken] = useState('');
  const [desktopTokenError, setDesktopTokenError] = useState('');
  const desktop = isDesktopShell();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailBusy, setEmailBusy] = useState<'signin' | 'signup' | null>(null);
  const [emailError, setEmailError] = useState('');
  const [googleHint, setGoogleHint] = useState('');
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<GoogleAuthStatus | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const [agentName, setAgentName] = useState('');
  const [agentBusy, setAgentBusy] = useState<'register' | 'login' | null>(null);
  const [agentError, setAgentError] = useState('');
  const [agentOk, setAgentOk] = useState('');
  const [agentSeed, setAgentSeed] = useState('');
  const [agentReady, setAgentReady] = useState(false);
  const agentKeys = useRef<AgentKeypair | null>(null);

  const finishSession = (token: string, accountId: string, title: string) => {
    setToken(token);
    setWalletAddress(accountId);
    notifyAuthChanged();
    focusLoginWindow();
    emitAppFeedback({ kind: 'success', title, source: 'auth' });
    onAuthenticated();
  };

  useEffect(() => {
    const sync = () => {
      const id = readPasskeyUserIdFromStorage();
      setUserId(id);
      if (id) setPreferWallet(false);
    };
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('storage', sync);
    window.addEventListener('ks-auth-changed', sync);
    return () => {
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener('ks-auth-changed', sync);
    };
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/health/mpp`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.demo?.enabled) {
          setDemoOn(true);
          if (d.demo.model) setDemoModel(d.demo.model);
        }
      })
      .catch(() => { /* API down — email/passkey still available */ });
  }, []);

  useEffect(() => {
    googleAuthStatus()
      .then(setGoogleStatus)
      .catch(() => setGoogleStatus({ enabled: false, detail: '' }));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ticket = params.get('ks_google');
    if (!ticket || ticket === 'pending') return;
    let cancelled = false;
    setGoogleBusy(true);
    emitAppFeedback({ kind: 'busy', title: 'Finishing Google sign-in…', source: 'auth' });
    exchangeGoogleTicket(ticket)
      .then((out) => {
        if (cancelled) return;
        window.history.replaceState({}, '', window.location.pathname);
        finishSession(out.token, out.userId, 'Signed in with Google');
      })
      .catch((e) => {
        if (cancelled) return;
        const detail = humanActionError('google-auth', e);
        setGoogleHint(detail);
        emitAppFeedback({ kind: 'error', title: 'Google sign-in failed', detail, source: 'auth' });
      })
      .finally(() => { if (!cancelled) setGoogleBusy(false); });
    return () => { cancelled = true; };
  // finishSession is stable enough for first-load ticket exchange
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDemo = async () => {
    setDemoLoading(true); setDemoError('');
    focusLoginWindow();
    emitAppFeedback({ kind: 'busy', title: 'Starting demo…', source: 'auth' });
    try {
      const out = await startDemoSession();
      if (!out.token) throw new Error('demo session missing token');
      sessionStorage.setItem('ks_landing', 'home');
      if (out.agent?.pubkey_b58) sessionStorage.setItem('ks_demo_agent', out.agent.pubkey_b58);
      finishSession(out.token, out.userId, 'Demo session started');
    } catch (e) {
      const detail = humanActionError('demo-login', e);
      setDemoError(detail);
      emitAppFeedback({ kind: 'error', title: 'Demo login failed', detail, source: 'auth' });
    } finally {
      setDemoLoading(false);
    }
  };

  const showPasskeyPanel = Boolean(userId);
  const shortAddr = userId ? shortPasskeyLabel(userId) : '';

  const handleFaceID = async () => {
    setPkLoading(true);
    setPkAction('signin');
    setPkError('');
    focusLoginWindow();
    emitAppFeedback({ kind: 'busy', title: 'Unlocking with passkey…', source: 'unlock' });
    try {
      const { token, userId: signed } = await passkeyLogin();
      finishSession(token, signed, 'Signed in');
    } catch (e) {
      const detail = humanActionError('passkey-signin', e);
      setPkError(detail);
      emitAppFeedback({ kind: 'error', title: 'Sign-in failed', detail, source: 'unlock' });
    } finally {
      setPkLoading(false);
      setPkAction(null);
    }
  };
  const handleSignup = async () => {
    setPkLoading(true);
    setPkAction('signup');
    setPkError('');
    focusLoginWindow();
    emitAppFeedback({ kind: 'busy', title: 'Creating passkey…', source: 'unlock' });
    try {
      const { token, userId: created } = await passkeySignup();
      finishSession(token, created, 'Account created');
    } catch (e) {
      const detail = humanActionError('passkey-signup', e);
      setPkError(detail);
      emitAppFeedback({ kind: 'error', title: 'Signup failed', detail, source: 'unlock' });
    } finally {
      setPkLoading(false);
      setPkAction(null);
    }
  };
  const forgetDevice = () => { clearPasskeyTrust(); setUserId(null); setPreferWallet(true); };

  const handleDesktopToken = () => {
    const token = desktopToken.trim();
    if (!token) {
      const detail = 'Paste a session token from Developer on the live dashboard.';
      setDesktopTokenError(detail);
      emitAppFeedback({ kind: 'error', title: 'Session token missing', detail, source: 'auth' });
      return;
    }
    setDesktopTokenError('');
    finishSession(token, email.trim() || 'desktop', 'Session token saved');
  };

  const focusEmail = (hint: string) => {
    setGoogleHint(hint);
    emailRef.current?.focus();
    emailRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const handleGoogle = async () => {
    setGoogleBusy(true);
    setGoogleHint('');
    setEmailError('');
    focusLoginWindow();
    emitAppFeedback({ kind: 'busy', title: 'Continue with Google…', source: 'auth' });
    try {
      const status = googleStatus ?? await googleAuthStatus();
      setGoogleStatus(status);
      if (!status.enabled) {
        const detail = humanActionError(
          'google-auth',
          status.detail || 'Live Google OAuth is not configured on this server.',
        );
        focusEmail(detail);
        emitAppFeedback({ kind: 'info', title: 'Use your Google email below', detail, source: 'auth' });
        return;
      }
      const { url, state } = await startGoogleAuth(desktop);
      if (desktop) {
        openDesktopExternal(url);
        setGoogleHint('Next step: finish Google sign-in in your browser, then return to this KeyShield window.');
        const started = Date.now();
        while (Date.now() - started < 180_000) {
          await new Promise((r) => window.setTimeout(r, 1500));
          const row = await pollGoogleAuth(state);
          if ('token' in row && row.token) {
            finishSession(row.token, row.userId, 'Signed in with Google');
            return;
          }
        }
        throw new Error('Google sign-in timed out');
      }
      window.location.assign(url);
    } catch (e) {
      const detail = humanActionError('google-auth', e);
      focusEmail(detail);
      emitAppFeedback({ kind: 'error', title: 'Google sign-in failed', detail, source: 'auth' });
    } finally {
      setGoogleBusy(false);
    }
  };

  const runEmail = async (kind: 'signin' | 'signup') => {
    const id = email.trim();
    setEmailError('');
    if (!id || !EMAIL_RE.test(id)) {
      const detail = 'Enter a valid Google email (for example you@gmail.com). Next step: type the address and try again.';
      setEmailError(detail);
      emitAppFeedback({ kind: 'error', title: 'Email required', detail, source: 'auth' });
      emailRef.current?.focus();
      return;
    }
    if (!password) {
      const detail = 'Enter a password. Next step: choose a password, then tap Create account or Sign in.';
      setEmailError(detail);
      emitAppFeedback({ kind: 'error', title: 'Password required', detail, source: 'auth' });
      return;
    }
    if (kind === 'signup' && password.length < 8) {
      const detail = 'Password must be at least 8 characters. Next step: choose a longer password.';
      setEmailError(detail);
      emitAppFeedback({ kind: 'error', title: 'Password too short', detail, source: 'auth' });
      return;
    }
    setEmailBusy(kind);
    focusLoginWindow();
    emitAppFeedback({
      kind: 'busy',
      title: kind === 'signup' ? 'Creating account…' : 'Signing in…',
      source: 'auth',
    });
    try {
      const out = kind === 'signup'
        ? await passwordSignup(id, password)
        : await passwordLogin(id, password);
      finishSession(
        out.token,
        out.userId,
        kind === 'signup' || out.registered ? 'Account created' : 'Signed in',
      );
    } catch (e) {
      const action = kind === 'signup' ? 'email-signup' : 'email-login';
      const detail = humanActionError(action, e);
      setEmailError(detail);
      emitAppFeedback({
        kind: 'error',
        title: kind === 'signup' ? 'Signup failed' : 'Sign-in failed',
        detail,
        source: 'auth',
      });
    } finally {
      setEmailBusy(null);
    }
  };

  const handleAgentRegister = async () => {
    if (!agentName.trim()) {
      const detail = 'Enter an agent name first. Next step: type a name, then tap Generate & register.';
      setAgentError(detail);
      emitAppFeedback({ kind: 'error', title: 'Agent name required', detail, source: 'auth' });
      return;
    }
    setAgentBusy('register');
    setAgentError('');
    setAgentOk('');
    setAgentSeed('');
    focusLoginWindow();
    emitAppFeedback({ kind: 'busy', title: 'Registering agent…', source: 'auth' });
    try {
      const kp = await generateAgentKeypair();
      agentKeys.current = kp;
      setAgentReady(true);
      const out = await agentSelfRegister(agentName.trim(), kp.publicKeyB58);
      setAgentSeed(kp.seedB64);
      setAgentOk(`Agent "${out.name}" registered (id ${out.id}). Copy the seed — the server only has the pubkey.`);
      emitAppFeedback({ kind: 'success', title: 'Agent registered', source: 'auth' });
    } catch (e) {
      const detail = humanActionError('agent-register', e);
      setAgentError(detail);
      emitAppFeedback({ kind: 'error', title: 'Agent registration failed', detail, source: 'auth' });
    } finally {
      setAgentBusy(null);
    }
  };

  const handleAgentLogin = async () => {
    const kp = agentKeys.current;
    if (!kp) {
      const detail = 'Register an agent on this screen first. Next step: enter a name and tap Generate & register.';
      setAgentError(detail);
      emitAppFeedback({ kind: 'error', title: 'No agent key on this device', detail, source: 'auth' });
      return;
    }
    setAgentBusy('login');
    setAgentError('');
    focusLoginWindow();
    emitAppFeedback({ kind: 'busy', title: 'Signing in as agent…', source: 'auth' });
    try {
      const { challenge, nonce } = await fetchAgentChallenge();
      const signature = await signAgentChallenge(kp.privateKey, challenge);
      const out = await agentChallengeLogin(kp.publicKeyB58, signature, challenge, nonce);
      finishSession(out.token, kp.publicKeyB58, 'Agent signed in');
    } catch (e) {
      const detail = humanActionError('agent-login', e);
      setAgentError(detail);
      emitAppFeedback({ kind: 'error', title: 'Agent sign-in failed', detail, source: 'auth' });
    } finally {
      setAgentBusy(null);
    }
  };

  const busy = Boolean(emailBusy || googleBusy || pkLoading || agentBusy);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b1226] px-6 py-12">
      <div className="w-full max-w-lg flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-xl bg-[#131c39] border border-[#243365]/50 flex items-center justify-center mb-8">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" stroke="white" strokeWidth="1.5" fill="none" /><circle cx="11.5" cy="11" r="2" stroke="currentColor" strokeWidth="1.2" fill="none" className="text-[#a8b3d8]" /><line x1="13" y1="12.5" x2="16" y2="15.5" stroke="currentColor" strokeWidth="1.2" className="text-[#a8b3d8]" /></svg>
        </div>
        <h1 className="text-[34px] leading-tight font-bold text-white tracking-tight uppercase">KeyShield</h1>
        <p className="mt-2 text-[16px] leading-snug text-white/90 max-w-sm">your API iCloud Keychain</p>
        <p className="mt-3 text-[14px] leading-relaxed text-[#a8b3d8] max-w-sm">
          Sign in with your Google email. KeyShield is for people and agents — not a Solana-only wallet app. A wallet is optional.
        </p>
        <div className="w-full mt-8 flex rounded-xl border border-[#243365]/50 p-1 bg-[#131c39]">
          <button type="button" data-testid="auth-mode-human" onClick={() => setMode('human')} className={`flex-1 h-10 rounded-lg text-[12px] font-semibold uppercase tracking-wider ${mode === 'human' ? 'bg-[#0e1631] text-white' : 'text-[#8a96c2]'}`}>Human</button>
          <button type="button" data-testid="auth-mode-agent" onClick={() => setMode('agent')} className={`flex-1 h-10 rounded-lg text-[12px] font-semibold uppercase tracking-wider ${mode === 'agent' ? 'bg-[#0e1631] text-white' : 'text-[#8a96c2]'}`}>Agent</button>
        </div>
        <div className="w-full mt-4">
          <div data-testid="auth-card" className="w-full rounded-xl border border-[#243365]/50 p-4 bg-[#131c39] space-y-3">
            {mode === 'human' ? (
              <>
                <button
                  type="button"
                  data-testid="google-email-signin"
                  onClick={handleGoogle}
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-xl border border-[#2e4585] bg-white text-[#1f1f1f] font-semibold disabled:opacity-70 disabled:cursor-wait"
                >
                  {googleBusy ? <Loader2 size={18} className="animate-spin" /> : <GoogleMark />}
                  <span className="text-[14px]">{googleBusy ? 'Continue with Google…' : 'Sign in with Google email'}</span>
                </button>
                {googleBusy && (
                  <p data-testid="google-next-step" className="text-[12px] text-[#8a96c2] text-left px-1">
                    Next step: {desktop ? 'finish Google in your browser, then keep this KeyShield window in front.' : 'choose the Google account in the next screen.'}
                  </p>
                )}
                {googleHint && <p className="text-[12px] text-[#a8b3d8] text-left px-1">{googleHint}</p>}

                <div className="flex items-center gap-2 py-1">
                  <div className="flex-1 border-t border-[#243365]/50" />
                  <span className="text-[10px] text-[#5e6a91] uppercase tracking-wider">or use Gmail + password</span>
                  <div className="flex-1 border-t border-[#243365]/50" />
                </div>

                <form
                  data-testid="password-login"
                  className="space-y-2 text-left"
                  onSubmit={(e) => { e.preventDefault(); void runEmail('signin'); }}
                >
                  <label className="block text-[11px] text-[#8a96c2] uppercase tracking-wider">Google email</label>
                  <input
                    ref={emailRef}
                    data-testid="email-login"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@gmail.com"
                    className="w-full rounded-lg bg-[#0e1631] border border-[#243365] px-3 py-2 text-[13px] text-white placeholder:text-[#3e4a72]"
                  />
                  <label className="block text-[11px] text-[#8a96c2] uppercase tracking-wider">Password</label>
                  <input
                    data-testid="password-login-input"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="at least 8 characters"
                    className="w-full rounded-lg bg-[#0e1631] border border-[#243365] px-3 py-2 text-[13px] text-white placeholder:text-[#3e4a72]"
                  />
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      data-testid="email-signup"
                      disabled={busy}
                      onClick={() => void runEmail('signup')}
                      className="flex-1 h-10 rounded-lg bg-white text-black text-[12px] font-semibold uppercase tracking-wider disabled:opacity-70"
                    >
                      {emailBusy === 'signup' ? 'Creating account…' : 'Create account'}
                    </button>
                    <button
                      type="submit"
                      data-testid="email-signin"
                      disabled={busy}
                      className="flex-1 h-10 rounded-lg border border-zinc-500 text-white text-[12px] font-semibold uppercase tracking-wider disabled:opacity-70"
                    >
                      {emailBusy === 'signin' ? 'Signing in…' : 'Sign in'}
                    </button>
                  </div>
                  {emailBusy && (
                    <p data-testid="email-next-step" className="text-[12px] text-[#8a96c2]">
                      Next step: keep this window in front while KeyShield creates your session.
                    </p>
                  )}
                  {emailError && (
                    <div className="px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/60 flex items-start gap-2">
                      <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                      <p className="text-[12px] text-red-300 leading-relaxed">{emailError}</p>
                    </div>
                  )}
                </form>

                {userId ? (
                  <button type="button" data-testid="passkey-signin" onClick={handleFaceID} disabled={busy} className="w-full flex items-center gap-3 px-5 py-4 rounded-xl border border-[#2e4585] bg-[#0e1631] hover:bg-white/5 text-white disabled:opacity-70 disabled:cursor-wait transition-colors">
                    <span className="flex items-center justify-center w-5 h-5">{pkLoading ? <Loader2 size={18} className="animate-spin" /> : <Fingerprint size={18} />}</span>
                    <span className="text-[15px] font-semibold uppercase tracking-wider">{pkLoading ? 'Verifying\u2026' : `Sign In as ${shortAddr}`}</span>
                  </button>
                ) : (
                  <button type="button" data-testid="passkey-signup" onClick={handleSignup} disabled={busy} className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-[#2e4585] bg-[#0e1631] hover:bg-white/5 text-white disabled:opacity-70 transition-colors">
                    {pkLoading ? <Loader2 size={16} className="animate-spin" /> : <Fingerprint size={16} />}
                    <span className="text-[13px] font-semibold uppercase tracking-wider">{pkLoading ? 'Creating account…' : 'Optional: create account with passkey'}</span>
                  </button>
                )}
                {pkError && <div className="px-4 py-3 rounded-xl bg-red-950/40 border border-red-900/60 flex items-start gap-3"><AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" /><p className="text-[12px] text-red-300 leading-relaxed break-words text-left">{pkError}</p></div>}
                {pkLoading && (
                  <p data-testid="passkey-next-step" className="text-[12px] text-[#8a96c2] text-left px-1">
                    {pkAction === 'signup'
                      ? 'Next step: approve the passkey creation prompt in Face ID, Touch ID, or your security key.'
                      : 'Next step: approve the passkey sign-in prompt in Face ID, Touch ID, or your security key.'}
                  </p>
                )}
                {userId && <button type="button" onClick={forgetDevice} className="w-full text-center py-1 text-[11px] text-[#5e6a91] hover:text-red-400 transition-colors">Forget this device</button>}

                <details data-testid="optional-wallet" className="rounded-xl border border-[#243365]/40 bg-[#0e1631] px-3 py-2 text-left">
                  <summary className="cursor-pointer text-[12px] text-[#8a96c2]">Optional: connect a Solana wallet</summary>
                  <p className="text-[11px] text-[#5e6a91] mt-2 mb-2">A wallet is not required to create an account. Use it only if you already have Phantom or Solflare.</p>
                  <WalletConnector onConnect={() => {
                    emitAppFeedback({ kind: 'success', title: 'Wallet connected', source: 'auth' });
                    onAuthenticated();
                  }} />
                </details>

                {desktop && (
                  <div className="pt-2 space-y-2 border-t border-[#243365]/40" data-testid="desktop-session-token">
                    <p className="text-[12px] text-[#8a96c2] text-left leading-relaxed">Mac app: email signup above is the default. Passkey still works when Chromium allows it. Session token from Developer on https://app.ks.aileena.xyz is a fallback.</p>
                    <input
                      data-testid="desktop-session-token-input"
                      value={desktopToken}
                      onChange={(e) => setDesktopToken(e.target.value)}
                      placeholder="ksv2_… session token"
                      autoComplete="off"
                      className="w-full rounded-lg bg-[#0e1631] border border-[#243365] px-3 py-2 text-[13px] font-mono text-white placeholder:text-[#3e4a72]"
                    />
                    <button type="button" onClick={handleDesktopToken} className="w-full h-9 rounded-lg border border-zinc-500 text-white text-[13px] font-semibold">Use session token</button>
                    {desktopTokenError && <p className="text-[12px] text-red-400 text-left">{desktopTokenError}</p>}
                  </div>
                )}
              </>
            ) : (
              <div data-testid="agent-register" className="space-y-3 text-left">
                <p className="text-[13px] text-[#a8b3d8] leading-relaxed">
                  Agents register with an ed25519 keypair. No Solana wallet and no Google account required.
                </p>
                <label className="block text-[11px] text-[#8a96c2] uppercase tracking-wider">Agent name</label>
                <input
                  data-testid="agent-register-name"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="trading-bot"
                  className="w-full rounded-lg bg-[#0e1631] border border-[#243365] px-3 py-2 text-[13px] text-white placeholder:text-[#3e4a72]"
                />
                <button
                  type="button"
                  data-testid="agent-register-submit"
                  disabled={busy}
                  onClick={() => void handleAgentRegister()}
                  className="w-full h-10 rounded-lg bg-white text-black text-[12px] font-semibold uppercase tracking-wider disabled:opacity-70 flex items-center justify-center gap-2"
                >
                  {agentBusy === 'register' ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
                  {agentBusy === 'register' ? 'Registering…' : 'Generate & register'}
                </button>
                {agentBusy === 'register' && (
                  <p data-testid="agent-register-next-step" className="text-[12px] text-[#8a96c2]">
                    Next step: keep this window in front while KeyShield stores the public key.
                  </p>
                )}
                {agentSeed && (
                  <div className="rounded-lg border border-amber-800/60 bg-amber-950/20 p-3">
                    <p className="text-[11px] text-amber-300 mb-1">You keep this seed — copy it now.</p>
                    <code className="text-[11px] font-mono text-amber-200 break-all">{agentSeed}</code>
                  </div>
                )}
                <button
                  type="button"
                  data-testid="agent-login-submit"
                  disabled={busy || !agentReady}
                  onClick={() => void handleAgentLogin()}
                  className="w-full h-10 rounded-lg border border-zinc-500 text-white text-[12px] font-semibold uppercase tracking-wider disabled:opacity-70"
                >
                  {agentBusy === 'login' ? 'Signing in…' : 'Sign in as this agent'}
                </button>
                {agentBusy === 'login' && (
                  <p className="text-[12px] text-[#8a96c2]">Next step: keep this window open while the agent signs the challenge.</p>
                )}
                {agentOk && <p className="text-[12px] text-emerald-300">{agentOk}</p>}
                {agentError && (
                  <div className="px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/60 flex items-start gap-2">
                    <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                    <p className="text-[12px] text-red-300 leading-relaxed">{agentError}</p>
                  </div>
                )}
              </div>
            )}
          </div>
          {demoOn && mode === 'human' && (
                <div className="mt-4 space-y-2">
                  <button type="button" onClick={handleDemo} disabled={demoLoading} className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-[#2e4585] bg-[#0e1631] hover:bg-white/5 text-white disabled:opacity-70 transition-colors">
                    {demoLoading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                    <span className="text-[13px] font-semibold uppercase tracking-wider" data-testid="start-demo">{demoLoading ? 'Starting demo\u2026' : 'Start demo'}</span>
                  </button>
                  <p className="text-[13px] text-[#8a96c2]">Home: paste a key, buy $0.10 shop credit (balance changes), RPC speed check. {demoModel ? `Meter uses ${demoModel}.` : ''}</p>
                  {demoError && <p className="text-[12px] text-red-400 text-left">{demoError}</p>}
                </div>
              )}
        </div>
        <ExtensionInstallHint variant="auth" />
        <p className="mt-8 text-[11px] leading-relaxed text-[#3e4a72] max-w-sm">AES-256-GCM · email or passkey · optional wallet · server never sees your key material</p>
      </div>
    </div>
  );
};
