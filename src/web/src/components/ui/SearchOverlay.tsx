import React, { useRef, useEffect, useState, useMemo } from 'react';
import { X, Key, Users, Activity, Monitor, Share2, Server, BookOpen, Code, BarChart3, Settings, ArrowRight } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Vault', path: '/app/vault', icon: Key, section: 'Workspace' },
  { label: 'Agents', path: '/app/agents', icon: Users, section: 'Workspace' },
  { label: 'Activity', path: '/app/activity', icon: Activity, section: 'Workspace' },
  { label: 'Sessions', path: '/app/sessions', icon: Monitor, section: 'Workspace' },
  { label: 'Sharing', path: '/app/sharing', icon: Share2, section: 'Collaborate' },
  { label: 'Ephemeral Wallets', path: '/app/ephemeral-wallets', icon: Server, section: 'Collaborate' },
  { label: 'Docs', path: '/app/docs', icon: BookOpen, section: 'System' },
  { label: 'Developer', path: '/app/developer', icon: Code, section: 'System' },
  { label: 'Reports', path: '/app/reports', icon: BarChart3, section: 'System' },
  { label: 'Settings', path: '/app/settings', icon: Settings, section: 'System' },
];

export interface SearchOverlayProps {
  query: string;
  onChange: (q: string) => void;
  onClose: () => void;
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({ query, onChange, onClose }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return NAV_ITEMS;
    const q = query.toLowerCase();
    return NAV_ITEMS.filter(item =>
      item.label.toLowerCase().includes(q) || item.section.toLowerCase().includes(q)
    );
  }, [query]);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && filtered[selectedIndex]) {
      window.location.hash = '';
      window.history.pushState({}, '', filtered[selectedIndex].path);
      window.dispatchEvent(new PopStateEvent('popstate'));
      onClose();
    }
    if (e.key === 'Escape') onClose();
  };

  const lastSection = useRef('');

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-overlay-box" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#6b6b7a', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search pages, actions, settings\u2026"
            className="search-overlay-input"
            value={query}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button onClick={onClose} className="text-[#6b6b7a] hover:text-white transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        {filtered.length > 0 && (
          <div className="search-overlay-results">
            {filtered.map((item, i) => {
              const showSection = item.section !== lastSection.current && (lastSection.current = item.section, true);
              return (
                <React.Fragment key={item.path}>
                  {showSection && i > 0 && (
                    <div className="px-5 pt-3 pb-1 text-[10px] font-semibold text-[#4a4a56] uppercase tracking-wider">
                      {item.section}
                    </div>
                  )}
                  <div
                    className={`search-overlay-item ${i === selectedIndex ? 'bg-white/[0.04]' : ''}`}
                    onClick={() => {
                      window.history.pushState({}, '', item.path);
                      window.dispatchEvent(new PopStateEvent('popstate'));
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(i)}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="search-overlay-item-text">{item.label}</span>
                    {i === selectedIndex && <ArrowRight className="h-3 w-3 ml-auto text-[#4a4a56]" />}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}

        {filtered.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-[#6b6b7a]">No results for "{query}"</p>
          </div>
        )}

        <div className="search-overlay-footer">
          <span>\u2191\u2193 navigate</span>
          <span>\u23CE open</span>
          <span className="ml-auto">esc close</span>
        </div>
      </div>
    </div>
  );
};
