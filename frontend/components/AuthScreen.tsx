
import React from 'react';
import { Shield } from 'lucide-react';
import { WalletConnector } from './WalletConnector';

interface Props {
  onAuthenticated: () => void;
}

export const AuthScreen: React.FC<Props> = ({ onAuthenticated }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f001f] via-[#1e0a3c] to-[#0f001f] relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%23ff2e63" fill-opacity="0.03"%3E%3Cpath d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-20"></div>
      
      <div className="relative w-full max-w-sm px-10 py-20 flex flex-col items-center z-10">
        <div className="mb-16 flex flex-col items-center">
          <div className="w-20 h-20 bg-gradient-to-br from-[#ff2e63] to-[#9d4edd] flex items-center justify-center rounded-2xl mb-6 shadow-[0_0_30px_rgba(255,46,99,0.4)]">
            <Shield size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-[#ffd6f5] tracking-tight mb-2">KeyShield</h1>
          <p className="text-sm text-[#e0aaff]/70">Secure API Key Management</p>
        </div>

        <div className="w-full space-y-6">
          <WalletConnector onConnect={onAuthenticated} />
          
          <button
            onClick={onAuthenticated}
            className="w-full text-center py-3 opacity-50 hover:opacity-100 transition-opacity text-sm text-[#e0aaff]/60 hover:text-[#ff2e63]"
          >
            Skip Authentication (Dev Mode)
          </button>
        </div>
      </div>
    </div>
  );
};
