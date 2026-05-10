import { useState, useRef, useEffect } from 'react';
import { Code, Terminal, Eye, Copy, Check, Zap, Key, Shield } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger, Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Button } from '@keyshield/ui';
import { getToken } from '@keyshield/shared/auth';
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
    <div className="relative p-4 rounded-xl bg-[#080808] border font-mono text-sm" style={{ borderColor: '#141418' }}>
      {label && <p className="text-xs mb-2" style={{ color: '#6b6b7a' }}>{label}</p>}
      <pre className="whitespace-pre-wrap break-all" style={{ color: '#e0e0e0' }}>{code}</pre>
      <button onClick={handleCopy} className="absolute top-3 right-3 p-1.5 rounded-lg bg-[#141418] hover:bg-[#1e1e24] transition-colors">
        {copied ? <Check size={14} className="text-[#10b981]" /> : <Copy size={14} style={{ color: '#6b6b7a' }} />}
      </button>
    </div>
  );
}

export default function Developer() {
  const token = getToken() ?? '';
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
          <h1>Developer</h1>
          <p className="page-header-subtitle">API reference, CLI commands, and integration examples</p>
        </div>
      </div>

      {/* Token injection */}
      <div className="ks-card mb-6">
        <div className="ks-card-content">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Shield size={20} style={{ color: '#6366f1' }} />
              <div>
                <p className="text-sm font-medium text-white">Session Token</p>
                <p className="font-mono text-xs" style={{ color: '#6b6b7a' }}>{token ? `${token.slice(0, 12)}\u2026` : 'Not authenticated'}</p>
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
        </div>
      </div>

      <Tabs defaultValue="api">
        <TabsList className="mb-6">
          <TabsTrigger value="api">API Reference</TabsTrigger>
          <TabsTrigger value="cli">CLI Usage</TabsTrigger>
          <TabsTrigger value="examples">Examples</TabsTrigger>
        </TabsList>

        <TabsContent value="api">
          <div className="ks-card">
            <div className="ks-card-content" style={{ padding: 0 }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Method</TableHead>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {endpoints.map((ep, i) => (
                    <TableRow key={i}>
                      <TableCell><Badge variant={ep.method === 'GET' ? 'success' : ep.method === 'POST' ? 'default' : 'destructive'} className="w-16 text-center">{ep.method}</Badge></TableCell>
                      <TableCell><code className="text-xs font-mono bg-[#080808] px-2 py-0.5 rounded" style={{ color: '#e0e0e0', borderColor: '#141418', borderWidth: '1px' }}>{ep.path}</code></TableCell>
                      <TableCell className="text-sm" style={{ color: '#6b6b7a' }}>{ep.desc}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="cli">
          <div className="ks-card">
            <div className="ks-card-header">
              <div className="ks-card-title">CLI Commands</div>
              <p className="ks-card-description">Install with: npm install -g @keyshield/cli</p>
            </div>
            <div className="ks-card-content">
              <div className="space-y-2">
                {cliCommands.map((c, i) => (
                  <div key={i} className="p-3 rounded-xl bg-[#080808] border" style={{ borderColor: '#141418' }}>
                    <code className="text-sm font-mono" style={{ color: '#e0e0e0' }}>{c.cmd}</code>
                    <p className="text-xs mt-1" style={{ color: '#6b6b7a' }}>{c.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="examples">
          <div className="ks-card">
            <div className="ks-card-content">
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2 text-white"><Key size={14} /> Proxy API Call</h4>
                  <CodeBlock code={`curl -sS ${API_BASE}/proxy/openai/v1/models \\\\\n  -H "Authorization: Bearer ${t}`} label="cURL" />
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2 text-white"><Zap size={14} /> Python SDK</h4>
                  <CodeBlock code={`from keyshield_sdk import KeyShield\n\nks = KeyShield(token="${t}")\nclient = ks.openai_client()\nresponse = client.chat.completions.create(\n    model="gpt-4o",\n    messages=[{"role": "user", "content": "Hello"}]\n)`} label="Python" />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
