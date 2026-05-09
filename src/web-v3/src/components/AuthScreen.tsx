import React, { useState } from 'react';
import { Shield, Fingerprint, Loader2, AlertCircle } from 'lucide-react';
import { WalletConnector } from './WalletConnector';
import { passkeyLogin, setToken, setWalletAddress, notifyAuthChanged, getPasskeyTrust, clearPasskeyTrust } from '../lib/auth';

interface Props { onAuthenticated: () => void; }

export const AuthScreen: React.FC<Props> = ({ onAuthenticated }) => {
  const [trust] = useState(() => getPasskeyTrust());
  const [useWallet, setUseWallet] = useState(!trust);
  const [pkLoading, setPkLoading] = useState(false);
  const [pkError, setPkError] = useState('');

  // Debug: log auth state on mount
  React.useEffect(() => {
    console.log('[AuthScreen] trust:', trust, 'useWallet:', useWallet);
  }, [trust, useWallet]);

  // Debug: onAuthenticated callback
  const handleOnAuthenticated = () => {
    console.log('[AuthScreen] onAuthenticated called');
    onAuthenticated();
  };

  const shortAddr = trust ? `${trust.userId.slice(0, 4)}\u2026${trust.userId.slice(-4)}` : '';

  const handleFaceID = async () => { setPkLoading(true); setPkError(''); try { const { token, userId } = await passkeyLogin(); setToken(token); setWalletAddress(userId); notifyAuthChanged(); handleOnAuthenticated(); } catch (e) { setPkError(e instanceof Error ? e.message : 'Face ID failed'); } finally { setPkLoading(false); } };
  const forgetDevice = () => { clearPasskeyTrust(); setUseWallet(true); };

  // Debug: ensure we can see the component is rendered
  React.useEffect(() => {
    console.log('[AuthScreen] rendered, trust:', !!trust, 'useWallet:', useWallet);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-6" style={{ background: '#000', color: '#fff', position: 'relative' }}>
      {/* Debug overlay */}
      <div className="fixed top-2 right-2 z-[9999] bg-white text-black p-3 rounded shadow-lg" style={{ fontSize: 12, fontFamily: 'monospace', maxWidth: '20rem' }}>
        <div><strong>AuthScreen (debug)</strong></div>
        <div>trust: {String(!!trust)}</div>
        <div>useWallet: {String(useWallet)}</div>
        <button onClick={handleOnAuthenticated} className="mt-1 px-2 py-1 bg-blue-500 text-white rounded">Force auth</button>
      </div>
      <div className="w-full max-w-md flex flex-col items-center text-center" style={{ maxWidth: '24rem' }}>
        <div className="w-20 h-20 rounded-[3px] bg-[#0a0a0a] border border-zinc-800/50 flex items-center justify-center mb-8">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" stroke="white" strokeWidth="1.5" fill="none" /><circle cx="11.5" cy="11" r="2" stroke="currentColor" strokeWidth="1.2" fill="none" className="text-zinc-400" /><line x1="13" y1="12.5" x2="16" y2="15.5" stroke="currentColor" strokeWidth="1.2" className="text-zinc-400" /></svg>
        </div>
        <h1 className="text-[34px] leading-tight font-bold tracking-tight uppercase" style={{ color: '#fff' }}>KeyShield</h1>
        <p className="mt-3 text-[14px] leading-relaxed max-w-sm" style={{ color: '#b0b0b0' }}>{trust && !useWallet ? `Welcome back. Sign in with Face ID, Touch ID, or your hardware key.` : `Connect your Solana wallet to access your encrypted secrets.`}</p>
        <div className="w-full mt-10">
          {trust && !useWallet ? (
            <div className="w-full space-y-3">
              <div className="rounded-[3px] border border-zinc-800/50 p-2 bg-[#0a0a0a]">
                <button type="button" onClick={handleFaceID} disabled={pkLoading} className="w-full flex items-center gap-3 px-5 py-4 rounded-[3px] border border-zinc-700 bg-[#050505] hover:bg-white/5 text-white disabled:opacity-70 disabled:cursor-wait transition-colors">
                  <span className="flex items-center justify-center w-5 h-5">{pkLoading ? <Loader2 size={18} className="animate-spin" /> : <Fingerprint size={18} />}</span>
                  <span className="text-[15px] font-semibold uppercase tracking-wider">{pkLoading ? 'Verifying\u2026' : `Sign In as ${shortAddr}`}</span>
                </button>
              </div>
              {pkError && <div className="px-4 py-3 rounded-[3px] bg-red-950/40 border border-red-900/60 flex items-start gap-3"><AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" /><p className="text-[12px] text-red-300 leading-relaxed break-words text-left">{pkError}</p></div>}
              <button type="button" onClick={() => setUseWallet(true)} className="w-full text-center py-2 text-[12px] text-zinc-500 hover:text-white transition-colors">Use a different wallet instead</button>
              <button type="button" onClick={forgetDevice} className="w-full text-center py-1 text-[11px] text-zinc-600 hover:text-red-400 transition-colors">Forget this device</button>
            </div>
          ) : (
            <>
               <WalletConnector onConnect={() => { console.log('[AuthScreen] WalletConnector.onConnect'); handleOnAuthenticated(); }} />
               {trust && <button type="button" onClick={() => setUseWallet(false)} className="w-full mt-3 text-center py-2 text-[12px] text-zinc-400 hover:text-white transition-colors flex items-center justify-center gap-1.5"><Fingerprint size={12} /> Use Face ID instead</button>}
             </>
          )}
        </div>
        {/* Debug skip button */}
       <button
          type="button"
          onClick={handleOnAuthenticated}
          className="w-full mt-4 py-3 rounded-[3px] border border-zinc-800 bg-[#050505] text-[12px] text-zinc-300 hover:text-white hover:border-zinc-600 transition-colors"
        >
          Skip wallet → (force authenticated)
        </button>

      <p className="mt-8 text-[11px] leading-relaxed max-w-sm" style={{ color: '#666' }}>AES-256-GCM \xb7 ed25519 wallet signatures \xb7 server never sees your key material</p>
      </div>
    </div>
  );
};
