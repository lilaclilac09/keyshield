import { useState } from 'react';
import { BookOpen, Shield, Key, Users, Globe, Terminal, ChevronRight, Rocket, Bot, Code2, CreditCard, Lock, AlertCircle, Zap, DollarSign, FileText, Check, ArrowRight, Activity, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@keyshield/ui';
import { getToken } from '@keyshield/shared/auth';
import { getApiConfig } from '@keyshield/shared/api';
import { CopyButton } from '../components/ui/CopyButton';
import { VERSION, BUILD_DATE, REPO_URL } from '@keyshield/shared/lib/version';

const apiConfig = getApiConfig();
const API_BASE = apiConfig.baseUrl;

const CHAPTERS = [
  { id: 'quickstart', title: 'Quickstart', icon: <Rocket size={14} /> },
  { id: 'concepts', title: 'Core concepts', icon: <Shield size={14} /> },
  { id: 'agents', title: 'Agent setup', icon: <Bot size={14} /> },
  { id: 'sdk', title: 'Python SDK', icon: <Code2 size={14} /> },
  { id: 'cli', title: 'CLI reference', icon: <Terminal size={14} /> },
  { id: 'billing', title: 'Billing & x402 & MPP', icon: <CreditCard size={14} /> },
  { id: 'security', title: 'Security', icon: <Lock size={14} /> },
  { id: 'troubleshoot', title: 'Troubleshooting', icon: <AlertCircle size={14} /> },
];

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="relative p-4 rounded-xl bg-[#080808] border font-mono text-sm" style={{ borderColor: '#141418' }}>
      {label && <p className="text-xs mb-2" style={{ color: '#6b6b7a' }}>{label}</p>}
      <pre className="whitespace-pre-wrap break-all" style={{ color: '#e0e0e0' }}>{code}</pre>
    </div>
  );
}

