import React, { useEffect, useState } from 'react';
import { Fingerprint, Loader2, AlertCircle, Play } from 'lucide-react';
import { WalletConnector } from './WalletConnector';
import { ExtensionInstallHint } from './ExtensionInstallHint';
import { passkeyLogin, setToken, setWalletAddress, notifyAuthChanged, getPasskeyTrust, clearPasskeyTrust, startDemoSession, API_BASE } from '../lib/auth';

interface Props { onAuthenticated: () => void; }

export const AuthScreen: React.FC<Props> = ({ onAuthenticated }) => {
  const [trust] = useState(() => getPasskeyTrust());
  // Show passkey login by default if ANY passkey device record exists
  // (trust may be null if sessionStorage was cleared, but userId in localStorage is enough)
  const hasPasskeyDevice = !!localStorage.getItem('ks_passkey_user');
  const [useWallet, setUseWallet] = useState(!trust && !hasPasskeyDevice);
  const [pkLoading, setPkLoading] = useState(false);
  const [pkError, setPkError] = useState('');
  const [demoOn, setDemoOn] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState('');
  const [demoModel, setDemoModel] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/health/mpp`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.demo?.enabled) {
          setDemoOn(true);
          if (d.demo.model) setDemoModel(d.demo.model);
        }
      })
      .catch(() => { /* API down — wallet/passkey still available */ });
  }, []);

  const handleDemo = async () => {
    setDemoLoading(true); setDemoError('');
    try {
      const out = await startDemoSession();
      if (!out.token) throw new Error('demo session missing token');
      setToken(out.token);
      setWalletAddress(out.userId);
      sessionStorage.setItem('ks_landing', 'home');
      if (out.agent?.pubkey_b58) sessionStorage.setItem('ks_demo_agent', out.agent.pubkey_b58);
      notifyAuthChanged();
      onAuthenticated();
    } catch (e) {
      setDemoError(e instanceof Error ? e.message : 'Demo login failed');
    } finally {
      setDemoLoading(false);
    }
  };
  const effectiveTrust = trust ?? (hasPasskeyDevice ? { userId: localStorage.getItem('ks_passkey_user')!, passphrase: '' } : null);
  const shortAddr = effectiveTrust ? `${effectiveTrust.userId.slice(0, 4)}\u2026${effectiveTrust.userId.slice(-4)}` : '';

  const handleFaceID = async () => { setPkLoading(true); setPkError(''); try { const { token, userId } = await passkeyLogin(); setToken(token); setWalletAddress(userId); notifyAuthChanged(); onAuthenticated(); } catch (e) { setPkError(e instanceof Error ? e.message : 'Face ID failed'); } finally { setPkLoading(false); } };
  const forgetDevice = () => { clearPasskeyTrust(); setUseWallet(true); };

  // Show the passkey panel when we have a device record (even if sessionStorage was cleared)
  const showPasskeyPanel = (trust || hasPasskeyDevice) && !useWallet;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b1226] px-6 py-12">
      <div className="w-full max-w-lg flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-xl bg-[#131c39] border border-[#243365]/50 flex items-center justify-center mb-8">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" stroke="white" strokeWidth="1.5" fill="none" /><circle cx="11.5" cy="11" r="2" stroke="currentColor" strokeWidth="1.2" fill="none" className="text-[#a8b3d8]" /><line x1="13" y1="12.5" x2="16" y2="15.5" stroke="currentColor" strokeWidth="1.2" className="text-[#a8b3d8]" /></svg>
        </div>
        <h1 className="text-[34px] leading-tight font-bold text-white tracking-tight uppercase">KeyShield</h1>
        <p className="mt-2 text-[16px] leading-snug text-white/90 max-w-sm">your API iCloud Keychain</p>
        <p className="mt-3 text-[14px] leading-relaxed text-[#a8b3d8] max-w-sm">{showPasskeyPanel ? `Welcome back. Sign in with Face ID, Touch ID, or your hardware key.` : `Keep API credentials in your vault and give agents controlled access.`}</p>
        <div className="w-full mt-10">
          {showPasskeyPanel ? (
            <div className="w-full space-y-3">
              <div className="rounded-xl border border-[#243365]/50 p-2 bg-[#131c39]">
                <button type="button" onClick={handleFaceID} disabled={pkLoading} className="w-full flex items-center gap-3 px-5 py-4 rounded-xl border border-[#2e4585] bg-[#0e1631] hover:bg-white/5 text-white disabled:opacity-70 disabled:cursor-wait transition-colors">
                  <span className="flex items-center justify-center w-5 h-5">{pkLoading ? <Loader2 size={18} className="animate-spin" /> : <Fingerprint size={18} />}</span>
                  <span className="text-[15px] font-semibold uppercase tracking-wider">{pkLoading ? 'Verifying\u2026' : `Sign In as ${shortAddr}`}</span>
                </button>
              </div>
              {pkError && <div className="px-4 py-3 rounded-xl bg-red-950/40 border border-red-900/60 flex items-start gap-3"><AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" /><p className="text-[12px] text-red-300 leading-relaxed break-words text-left">{pkError}</p></div>}
              <button type="button" onClick={() => setUseWallet(true)} className="w-full text-center py-2 text-[12px] text-[#8a96c2] hover:text-white transition-colors">Use a different wallet instead</button>
              <button type="button" onClick={forgetDevice} className="w-full text-center py-1 text-[11px] text-[#5e6a91] hover:text-red-400 transition-colors">Forget this device</button>
            </div>
          ) : (
            <>
              <WalletConnector onConnect={onAuthenticated} />
              {demoOn && (
                <div className="mt-4 space-y-2">
                  <button type="button" onClick={handleDemo} disabled={demoLoading} className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-[#2e4585] bg-[#0e1631] hover:bg-white/5 text-white disabled:opacity-70 transition-colors">
                    {demoLoading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                    <span className="text-[13px] font-semibold uppercase tracking-wider" data-testid="start-demo">{demoLoading ? 'Starting demo\u2026' : 'Start demo'}</span>
                  </button>
                  <p className="text-[13px] text-[#8a96c2]">Opens Home first — wallet balance, stored APIs, connection time. {demoModel ? `Meter uses ${demoModel}.` : ''}</p>
                  {demoError && <p className="text-[12px] text-red-400 text-left">{demoError}</p>}
                </div>
              )}
              {hasPasskeyDevice && <button type="button" onClick={() => setUseWallet(false)} className="w-full mt-3 text-center py-2 text-[12px] text-[#a8b3d8] hover:text-white transition-colors flex items-center justify-center gap-1.5"><Fingerprint size={12} /> Use Face ID instead</button>}
            </>
          )}
        </div>
        <ExtensionInstallHint variant="auth" />
        <p className="mt-8 text-[11px] leading-relaxed text-[#3e4a72] max-w-sm">AES-256-GCM \xb7 ed25519 wallet signatures \xb7 server never sees your key material</p>
      </div>
    </div>
  );
};
