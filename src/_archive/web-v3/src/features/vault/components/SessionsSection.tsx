import React, { useState, useEffect, useCallback } from 'react';
import { Card, StatCard } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { apiFetch } from '../../../lib/auth';

interface SessionInfo {
  id: number;
  device: string;
  ip: string;
  created_at: number;
  last_active: number;
}

export const SessionsSection: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await apiFetch('/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions ?? []);
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  return (
    <div className="space-y-6">
      <Card title="Sessions" description="Active auth sessions across devices">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[12px] text-zinc-400">{sessions.length} active sessions</span>
          <Button variant="primary" size="sm" onClick={fetchSessions}>Refresh</Button>
        </div>
        {sessions.length === 0 ? (
          <div className="text-center py-8 text-zinc-500">No active sessions.</div>
        ) : (
          <div className="space-y-2">
            {sessions.map(s => (
              <div key={s.id} className="flex items-center gap-4 px-3 py-2 rounded-[2px] bg-[#050505] border border-zinc-800">
                <Badge variant="success">Active</Badge>
                <span className="text-[12px] text-white font-medium">{s.device}</span>
                <span className="text-[11px] text-zinc-500 font-mono">{s.ip}</span>
                <span className="text-[11px] text-zinc-600">Since {new Date(s.created_at * 1000).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
