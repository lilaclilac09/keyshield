import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Disc3, LayoutGrid, List, ExternalLink } from 'lucide-react';
import { coverUrl, fmt, loadSetlist, type DjTrack } from '../../lib/dj-set';

type ViewMode = 'grid' | 'list';

export const DjSetSection: React.FC = () => {
  const [tracks, setTracks] = useState<DjTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<ViewMode>('grid');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSetlist()
      .then((data) => {
        setTracks(data.tracks ?? []);
        setIndex(0);
      })
      .catch((err: Error) => setError(err.message || 'Failed to load setlist'))
      .finally(() => setLoading(false));
  }, []);

  const selectTrack = useCallback(
    (i: number) => {
      if (i < 0 || i >= tracks.length) return;
      setIndex(i);
      if (view === 'grid' && carouselRef.current) {
        const card = carouselRef.current.children[i] as HTMLElement | undefined;
        card?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    },
    [tracks.length, view],
  );

  const current = tracks[index];

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#243365]/50 bg-[#131c39] p-10 text-center text-[#8a96c2] text-sm">
        Loading DJ set…
      </div>
    );
  }

  if (error || tracks.length === 0) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-[#131c39] p-8 text-center">
        <p className="text-red-300 text-sm">{error || 'No tracks in setlist'}</p>
        <p className="text-[#8a96c2] text-xs mt-2">Run <code className="text-cyan-300">npm run sync:dj-set</code> in src/web</p>
      </div>
    );
  }

  const progress = ((index + 1) / tracks.length) * 100;

  return (
    <div
      className="rounded-[22px] border border-white/10 p-5 sm:p-6 shadow-2xl shadow-black/40"
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
        boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
      }}
    >
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-2">
          <Disc3 size={14} className="text-cyan-400" />
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#7f8db8] m-0">DJ Set</h2>
        </div>
        <div className="flex gap-3">
          {current?.spotify?.url && (
            <a href={current.spotify.url} target="_blank" rel="noreferrer" className="text-cyan-400 text-xs flex items-center gap-1 hover:underline">
              Spotify <ExternalLink size={10} />
            </a>
          )}
          {current?.links?.release && (
            <a href={current.links.release} target="_blank" rel="noreferrer" className="text-cyan-400 text-xs flex items-center gap-1 hover:underline">
              Release <ExternalLink size={10} />
            </a>
          )}
          {current?.links?.album && (
            <a href={current.links.album} target="_blank" rel="noreferrer" className="text-cyan-400 text-xs flex items-center gap-1 hover:underline">
              Album <ExternalLink size={10} />
            </a>
          )}
        </div>
      </div>

      {view === 'grid' && (
        <div className="overflow-hidden px-0.5 pb-4">
          <div
            ref={carouselRef}
            className="flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="DJ set track carousel"
          >
            {tracks.map((t, i) => (
              <button
                key={t.track_id || i}
                type="button"
                onClick={() => selectTrack(i)}
                className={`flex-none w-[168px] sm:w-[168px] snap-center bg-transparent border-0 p-0 cursor-pointer text-left transition-transform duration-200 ${
                  i === index ? 'scale-[1.03]' : ''
                }`}
              >
                <div
                  className={`relative aspect-square rounded-[14px] overflow-hidden border-2 transition-all duration-200 ${
                    i === index
                      ? 'border-cyan-400 shadow-[0_0_0_1px_#4fd6ff,0_0_28px_rgba(79,214,255,0.55)]'
                      : 'border-transparent shadow-[0_10px_30px_rgba(0,0,0,0.35)]'
                  }`}
                >
                  <img src={coverUrl(t.cover)} alt={t.title} className="w-full h-full object-cover block" />
                  <div className="absolute inset-x-0 bottom-0 px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-white bg-gradient-to-t from-black/82 to-transparent">
                    {t.track_id || `TRACK ${String(i + 1).padStart(2, '0')}`}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {view === 'list' && (
        <div className="rounded-[14px] border border-white/10 overflow-hidden mb-3.5">
          {tracks.map((t, i) => (
            <button
              key={t.track_id || i}
              type="button"
              onClick={() => selectTrack(i)}
              className={`w-full grid grid-cols-[48px_1fr_auto] gap-3 items-center px-3 py-2.5 border-t border-white/10 first:border-t-0 text-left ${
                i === index ? 'bg-cyan-400/10' : 'bg-[rgba(8,12,24,0.55)]'
              }`}
            >
              <img src={coverUrl(t.cover)} alt={t.title} className="w-12 h-12 rounded-lg object-cover" />
              <div>
                <div className="text-[13px] font-semibold text-white">{t.title}</div>
                <div className="text-[11px] text-[#7f8db8] mt-0.5">{t.artist}</div>
              </div>
              <div className="text-[10px] text-cyan-400 tracking-wider">{t.track_id}</div>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 mx-1 mb-3.5">
        <div className="flex gap-1.5">
          {tracks.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => selectTrack(i)}
              className={`w-[7px] h-[7px] rounded-full p-0 border-0 cursor-pointer ${
                i === index ? 'bg-cyan-400' : 'bg-[#2a3558]'
              }`}
              aria-label={`Track ${i + 1}`}
            />
          ))}
        </div>
        <div className="flex-1 h-[3px] bg-[#1a2442] rounded-full overflow-hidden">
          <span className="block h-full bg-gradient-to-r from-[#35bfff] to-cyan-400 transition-all duration-250" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-[1.2fr_repeat(3,auto)] gap-2.5 items-center px-3.5 py-3 rounded-[14px] border border-white/10 bg-[rgba(8,12,24,0.75)] mb-3.5">
        <div>
          <div className="text-[13px] font-bold uppercase tracking-wider text-white">
            {current.track_id || `TRACK ${String(index + 1).padStart(2, '0')}`}
          </div>
          <div className="text-[11px] text-[#7f8db8] mt-0.5">
            {current.title} — {current.artist}
          </div>
        </div>
        <div className="text-right text-[11px] text-[#7f8db8] uppercase tracking-wider">
          BPM<strong className="block text-white text-xs mt-0.5 font-semibold">{fmt(current.bpm)}</strong>
        </div>
        <div className="text-right text-[11px] text-[#7f8db8] uppercase tracking-wider">
          KEY<strong className="block text-white text-xs mt-0.5 font-semibold">{fmt(current.key)}</strong>
        </div>
        <div className="text-right text-[11px] text-[#7f8db8] uppercase tracking-wider">
          TIME<strong className="block text-white text-xs mt-0.5 font-semibold">{fmt(current.duration)}</strong>
        </div>
      </section>

      <div className="flex justify-between items-center px-1">
        <div className="inline-flex gap-2">
          <button
            type="button"
            onClick={() => setView('grid')}
            className={`w-[34px] h-[34px] rounded-[10px] border flex items-center justify-center ${
              view === 'grid'
                ? 'text-cyan-400 border-cyan-400/45 shadow-[0_0_16px_rgba(79,214,255,0.15)] bg-[#0d1428]'
                : 'text-[#7f8db8] border-white/10 bg-[#0d1428]'
            }`}
            aria-label="Grid view"
          >
            <LayoutGrid size={14} />
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            className={`w-[34px] h-[34px] rounded-[10px] border flex items-center justify-center ${
              view === 'list'
                ? 'text-cyan-400 border-cyan-400/45 shadow-[0_0_16px_rgba(79,214,255,0.15)] bg-[#0d1428]'
                : 'text-[#7f8db8] border-white/10 bg-[#0d1428]'
            }`}
            aria-label="List view"
          >
            <List size={14} />
          </button>
        </div>
        <div className="text-[11px] text-[#7f8db8]">
          {index + 1} / {tracks.length}
        </div>
      </div>
    </div>
  );
};
