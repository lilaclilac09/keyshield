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

  React.useEffect(() => {
    console.log('[AuthScreen] mounted, trust:', !!trust, 'useWallet:', useWallet);
  }, []);

  const shortAddr = trust ? `${trust.userId.slice(0, 4)}\u2026${trust.userId.slice(-4)}` : '';

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
    <div style={{ position: 'absolute', inset: 0, zIndex: 9999, background: '#ffffff' }} className="flex items-center justify-center">
      <div className="w-full max-w-md flex flex-col items-center text-center p-6" style={{ zIndex: 10 }}>
        <div className="w-20 h-20 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center mb-8">
          <span style={{ fontSize: 40 }}>🛡</span>
        </div>

        <h1 className="text-[34px] leading-tight font-bold text-black tracking-tight uppercase" style={{ color: '#000000' }}>KeyShield</h1>

        <p className="mt-3 text-[14px] leading-relaxed text-gray-600 max-w-sm">
          Connect your Solana wallet to access your encrypted secrets.
        </p>

        <div className="w-full mt-10">
          {trust && !useWallet ? (
            <div className="w-full space-y-3">
              <button
                type="button"
                onClick={handleFaceID}
                disabled={pkLoading}
                className="w-full flex items-center gap-3 px-5 py-4 rounded-lg border-2 border-blue-300 bg-blue-50 hover:bg-blue-100 text-gray-900 disabled:opacity-70 transition-colors text-[16px] font-semibold"
              >
                <Fingerprint size={18} />
                {pkLoading ? 'Verifying…' : `Sign In as ${shortAddr}`}
              </button>
            </div>
          ) : (
            <WalletConnector onConnect={() => { console.log('[AuthScreen] Wallet connected!'); onAuthenticated(); }} />
          )}
        </div>

        <button
          type="button"
          onClick={() => { console.log('[AuthScreen] Skip clicked'); onAuthenticated(); }}
          className="w-full mt-6 py-3 rounded-lg border-2 border-black bg-white text-[14px] font-bold hover:bg-blue-50 transition-colors"
        >
          SKIP WALLET → (force auth)
        </button>
      </div>
    </div>
  );
};
