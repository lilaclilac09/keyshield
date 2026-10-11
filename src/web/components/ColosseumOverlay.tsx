import React, { useEffect, useState } from 'react';
import { COLOSSEUM_BEATS, COLOSSEUM_BEAT_MS, type ColosseumSection } from '../lib/colosseum-beats';

type Props = {
  onGo: (section: ColosseumSection) => void;
};

function isOn(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('colosseum');
  } catch {
    return false;
  }
}

export const ColosseumOverlay: React.FC<Props> = ({ onGo }) => {
  const [on] = useState(isOn);
  const [i, setI] = useState(0);
  const [box, setBox] = useState<DOMRect | null>(null);

  const beat = COLOSSEUM_BEATS[i];

  useEffect(() => {
    if (!on || !beat) return;
    onGo(beat.section);
    if (beat.tab) {
      window.dispatchEvent(new CustomEvent('ks-colosseum-tab', { detail: beat.tab }));
    }
  }, [on, beat, onGo]);

  useEffect(() => {
    if (!on || !beat) return;
    const measure = () => {
      const el = document.querySelector(`[data-colosseum="${beat.target}"]`);
      setBox(el ? el.getBoundingClientRect() : null);
    };
    measure();
    const t = window.setInterval(measure, 200);
    return () => window.clearInterval(t);
  }, [on, beat]);

  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => {
      setI((n) => (n + 1) % COLOSSEUM_BEATS.length);
    }, COLOSSEUM_BEAT_MS);
    return () => window.clearInterval(t);
  }, [on]);

  if (!on || !beat) return null;

  return (
    <>
      {box && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[80] rounded-2xl border-2 border-white shadow-[0_0_0_9999px_rgba(5,8,18,0.55)]"
          style={{
            top: box.top - 8,
            left: box.left - 8,
            width: box.width + 16,
            height: box.height + 16,
            transform: 'scale(1.02)',
            transformOrigin: 'center',
          }}
        />
      )}
      <div className="fixed bottom-0 inset-x-0 z-[90] bg-[#070b16]/95 border-t border-[#243365] px-5 py-4">
        <div className="max-w-5xl mx-auto flex items-start gap-4">
          <span className="shrink-0 text-[12px] font-mono text-[#93b4ff] pt-1">
            BEAT {String(beat.n).padStart(2, '0')}/15
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[18px] font-semibold text-white leading-snug">{beat.caption}</p>
            <p className="text-[14px] text-[#a8b3d8] mt-1">VO — {beat.vo}</p>
          </div>
          <div className="shrink-0 flex gap-2">
            <button
              type="button"
              className="h-9 px-3 rounded-lg border border-[#243365] text-[13px] text-white"
              onClick={() => setI((n) => (n + COLOSSEUM_BEATS.length - 1) % COLOSSEUM_BEATS.length)}
            >
              Prev
            </button>
            <button
              type="button"
              className="h-9 px-3 rounded-lg bg-white text-black text-[13px] font-semibold"
              onClick={() => setI((n) => (n + 1) % COLOSSEUM_BEATS.length)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
