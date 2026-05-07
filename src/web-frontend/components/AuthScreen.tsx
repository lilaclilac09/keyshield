
import React, { useState } from 'react';
import { Shield, Fingerprint, Loader2, AlertCircle } from 'lucide-react';
import { WalletConnector } from './WalletConnector';
import {
  passkeyLogin,
  setToken,
  setWalletAddress,
  notifyAuthChanged,
  getPasskeyTrust,
  clearPasskeyTrust,
} from '../lib/auth';

interface Props {
  onAuthenticated: () => void;
}

export const AuthScreen: React.FC<Props> = ({ onAuthenticated }) => {
  const [trust] = useState(() => getPasskeyTrust());
  const [useWallet, setUseWallet] = useState(!trust);
  const [pkLoading, setPkLoading] = useState(false);
  const [pkError, setPkError]     = useState('');

  const shortAddr = trust
    ? `${trust.userId.slice(0, 4)}…${trust.userId.slice(-4)}`
    : '';

  const handleFaceID = async () => {
    setPkLoading(true);
    setPkError('');
    try {
      const { token, userId } = await passkeyLogin();
      setToken(token);
      setWalletAddress(userId);
      notifyAuthChanged();
      onAuthenticated();
    } catch (e) {
      setPkError(e instanceof Error ? e.message : 'Face ID failed');
    } finally {
      setPkLoading(false);
    }
  };

  const forgetDevice = () => {
    clearPasskeyTrust();
    setUseWallet(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#05060d] px-6">
      <div className="w-full max-w-md flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-2xl bg-[#0e1430] border border-[#1c2550] flex items-center justify-center mb-8">
          <Shield size={36} className="text-[#5b8cff]" strokeWidth={1.75} />
        </div>

        <h1 className="text-[34px] leading-tight font-semibold text-white tracking-tight">
          KeyShield Vault
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-zinc-400 max-w-sm">
          {trust && !useWallet
            ? `Welcome back. Sign in with Face ID, Touch ID, or your hardware key.`
            : `Connect your Solana wallet to access your encrypted secrets.`}
        </p>

        <div className="w-full mt-10">
          {trust && !useWallet ? (
            <div className="w-full space-y-3">
              <div className="rounded-2xl border border-violet-900/50 p-2 bg-violet-950/20">
                <button
                  type="button"
                  onClick={handleFaceID}
                  disabled={pkLoading}
                  className="w-full flex items-center gap-3 px-5 py-4 rounded-xl border border-violet-800/60 bg-violet-900/40 hover:bg-violet-900/60 text-white disabled:opacity-70 disabled:cursor-wait transition-colors"
                >
                  <span className="flex items-center justify-center w-5 h-5">
                    {pkLoading
                      ? <Loader2 size={18} className="animate-spin text-violet-200" />
                      : <Fingerprint size={18} className="text-violet-200" />}
                  </span>
                  <span className="text-[15px] font-medium tracking-tight">
                    {pkLoading ? 'Verifying…' : `Sign in as ${shortAddr}`}
                  </span>
                </button>
              </div>
              {pkError && (
                <div className="px-4 py-3 rounded-xl bg-rose-950/40 border border-rose-900/60 flex items-start gap-3">
                  <AlertCircle size={14} className="text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-[12px] text-rose-300 leading-relaxed break-words text-left">{pkError}</p>
                </div>
              )}
              <button
                type="button"
                onClick={() => setUseWallet(true)}
                className="w-full text-center py-2 text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Use a different wallet instead
              </button>
              <button
                type="button"
                onClick={forgetDevice}
                className="w-full text-center py-1 text-[11px] text-zinc-600 hover:text-rose-400 transition-colors"
              >
                Forget this device
              </button>
            </div>
          ) : (
            <>
              <WalletConnector onConnect={onAuthenticated} />
              {trust && (
                <button
                  type="button"
                  onClick={() => setUseWallet(false)}
                  className="w-full mt-3 text-center py-2 text-[12px] text-violet-400 hover:text-violet-300 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Fingerprint size={12} /> Use Face ID instead
                </button>
              )}
            </>
          )}
        </div>

        <p className="mt-8 text-[11px] leading-relaxed text-zinc-600 max-w-sm">
          AES-256-GCM · ed25519 wallet signatures · server never sees your key material
        </p>
      </div>
    </div>
  );
};
