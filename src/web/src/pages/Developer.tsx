import { useState, useRef, useEffect } from 'react';
import { Code, Terminal, Book, ExternalLink, Eye, EyeOff, RotateCw, Copy, Check, Zap, Key, Shield } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger, Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Button } from '@keyshield/ui';
import { getToken, getWalletAddress } from '@keyshield/shared/auth';
import { getApiConfig } from '@keyshield/shared/api';
import { VERSION } from '@keyshield/shared/lib/version';

const TOKEN_PLACEHOLDER = '<TOKEN_HERE>';
const INJECT_AUTOCLEAR_SEC = 30;

const endpoints = [
  { method: 'POST', path: '/manage/store', desc: 'Store a new key in the vault' },
  { method: 'GET', path: '/manage/vault', desc: 'List all vault items' },
  { method: 'GET', path: '/manage/decrypt/{id}', desc: 'Decrypt a vault item' },
  { method: 'DELETE', path: '/manage/vault/{id}', desc: 'Delete a vault item' },
  { method: 'POST', path: '/agents', desc: 'Register a new agent' },
  { method: 'GET', path: '/agents', desc: 'List registered agents' },
  { method: 'DELETE', path: '/agents/{id}', desc: 'Revoke an agent' },
  { method: 'POST', path: '/mpp/open', desc: 'Open an MPP stream' },
  { method: 'POST', path: '/mpp/streams/{id}/settle', desc: 'Settle MPP stream' },
  { method: 'GET', path: '/billing', desc: 'Get billing info' },
  { method: 'GET', path: '/sharing', desc: 'List shares' },
  { method: 'POST', path: '/sharing', desc: 'Grant a share' },
  { method: 'DELETE', path: '/sharing/{id}', desc: 'Revoke a share' },
];

const cliCommands = [
  { cmd: 'keyshield login', desc: 'Authenticate with wallet or passkey' },
  { cmd: 'keyshield store --provider openai --key sk-...', desc: 'Store an API key' },
  { cmd: 'keyshield list', desc: 'List vault items' },
  { cmd: 'keyshield decrypt <id>', desc: 'Decrypt a key to stdout' },
  { cmd: 'keyshield agent register --name bot', desc: 'Register an agent' },
  { cmd: 'keyshield proxy --port 8080', desc: 'Start local proxy server' },
];

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative p-4 rounded-lg bg-[#0a0a0a] border font-mono text-sm" style={{ borderColor: '#141414', color: '#e0e0e0' }}>
      {label && <p className="text-xs mb-2" style={{ color: '#333' }}>{label}</p>}
      <pre className="whitespace-pre-wrap break-all">{code}</pre>
      <button onClick={handleCopy} className="absolute top-3 right-3 p-1.5 rounded bg-[#141414] hover:bg-[#1a1a1a] transition-colors">
        {copied ? <Check size={14} className="text-[#34d399]" /> : <Copy size={14} style={{ color: '#4a4a4a' }} />}
      </button>
    </div>
  );
}

