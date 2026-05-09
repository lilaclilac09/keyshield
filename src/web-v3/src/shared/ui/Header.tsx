import React from "react";
import { Badge } from "./Badge";
import { Button } from "./Button";

export interface HeaderProps { title: string; subtitle?: string; onSearch?: () => void; onAdd?: () => void; searchActive?: boolean; actions?: React.ReactNode; healthStatus?: 'ok' | 'slow' | 'down' | 'unknown'; latency?: number; }

export const Header: React.FC<HeaderProps> = ({ title, subtitle, onSearch, onAdd, searchActive = false, actions, healthStatus = 'unknown', latency = 0 }) => {
  const statusColor = healthStatus === 'ok' ? 'success' : healthStatus === 'slow' ? 'warning' : healthStatus === 'down' ? 'danger' : 'neutral';
  return (
    <header className="h-14 border-b border-zinc-800/60 bg-[#050505] px-6 flex items-center justify-between shrink-0">
      <div>
        <h1 className="text-[14px] font-bold text-white uppercase tracking-wider">{title}</h1>
        {subtitle && <p className="text-[10px] text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2" title={healthStatus === 'ok' ? `Backend healthy \xb7 ${latency}ms` : 'Backend status unknown'}>
          <Badge variant={statusColor} dot>{healthStatus === 'down' ? 'OFFLINE' : healthStatus === 'slow' ? 'SLOW' : 'API'}</Badge>
        </div>
        {actions}
        {onSearch && (
          <Button variant="ghost" size="sm" onClick={onSearch}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          </Button>
        )}
        {onAdd && (
          <Button variant="primary" size="sm" onClick={onAdd}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>New
          </Button>
        )}
      </div>
    </header>
  );
};
