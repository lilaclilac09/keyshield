import React, { useState } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { apiFetch } from '../../../lib/auth';

interface DevConfig {
  api_base: string;
  version: string;
  build_date: string;
}

export const DeveloperSection: React.FC = () => {
  const [config, setConfig] = useState<DevConfig>({ api_base: 'http://localhost:8000', version: '3.0.0', build_date: '' });
  const [loading, setLoading] = useState(true);

  return (
    <div className="space-y-6">
      <Card title="Developer" description="API tokens, SDK snippets, and endpoint reference">
        <div className="space-y-4">
          <div className="px-3 py-2 rounded-[2px] bg-[#050505] border border-zinc-800">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">API Base URL</span>
            <code className="text-[12px] text-emerald-300 font-mono">{config.api_base}</code>
          </div>
          <div className="px-3 py-2 rounded-[2px] bg-[#050505] border border-zinc-800">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider block mb-1">Version</span>
            <code className="text-[12px] text-white font-mono">{config.version}</code>
          </div>
          <div className="space-y-2 mt-4">
            <h4 className="text-[12px] text-zinc-400 uppercase tracking-wider">Key Endpoints</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {[
                { method: 'GET', path: '/api/vault/list', desc: 'List vault items' },
                { method: 'POST', path: '/api/vault/add', desc: 'Add a secret' },
                { method: 'DELETE', path: '/api/vault/:id', desc: 'Delete a secret' },
                { method: 'GET', path: '/api/vault/:id/decrypt', desc: 'Decrypt a secret' },
              ].map(ep => (
                <div key={ep.path} className="flex items-center gap-3 px-3 py-2 rounded-[2px] bg-[#050505] border border-zinc-800">
                  <Badge variant="neutral">{ep.method}</Badge>
                  <code className="text-[11px] text-white font-mono truncate flex-1">{ep.path}</code>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
