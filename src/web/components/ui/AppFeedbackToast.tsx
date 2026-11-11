import React, { useEffect, useState } from 'react';
import { subscribeAppFeedback, type AppFeedback } from '../../lib/app-feedback';

const TONE: Record<AppFeedback['kind'], string> = {
  success: 'border-emerald-900/60 bg-emerald-950/95 text-emerald-200',
  error: 'border-red-900/60 bg-red-950/95 text-red-200',
  busy: 'border-[#2e4585] bg-[#131c39]/95 text-white',
  info: 'border-[#243365] bg-[#131c39]/95 text-[#e8ecff]',
};

export const AppFeedbackToast: React.FC = () => {
  const [fb, setFb] = useState<AppFeedback | null>(null);
  const [seq, setSeq] = useState(0);

  useEffect(() => subscribeAppFeedback((next) => {
    setFb(next);
    setSeq((n) => n + 1);
  }), []);

  useEffect(() => {
    if (!fb || fb.kind === 'busy') return;
    const ms = fb.kind === 'error' ? 7000 : 4000;
    const t = window.setTimeout(() => setFb(null), ms);
    return () => window.clearTimeout(t);
  }, [fb, seq]);

  if (!fb) return null;

  return (
    <div
      role="status"
      aria-live={fb.kind === 'error' ? 'assertive' : 'polite'}
      data-testid="app-feedback-toast"
      data-kind={fb.kind}
      data-source={fb.source ?? ''}
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] w-[min(92vw,28rem)] rounded-xl border px-4 py-3 shadow-lg ${TONE[fb.kind]}`}
    >
      <p className="text-[13px] font-semibold">{fb.title}</p>
      {fb.detail ? <p className="text-[12px] mt-1 opacity-80 leading-relaxed">{fb.detail}</p> : null}
    </div>
  );
};
