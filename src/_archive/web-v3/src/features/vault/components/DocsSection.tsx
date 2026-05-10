import React from 'react';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';

export const DocsSection: React.FC = () => (
  <div className="space-y-6">
    <Card title="Documentation" description="Architecture, integration guides, and specs">
      <div className="space-y-4">
        {[
          { title: 'Zero-Trust Proxy Architecture', desc: 'How KeyShield proxies API calls with session tokens' },
          { title: 'Agent Integration Guide', desc: 'Connecting agents to KeyShield proxy' },
          { title: 'Vault Encryption Specs', desc: 'AES-256-GCM encryption details' },
          { title: 'API Reference', desc: 'REST API endpoints for vault operations' },
          { title: 'Security Model', desc: 'ed25519 wallet signatures and passkey trust' },
        ].map(doc => (
          <div key={doc.title} className="flex items-center gap-3 px-3 py-3 rounded-[2px] bg-[#050505] border border-zinc-800 hover:border-zinc-600 transition-colors cursor-pointer">
            <Badge variant="neutral">DOC</Badge>
            <div className="flex-1">
              <p className="text-[12px] text-white font-medium">{doc.title}</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">{doc.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  </div>
);
