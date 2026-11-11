import React, { useEffect, useState } from 'react';
import { subscribeAppFeedback, type AppFeedback } from '../../lib/app-feedback';
import { feedbackVisibleMs } from '../../lib/human-usable';

const TONE: Record<AppFeedback['kind'], string> = {
  success: 'border-emerald-900/60 bg-emerald-950/95 text-emerald-200',
  error: 'border-red-900/60 bg-red-950/95 text-red-200',
  busy: 'border-[#2e4585] bg-[#131c39]/95 text-white',
  info: 'border-[#243365] bg-[#131c39]/95 text-[#e8ecff]',
};

export const AppFeedbackToast: React.FC = () => {
  const [current, setCurrent] = useState<AppFeedback | null>(null);
  const [queue, setQueue] = useState<AppFeedback[]>([]);

  useEffect(() => subscribeAppFeedback((next) => {
    setQueue((prev) => [...prev.slice(-4), next]);
  }), []);

  useEffect(() => {
    if (current && current.kind === 'busy' && queue.length > 0) {
      const [next, ...rest] = queue;
      setCurrent(next);
      setQueue(rest);
      return;
    }
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setCurrent(next);
    setQueue(rest);
  }, [current, queue]);

  useEffect(() => {
    if (!current || current.kind === 'busy') return;
    const t = window.setTimeout(() => setCurrent(null), feedbackVisibleMs(current.kind));
    return () => window.clearTimeout(t);
  }, [current]);

  if (!current) return null;

  return (
    <div
      role="status"
      aria-live={current.kind === 'error' ? 'assertive' : 'polite'}
      data-testid="app-feedback-toast"
      data-kind={current.kind}
      data-source={current.source ?? ''}
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] w-[min(92vw,28rem)] rounded-xl border px-4 py-3 shadow-lg ${TONE[current.kind]}`}
    >
      <p className="text-[13px] font-semibold">{current.title}</p>
      {current.detail ? <p className="text-[12px] mt-1 opacity-80 leading-relaxed">{current.detail}</p> : null}
    </div>
  );
};