export default function Docs() {
  const [activeChapter, setActiveChapter] = useState('quickstart');
  const token = getToken() ?? 'YOUR_TOKEN';

  const renderChapter = () => {
    switch (activeChapter) {
      case 'quickstart':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold" style={{ color: '#F8F8FA' }}>Quickstart</h2>
            <p className="text-sm" style={{ color: '#a0a0b0' }}>Get KeyShield running in 3 minutes.</p>
            <div className="space-y-4">
              <h3 className="text-lg font-medium" style={{ color: '#F8F8FA' }}>1. Install</h3>
              <CodeBlock code={`curl -fsSL ${API_BASE}/install.sh | bash`} label="Linux/macOS" />
              <h3 className="text-lg font-medium" style={{ color: '#F8F8FA' }}>2. Login</h3>
              <CodeBlock code="keyshield login <wallet-address> <passphrase>" label="CLI" />
              <h3 className="text-lg font-medium" style={{ color: '#F8F8FA' }}>3. Store a key</h3>
              <CodeBlock code="keyshield store openai sk-proj-your-key" label="CLI" />
              <h3 className="text-lg font-medium" style={{ color: '#F8F8FA' }}>4. Use the proxy</h3>
              <CodeBlock code={`curl ${API_BASE}/proxy/openai/v1/models \\\n  -H "Authorization: Bearer ${token}"`} label="cURL" />
            </div>
          </div>
        );
      case 'concepts':
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: '#F8F8FA' }}>Core Concepts</h2>
            {[
              { icon: <Shield size={18} style={{ color: '#6366f1' }} />, title: 'Zero-Trust Architecture', desc: 'KeyShield never stores raw API keys in memory between requests. Keys are AES-256-GCM encrypted at rest and decrypted per-request on the server side.' },
              { icon: <Key size={18} style={{ color: '#10b981' }} />, title: 'Vault', desc: 'The vault stores API keys, passwords, notes, and SSH keys. Each entry is encrypted with a key derived from your wallet signature.' },
              { icon: <Bot size={18} style={{ color: '#f59e0b' }} />, title: 'Agents', desc: 'Agents are AI identities with scoped API access. Each agent has its own keypair and can be independently revoked.' },
            ].map((item, i) => (
              <div key={i} className="p-5 rounded-xl bg-[#080808] border" style={{ borderColor: '#141418' }}>
                <h3 className="text-lg font-medium flex items-center gap-2 mb-2" style={{ color: '#F8F8FA' }}>{item.icon} {item.title}</h3>
                <p className="text-sm" style={{ color: '#a0a0b0' }}>{item.desc}</p>
              </div>
            ))}
          </div>
        );
      case 'agents':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold" style={{ color: '#F8F8FA' }}>Agent Setup</h2>
            <p className="text-sm" style={{ color: '#a0a0b0' }}>Register AI agents for scoped API access.</p>
            <CodeBlock code={`keyshield agent register --name "Trading Bot"\n# Returns agent_id and pubkey`} label="CLI" />
            <CodeBlock code={`from keyshield_sdk import KeyShield\nks = KeyShield(token="your-session-token")\nclient = ks.openai_client()  # uses agent's scoped access`} label="Python" />
          </div>
        );
      case 'sdk':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold" style={{ color: '#F8F8FA' }}>Python SDK</h2>
            <CodeBlock code="pip install keyshield-sdk" label="Install" />
            <CodeBlock code={`from keyshield_sdk import KeyShield\n\n# Initialize\nks = KeyShield(token=os.environ["KS_TOKEN"])\n\n# Get a proxied OpenAI client\nclient = ks.openai_client()\nresponse = client.chat.completions.create(\n    model="gpt-4o",\n    messages=[{"role": "user", "content": "Hello"}]\n)\n\n# Get a proxied Anthropic client\nanthropic = ks.anthropic_client()`} label="Usage" />
          </div>
        );
      case 'cli':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold" style={{ color: '#F8F8FA' }}>CLI Reference</h2>
            <div className="space-y-3">
              {[
                { cmd: 'keyshield login <addr> <passphrase>', desc: 'Authenticate with wallet' },
                { cmd: 'keyshield store <provider> <key>', desc: 'Store an API key' },
                { cmd: 'keyshield list', desc: 'List vault items' },
                { cmd: 'keyshield decrypt <id>', desc: 'Decrypt a key' },
                { cmd: 'keyshield agent register --name <name>', desc: 'Register an agent' },
                { cmd: 'keyshield proxy --port 8080', desc: 'Start local proxy' },
                { cmd: 'keyshield status', desc: 'Show server health' },
              ].map((c, i) => (
                <div key={i} className="p-3 rounded-xl bg-[#080808] border" style={{ borderColor: '#141418' }}>
                  <code className="text-sm font-mono" style={{ color: '#e0e0e0' }}>{c.cmd}</code>
                  <p className="text-xs mt-1" style={{ color: '#6b6b7a' }}>{c.desc}</p>
                </div>
              ))}
            </div>
          </div>
        );
      case 'billing':
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: '#F8F8FA' }}>Billing & x402 & MPP</h2>
            {[
              { icon: <DollarSign size={18} style={{ color: '#10b981' }} />, title: 'Billing', desc: 'Track usage and spend across all proxied API calls. SOL and USD balances shown in the Activity page.' },
              { icon: <Zap size={18} style={{ color: '#f59e0b' }} />, title: 'x402 Auto-Pay', desc: 'x402 is the micropayment protocol for AI agent payments. Configure trusted domains and thresholds in Settings.' },
              { icon: <Activity size={18} style={{ color: '#6366f1' }} />, title: 'MPP Streams', desc: 'Multi-Party Payment streams enable agents to make micro-payments per API call. Open a stream with a SOL deposit.' },
            ].map((item, i) => (
              <div key={i} className="p-5 rounded-xl bg-[#080808] border" style={{ borderColor: '#141418' }}>
                <h3 className="text-lg font-medium flex items-center gap-2 mb-2" style={{ color: '#F8F8FA' }}>{item.icon} {item.title}</h3>
                <p className="text-sm" style={{ color: '#a0a0b0' }}>{item.desc}</p>
              </div>
            ))}
          </div>
        );
      case 'security':
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold mb-4" style={{ color: '#F8F8FA' }}>Security</h2>
            {[
              { icon: <Lock size={18} style={{ color: '#6366f1' }} />, title: 'Encryption', desc: 'All vault entries are encrypted with AES-256-GCM. The encryption key is derived from your wallet signature via HKDF-SHA256.' },
              { icon: <Shield size={18} style={{ color: '#10b981' }} />, title: 'Passkey Auth', desc: 'WebAuthn passkeys with PRF extension for zero-knowledge vault unlock. No password stored on any server.' },
            ].map((item, i) => (
              <div key={i} className="p-5 rounded-xl bg-[#080808] border" style={{ borderColor: '#141418' }}>
                <h3 className="text-lg font-medium flex items-center gap-2 mb-2" style={{ color: '#F8F8FA' }}>{item.icon} {item.title}</h3>
                <p className="text-sm" style={{ color: '#a0a0b0' }}>{item.desc}</p>
              </div>
            ))}
          </div>
        );
      case 'troubleshoot':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold" style={{ color: '#F8F8FA' }}>Troubleshooting</h2>
            <div className="space-y-3">
              {[
                { q: '401 Unauthorized', a: 'Your session token has expired. Re-authenticate with your wallet.' },
                { q: 'Key not found', a: 'The vault key ID does not exist. Check your vault entries.' },
                { q: 'Wallet not detected', a: 'Install Phantom or Solflare browser extension.' },
                { q: 'MPP stream failed', a: 'Ensure sufficient SOL deposit and correct PDA derivation.' },
              ].map((item, i) => (
                <div key={i} className="p-4 rounded-xl bg-[#080808] border" style={{ borderColor: '#141418' }}>
                  <h4 className="font-medium mb-1" style={{ color: '#F8F8FA' }}>{item.q}</h4>
                  <p className="text-sm" style={{ color: '#a0a0b0' }}>{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Documentation</h1>
          <p className="page-header-subtitle">KeyShield {VERSION} \u00B7 built {BUILD_DATE}</p>
        </div>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-[#6366f1] hover:text-white transition-colors">
          GitHub <ExternalLink size={14} />
        </a>
      </div>

      <div className="flex gap-8">
        {/* Sidebar */}
        <aside className="docs-sidebar w-52 shrink-0 hidden md:block">
          <div className="sticky top-8 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-[#4a4a56] px-3 mb-2">Documentation</div>
            {CHAPTERS.map(ch => (
              <button
                key={ch.id}
                onClick={() => setActiveChapter(ch.id)}
                className={`docs-sidebar-item w-full ${activeChapter === ch.id ? 'active' : ''}`}
              >
                {ch.icon}
                <span>{ch.title}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="rounded-xl border p-6 bg-[#080808]" style={{ borderColor: '#141418' }}>
            {renderChapter()}
          </div>
        </div>
      </div>
    </div>
  );
}
