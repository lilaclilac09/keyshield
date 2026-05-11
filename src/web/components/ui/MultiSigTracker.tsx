import React from 'react';
interface Signer { name: string; address: string; approved: boolean; }
export interface MultiSigTrackerProps { required: number; signers: Signer[]; className?: string; }

export const MultiSigTracker: React.FC<MultiSigTrackerProps> = ({ required, signers, className = '' }) => {
  const approved = signers.filter(s => s.approved).length;
  const progress = Math.min((approved / required) * 100, 100);
  const complete = approved >= required;
  return (
    <div className={`rounded-xl border border-[#243365]/50 bg-[#131c39] p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold text-[#8a96c2] uppercase tracking-wider">Multi-Signature Approval</span>
        <span className={`text-[10px] font-bold uppercase tracking-wider ${complete ? 'text-emerald-400' : 'text-[#a8b3d8]'}`}>{approved}/{required}</span>
      </div>
      <div className="w-full h-1 bg-zinc-800 rounded-md mb-3 overflow-hidden">
        <div className={`h-full rounded-md transition-all duration-300 ${complete ? 'bg-emerald-400' : 'bg-white'}`} style={{ width: `${progress}%` }} />
      </div>
      <div className="space-y-1.5">
        {signers.map(signer => (
          <div key={signer.address} className="flex items-center gap-2">
            <div className={`w-4 h-4 rounded-md border flex items-center justify-center ${signer.approved ? 'bg-emerald-950/60 border-emerald-900/60 text-emerald-400' : 'bg-zinc-900 border-[#243365] text-[#3e4a72]'}`}>
              {signer.approved && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3.5 6L6.5 2" stroke="currentColor" strokeWidth="1" /></svg>}
            </div>
            <div className="flex-1 min-w-0"><span className="text-[11px] text-[#e8ecff]">{signer.name}</span></div>
            <span className="text-[9px] font-mono text-[#5e6a91]">{signer.address.slice(0, 6)}\u2026{signer.address.slice(-4)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
