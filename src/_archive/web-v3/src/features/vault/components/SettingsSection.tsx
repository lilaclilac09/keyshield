import React, { useState } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { apiFetch } from '../../../lib/auth';

export const SettingsSection: React.FC<{ addr: string }> = ({ addr }) => {
  const [revealDuration, setRevealDuration] = useState(30);
  const [defaultExpiry, setDefaultExpiry] = useState(90);

  return (
    <div className="space-y-6">
      <Card title="Settings" description="Account, security, and preferences">
        <div className="space-y-4">
          <div className="flex items-center justify-between px-3 py-2 rounded-[2px] bg-[#050505] border border-zinc-800">
            <span className="text-[12px] text-zinc-300">Reveal Duration</span>
            <input
              type="number"
              min={5}
              max={120}
              value={revealDuration}
              onChange={(e) => setRevealDuration(Number(e.target.value))}
              className="w-20 bg-[#0a0a0a] border border-zinc-700 rounded px-2 py-1 text-[12px] text-white"
            />
          </div>
          <div className="flex items-center justify-between px-3 py-2 rounded-[2px] bg-[#050505] border border-zinc-800">
            <span className="text-[12px] text-zinc-300">Default Expiry (days)</span>
            <input
              type="number"
              min={7}
              max={365}
              value={defaultExpiry}
              onChange={(e) => setDefaultExpiry(Number(e.target.value))}
              className="w-20 bg-[#0a0a0a] border border-zinc-700 rounded px-2 py-1 text-[12px] text-white"
            />
          </div>
          <div className="flex items-center justify-between px-3 py-2 rounded-[2px] bg-[#050505] border border-zinc-800">
            <span className="text-[12px] text-zinc-300">Wallet Address</span>
            <span className="text-[11px] text-zinc-400 font-mono">{addr}</span>
          </div>
        </div>
      </Card>
    </div>
  );
};
