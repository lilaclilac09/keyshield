
import React from 'react';
import { Shield } from 'lucide-react';
import { WalletConnector } from './WalletConnector';

interface Props {
  onAuthenticated: () => void;
}

export const AuthScreen: React.FC<Props> = ({ onAuthenticated }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#131314] relative overflow-hidden font-mono">
      <div className="relative w-full max-w-sm px-10 py-20 flex flex-col items-center">
        <div className="mb-16 flex flex-col items-center">
          <div className="w-12 h-12 bg-orange-600/5 flex items-center justify-center rounded-lg mb-6 border border-white/5">
            <Shield size={24} className="text-orange-600/60" />
          </div>
          <h1 className="text-xl font-bold text-zinc-200 tracking-tighter">KEYSHIELD</h1>
          <p className="text-zinc-700 text-[8px] uppercase tracking-[0.8em] mt-3 font-bold">SOVEREIGN</p>
        </div>

        <div className="w-full space-y-8">
          <WalletConnector onConnect={onAuthenticated} />
          
          <button
            onClick={onAuthenticated}
            className="w-full text-center py-4 opacity-40 hover:opacity-100 transition-opacity"
          >
            <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-500">OVERRIDE</span>
          </button>
        </div>
      </div>
    </div>
  );
};
