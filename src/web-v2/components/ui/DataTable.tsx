import React from 'react';
export interface Column<T> { header: string; render: (item: T) => React.ReactNode; className?: string; }
export interface DataTableProps<T> { columns: Column<T>[]; data: T[]; emptyMessage?: string; className?: string; }

export function DataTable<T extends { id: string | number }>({ columns, data, emptyMessage = 'No records found', className = '' }: DataTableProps<T>) {
  if (data.length === 0) return <div className={`rounded-[3px] border border-zinc-800/50 bg-[#0a0a0a] py-12 text-center ${className}`}><p className="text-[12px] text-zinc-600">{emptyMessage}</p></div>;
  return (
    <div className={`rounded-[3px] border border-zinc-800/50 overflow-hidden ${className}`}>
      <div className="grid border-b border-zinc-800/50 bg-[#0d0d0d]" style={{ gridTemplateColumns: columns.map(c => c.className || '1fr').join(' ') }}>
        {columns.map((col, i) => (<div key={i} className="px-4 py-2.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{col.header}</div>))}
      </div>
      {data.map((item, rowIdx) => (
        <div key={item.id} className={`grid border-b border-zinc-800/30 last:border-0 hover:bg-white/[0.02] transition-colors ${rowIdx % 2 === 0 ? 'bg-[#0a0a0a]' : 'bg-[#0c0c0c]'}`} style={{ gridTemplateColumns: columns.map(c => c.className || '1fr').join(' ') }}>
          {columns.map((col, colIdx) => (<div key={colIdx} className="px-4 py-3 text-[12px] text-zinc-300">{col.render(item)}</div>))}
        </div>
      ))}
    </div>
  );
}
