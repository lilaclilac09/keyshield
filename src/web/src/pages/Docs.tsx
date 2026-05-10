import { useState } from 'react';
import { BookOpen, Shield, Key, Users, Globe, Terminal, ChevronRight, Rocket, Bot, Code2, CreditCard, Lock, AlertCircle, Zap, DollarSign, FileText, Check, ArrowRight, Activity } from 'lucide-react';
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
    <div className="relative p-4 rounded-lg bg-[#0a0a0a] border font-mono text-sm" style={{ borderColor: '#141414', color: '#e0e0e0' }}>
      {label && <p className="text-xs mb-2" style={{ color: '#333' }}>{label}</p>}
      <pre className="whitespace-pre-wrap break-all">{code}</pre>
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
            <h2 className="text-2xl font-semibold" style={{ color: '#707070' }}>Quickstart</h2>
            <p className="text-sm" style={{ color: '#4a4a4a' }}>Get KeyShield running in 3 minutes.</p>
            <div className="space-y-4">
              <h3 className="text-lg font-medium" style={{ color: '#e0e0e0' }}>1. Install</h3>
              <CodeBlock code={`curl -fsSL ${API_BASE}/install.sh | bash`} label="Linux/macOS" />
              <h3 className="text-lg font-medium" style={{ color: '#e0e0e0' }}>2. Login</h3>
              <CodeBlock code="keyshield login <wallet-address> <passphrase>" label="CLI" />
              <h3 className="text-lg font-medium" style={{ color: '#e0e0e0' }}>3. Store a key</h3>
              <CodeBlock code="keyshield store openai sk-proj-your-key" label="CLI" />
              <h3 className="text-lg font-medium" style={{ color: '#e0e0e0' }}>4. Use the proxy</h3>
              <CodeBlock code={`curl ${API_BASE}/proxy/openai/v1/models \
  -H "Authorization: Bearer ${token}"`} label="cURL" />
            </div>
          </div>
        );
      case 'concepts':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold" style={{ color: '#707070' }}>Core Concepts</h2>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-[#080808] border" style={{ borderColor: '#141414' }}>
                <h3 className="text-lg font-medium flex items-center gap-2 mb-2" style={{ color: '#e0e0e0' }}><Shield size={18} style={{ color: '#6366f1' }} /> Zero-Trust Architecture</h3>
                <p className="text-sm" style={{ color: '#4a4a4a' }}>KeyShield never stores raw API keys in memory between requests. Keys are AES-256-GCM encrypted at rest and decrypted per-request on the server side.</p>
              </div>
              <div className="p-4 rounded-lg bg-[#080808] border" style={{ borderColor: '#141414' }}>
                <h3 className="text-lg font-medium flex items-center gap-2 mb-2" style={{ color: '#e0e0e0' }}><Key size={18} style={{ color: '#6366f1' }} /> Vault</h3>
                <p className="text-sm" style={{ color: '#4a4a4a' }}>The vault stores API keys, passwords, notes, and SSH keys. Each entry is encrypted with a key derived from your wallet signature.</p>
              </div>
              <div className="p-4 rounded-lg bg-[#080808] border" style={{ borderColor: '#141414' }}>
                <h3 className="text-lg font-medium flex items-center gap-2 mb-2" style={{ color: '#e0e0e0' }}><Bot size={18} style={{ color: '#6366f1' }} /> Agents</h3>
                <p className="text-sm" style={{ color: '#4a4a4a' }}>Agents are AI identities with scoped API access. Each agent has its own keypair and can be independently revoked.</p>
              </div>
            </div>
          </div>
        );
      case 'agents':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold" style={{ color: '#707070' }}>Agent Setup</h2>
            <p className="text-sm" style={{ color: '#4a4a4a' }}>Register AI agents for scoped API access.</p>
            <CodeBlock code={`keyshield agent register --name "Trading Bot"
# Returns agent_id and pubkey`} label="CLI" />
            <CodeBlock code={`from keyshield_sdk import KeyShield
ks = KeyShield(token="your-session-token")
client = ks.openai_client()  # uses agent's scoped access`} label="Python" />
          </div>
        );
      case 'sdk':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold" style={{ color: '#707070' }}>Python SDK</h2>
            <CodeBlock code="pip install keyshield-sdk" label="Install" />
            <CodeBlock code={`from keyshield_sdk import KeyShield

# Initialize
ks = KeyShield(token=os.environ["KS_TOKEN"])

# Get a proxied OpenAI client
client = ks.openai_client()
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}]
)

# Get a proxied Anthropic client
anthropic = ks.anthropic_client()`} label="Usage" />
          </div>
        );
      case 'cli':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold" style={{ color: '#707070' }}>CLI Reference</h2>
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
                <div key={i} className="p-3 rounded-lg bg-[#0a0a0a] border" style={{ borderColor: '#141414' }}>
                  <code className="text-sm font-mono" style={{ color: '#e0e0e0' }}>{c.cmd}</code>
                  <p className="text-xs mt-1" style={{ color: '#333' }}>{c.desc}</p>
                </div>
              ))}
            </div>
          </div>
        );
      case 'billing':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold" style={{ color: '#707070' }}>Billing & x402 & MPP</h2>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-[#080808] border" style={{ borderColor: '#141414' }}>
                <h3 className="text-lg font-medium flex items-center gap-2 mb-2" style={{ color: '#e0e0e0' }}><DollarSign size={18} style={{ color: '#6366f1' }} /> Billing</h3>
                <p className="text-sm" style={{ color: '#4a4a4a' }}>Track usage and spend across all proxied API calls. SOL and USD balances shown in the Activity page.</p>
              </div>
              <div className="p-4 rounded-lg bg-[#080808] border" style={{ borderColor: '#141414' }}>
                <h3 className="text-lg font-medium flex items-center gap-2 mb-2" style={{ color: '#e0e0e0' }}><Zap size={18} style={{ color: '#6366f1' }} /> x402 Auto-Pay</h3>
                <p className="text-sm" style={{ color: '#4a4a4a' }}>x402 is the micropayment protocol for AI agent payments. Configure trusted domains and thresholds in Settings.</p>
              </div>
              <div className="p-4 rounded-lg bg-[#080808] border" style={{ borderColor: '#141414' }}>
                <h3 className="text-lg font-medium flex items-center gap-2 mb-2" style={{ color: '#e0e0e0' }}><Activity size={18} style={{ color: '#6366f1' }} /> MPP Streams</h3>
                <p className="text-sm" style={{ color: '#4a4a4a' }}>Multi-Party Payment streams enable agents to make micro-payments per API call. Open a stream with a SOL deposit.</p>
              </div>
            </div>
          </div>
        );
      case 'security':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold" style={{ color: '#707070' }}>Security</h2>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-[#080808] border" style={{ borderColor: '#141414' }}>
                <h3 className="text-lg font-medium flex items-center gap-2 mb-2" style={{ color: '#e0e0e0' }}><Lock size={18} style={{ color: '#6366f1' }} /> Encryption</h3>
                <p className="text-sm" style={{ color: '#4a4a4a' }}>All vault entries are encrypted with AES-256-GCM. The encryption key is derived from your wallet signature via HKDF-SHA256.</p>
              </div>
              <div className="p-4 rounded-lg bg-[#080808] border" style={{ borderColor: '#141414' }}>
                <h3 className="text-lg font-medium flex items-center gap-2 mb-2" style={{ color: '#e0e0e0' }}><Shield size={18} style={{ color: '#6366f1' }} /> Passkey Auth</h3>
                <p className="text-sm" style={{ color: '#4a4a4a' }}>WebAuthn passkeys with PRF extension for zero-knowledge vault unlock. No password stored on any server.</p>
              </div>
            </div>
          </div>
        );
      case 'troubleshoot':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold" style={{ color: '#707070' }}>Troubleshooting</h2>
            <div className="space-y-3">
              {[
                { q: '401 Unauthorized', a: 'Your session token has expired. Re-authenticate with your wallet.' },
                { q: 'Key not found', a: 'The vault key ID does not exist. Check your vault entries.' },
                { q: 'Wallet not detected', a: 'Install Phantom or Solflare browser extension.' },
                { q: 'MPP stream failed', a: 'Ensure sufficient SOL deposit and correct PDA derivation.' },
              ].map((item, i) => (
                <div key={i} className="p-4 rounded-lg bg-[#080808] border" style={{ borderColor: '#141414' }}>
                  <h4 className="font-medium mb-1" style={{ color: '#e0e0e0' }}>{item.q}</h4>
                  <p className="text-sm" style={{ color: '#4a4a4a' }}>{item.a}</p>
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
          <h1 style={{ color: '#707070' }}>Documentation</h1>
          <p className="page-header-subtitle">KeyShield {VERSION} · built {BUILD_DATE}</p>
        </div>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-[#a5b4fc] hover:text-white transition-colors">
          GitHub <ExternalLink size={14} />
        </a>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 hidden md:block">
          <div className="sticky top-20 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-[#666] px-3 mb-2">Documentation</div>
            {CHAPTERS.map(ch => (
              <button
                key={ch.id}
                onClick={() => setActiveChapter(ch.id)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] text-left transition-colors ${
                  activeChapter === ch.id
                    ? 'bg-white/10 text-white'
                    : 'text-[#888] hover:text-white hover:bg-white/5'
                }`}
              >
                {ch.icon}
                <span>{ch.title}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="rounded-xl border p-6 bg-[#080808]" style={{ borderColor: '#0f0f0f' }}>
            {renderChapter()}
          </div>
        </div>
      </div>
    </div>
  );
}
