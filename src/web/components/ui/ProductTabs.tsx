import React from 'react';

export interface ProductTabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

/** Underline tabs sized to their label, the pattern used by billing products. */
export function ProductTabs<T extends string>({
  tabs,
  value,
  onChange,
  label = 'Sections',
}: {
  tabs: ProductTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex items-end gap-0.5 overflow-x-auto border-b border-[#243365]/80">
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={`group relative flex items-center gap-2 px-3.5 pb-3 pt-1 text-[13px] font-medium tracking-tight whitespace-nowrap transition-colors ${
              selected ? 'text-white' : 'text-[#8a96c2] hover:text-[#e8ecff]'
            }`}
          >
            {tab.icon && <span className={selected ? 'text-white' : 'text-[#5e6a91] group-hover:text-[#a8b3d8]'}>{tab.icon}</span>}
            {tab.label}
            {tab.count != null && (
              <span className={`min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums ${
                selected ? 'bg-white text-black' : 'bg-[#0e1631] text-[#8a96c2] border border-[#243365]'
              }`}>{tab.count}</span>
            )}
            <span className={`absolute left-2 right-2 -bottom-px h-[2px] rounded-full ${selected ? 'bg-white' : 'bg-transparent'}`} />
          </button>
        );
      })}
    </div>
  );
}
