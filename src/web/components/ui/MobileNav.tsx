import React from 'react';

interface NavItem { id: string; label: string }

/** Below md the sidebar is hidden; this scrollable strip replaces it. */
export const MobileNav: React.FC<{ items: NavItem[]; active: string; onNavigate: (id: string) => void }> = ({ items, active, onNavigate }) => (
  <nav aria-label="Sections" className="md:hidden flex gap-1 overflow-x-auto border-b border-[#243365]/50 bg-[#0e1631] px-2 py-2">
    {items.map((item) => (
      <button
        key={item.id}
        onClick={() => onNavigate(item.id)}
        aria-current={active === item.id ? 'page' : undefined}
        className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium ${active === item.id ? 'bg-white text-black' : 'text-[#8a96c2]'}`}
      >
        {item.label}
      </button>
    ))}
  </nav>
);
