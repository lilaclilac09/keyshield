import { BookOpen, Shield, Key, Users, Globe, Terminal, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@keyshield/ui';

const sections = [
  { icon: Shield, title: 'Getting Started', items: ['What is KeyShield?', 'Quick Start', 'Architecture Overview'] },
  { icon: Key, title: 'Vault', items: ['Managing API Keys', 'Key Types', 'Encryption & Security', 'Sharing Keys'] },
  { icon: Users, title: 'Agents', items: ['Registering Agents', 'Rate Limiting', 'Ephemeral Wallets', 'MPP Streams'] },
  { icon: Globe, title: 'Browser Extension', items: ['Installation', 'Auto-Detection', 'x402 Auto-Pay', 'Token Sync'] },
  { icon: Terminal, title: 'API Reference', items: ['Authentication', 'Endpoints', 'Rate Limits', 'Error Codes'] },
  { icon: Terminal, title: 'CLI', items: ['Installation', 'Commands', 'Configuration', 'Proxy Mode'] },
];

export default function Docs() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ color: '#707070' }}>Documentation</h1>
          <p className="page-header-subtitle">Comprehensive guide to KeyShield features and API</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sections.map((section, i) => (
          <Card key={i} className="border-[#0f0f0f] shadow-sm hover:shadow-md transition-shadow duration-150 bg-[#080808]">
            <CardHeader>
              <div className="flex items-center gap-3">
                <section.icon size={20} style={{ color: '#404040' }} />
                <CardTitle className="text-base" style={{ color: '#707070' }}>{section.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {section.items.map((item, j) => (
                  <li key={j}>
                    <button className="flex items-center gap-2 text-sm hover:text-white transition-colors w-full text-left" style={{ color: '#505050' }}>
                      <ChevronRight className="h-3 w-3 shrink-0" style={{ color: '#404040' }} /> {item}
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