export default function Developer() {
  const token = getToken() ?? '';
  const wallet = getWalletAddress() ?? 'YOUR_WALLET';
  const [injectedAt, setInjectedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const tickRef = useRef<number | null>(null);
  const apiConfig = getApiConfig();
  const API_BASE = apiConfig.baseUrl;

  useEffect(() => {
    if (!injectedAt) return;
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - injectedAt) / 1000);
      if (elapsed >= INJECT_AUTOCLEAR_SEC) {
        setInjectedAt(null);
        if (tickRef.current) window.clearInterval(tickRef.current);
      } else {
        setTick(t => t + 1);
      }
    }, 1000);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, [injectedAt]);

  const t = injectedAt && token ? token : TOKEN_PLACEHOLDER;
  const secLeft = injectedAt ? Math.max(0, INJECT_AUTOCLEAR_SEC - Math.floor((Date.now() - injectedAt) / 1000)) : 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ color: '#707070' }}>Developer</h1>
          <p className="page-header-subtitle">API reference, CLI usage, and SDK documentation</p>
        </div>
      </div>

      {/* Token injection */}
      <Card className="border-[#0f0f0f] shadow-sm bg-[#080808] mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield size={20} style={{ color: '#6366f1' }} />
              <div>
                <p className="text-sm font-medium" style={{ color: '#e0e0e0' }}>Session Token</p>
                <p className="font-mono text-xs" style={{ color: '#4a4a4a' }}>{token ? `${token.slice(0, 12)}…` : 'Not authenticated'}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setInjectedAt(Date.now())} disabled={!token}>
                <Eye className="h-4 w-4 mr-1.5" /> Inject into Snippets
              </Button>
              {injectedAt && (
                <Badge variant="secondary" style={{ color: '#f59e0b' }}>Auto-clears in {secLeft}s</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="api">
        <TabsList className="mb-6">
          <TabsTrigger value="api">API Reference</TabsTrigger>
          <TabsTrigger value="cli">CLI Usage</TabsTrigger>
          <TabsTrigger value="sdk">SDK</TabsTrigger>
          <TabsTrigger value="examples">Examples</TabsTrigger>
        </TabsList>

        <TabsContent value="api">
          <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
            <CardHeader><CardTitle style={{ color: '#707070' }}>API Endpoints</CardTitle><CardDescription>All KeyShield API endpoints</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#4a4a4a' }}>Method</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#4a4a4a' }}>Endpoint</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#4a4a4a' }}>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {endpoints.map((ep, i) => (
                    <TableRow key={i}>
                      <TableCell><Badge variant={ep.method === 'GET' ? 'success' : ep.method === 'POST' ? 'default' : 'destructive'} className="w-16 text-center">{ep.method}</Badge></TableCell>
                      <TableCell><code className="text-xs font-mono bg-[#0a0a0a] px-2 py-0.5 rounded" style={{ color: '#e0e0e0', borderColor: '#141414', borderWidth: '1px' }}>{ep.path}</code></TableCell>
                      <TableCell className="text-sm" style={{ color: '#333' }}>{ep.desc}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cli">
          <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
            <CardHeader><CardTitle style={{ color: '#707070' }}>CLI Commands</CardTitle><CardDescription>Install with: npm install -g @keyshield/cli</CardDescription></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {cliCommands.map((c, i) => (
                  <div key={i} className="p-3 rounded-lg bg-[#0a0a0a] border" style={{ borderColor: '#141414' }}>
                    <code className="text-sm font-mono" style={{ color: '#e0e0e0' }}>{c.cmd}</code>
                    <p className="text-xs mt-1" style={{ color: '#333' }}>{c.desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sdk">
          <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
            <CardHeader><CardTitle style={{ color: '#707070' }}>SDK Integration</CardTitle><CardDescription>Use the KeyShield SDK in your applications</CardDescription></CardHeader>
            <CardContent>
              <div className="space-y-4">
                <CodeBlock code="npm install @keyshield/sdk" label="Install" />
                <CodeBlock code={`import { KeyShield } from '@keyshield/sdk';

const ks = new KeyShield({ apiKey: '${t}' });
const proxy = await ks.proxy('openai');
const response = await fetch(proxy.url, { ... });`} label="Usage" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="examples">
          <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
            <CardHeader><CardTitle style={{ color: '#707070' }}>Examples</CardTitle><CardDescription>Real-world usage patterns</CardDescription></CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2" style={{ color: '#e0e0e0' }}><Key size={14} /> Proxy API Call</h4>
                  <CodeBlock code={`curl -sS ${API_BASE}/proxy/openai/v1/models \
  -H "Authorization: Bearer ${t}"`} label="cURL" />
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2" style={{ color: '#e0e0e0' }}><Zap size={14} /> Python SDK</h4>
                  <CodeBlock code={`from keyshield_sdk import KeyShield

ks = KeyShield(token="${t}")
client = ks.openai_client()
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}]
)`} label="Python" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
