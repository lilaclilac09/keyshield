import React, { useState } from 'react';
import { WalletConnector } from './WalletConnector';
import { OpenStreamTab } from './OpenStreamTab';
import { PaymentPreview } from './PaymentPreview';
import { StatusStrip } from './StatusStrip';
import { isAuthenticated } from '../lib/auth';

const STEPS = [
  { id: 1, title: 'Connect', hint: 'Phantom / Solflare · Devnet' },
  { id: 2, title: 'Open tab', hint: 'ix 24 · wallet popup · Explorer' },
  { id: 3, title: '402 Pay', hint: 'details → Pay · --max-amount' },
] as const;

export const DemoWizard: React.FC<{ onExit?: () => void }> = ({ onExit }) => {
  const [authed, setAuthed] = useState(() => isAuthenticated());
  const [step, setStep] = useState(authed ? 2 : 1);
  const [streamId, setStreamId] = useState<number | undefined>();

  return (
    <div className="min-h-screen bg-[#0b1226] text-white flex flex-col" style={{ fontFamily: "'Montserrat', 'Inter', sans-serif" }}>
      <div className="h-14 border-b border-[#243365]/60 bg-[#0e1631] px-6 flex items-center justify-between">
        <div>
          <h1 className="text-[14px] font-bold uppercase tracking-wider">KeyShield demo</h1>
          <p className="text-[10px] text-[#8a96c2]">一条故事 · 不是产品地图</p>
        </div>
        {onExit && (
          <button type="button" onClick={onExit} className="text-[11px] text-[#8a96c2] hover:text-white">
            Full dashboard
          </button>
        )}
      </div>
      {authed && <StatusStrip />}
      <div className="flex-1 overflow-auto px-6 py-8">
        <div className="max-w-xl mx-auto space-y-6">
          <div className="flex gap-2">
            {STEPS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { if (authed || s.id === 1) setStep(s.id); }}
                className={`flex-1 rounded-xl border px-3 py-2 text-left ${
                  step === s.id ? 'bg-white text-black border-white' : 'border-[#243365] text-[#a8b3d8]'
                }`}
              >
                <div className="text-[10px] uppercase tracking-wider opacity-70">Step {s.id}</div>
                <div className="text-[13px] font-semibold">{s.title}</div>
                <div className="text-[10px] opacity-70">{s.hint}</div>
              </button>
            ))}
          </div>

          {step === 1 && (
            <div className="rounded-xl border border-[#243365]/50 bg-[#131c39] p-5">
              <h2 className="text-[13px] font-bold uppercase tracking-wider mb-3">Connect on Devnet</h2>
              {authed ? (
                <p className="text-[13px] text-emerald-300">Wallet session is live.</p>
              ) : (
                <WalletConnector onConnect={() => { setAuthed(true); setStep(2); }} />
              )}
            </div>
          )}

          {step === 2 && authed && (
            <div className="rounded-xl border border-[#243365]/50 bg-[#131c39] p-5 space-y-3">
              <h2 className="text-[13px] font-bold uppercase tracking-wider">Open the payment tab</h2>
              <OpenStreamTab onOpened={(info) => { setStreamId(info.streamId); setStep(3); }} />
              <button type="button" onClick={() => setStep(3)} className="text-[11px] text-[#8a96c2] hover:text-white">
                Skip if a stream is already open
              </button>
            </div>
          )}

          {step === 3 && authed && (
            <div className="rounded-xl border border-[#243365]/50 bg-[#131c39] p-5 space-y-3">
              <h2 className="text-[13px] font-bold uppercase tracking-wider">402 preview</h2>
              <p className="text-[12px] text-[#8a96c2]">
                Same hand feel as awal / the extension toast: read the body, then Pay, refuse if over --max-amount.
              </p>
              <PaymentPreview streamId={streamId} defaultAmount={1} defaultMax={1000} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export function isDemoPath(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === '/demo') return true;
  if (window.location.hash === '#/demo') return true;
  return new URLSearchParams(window.location.search).has('demo');
}
