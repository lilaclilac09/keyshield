import { Code, Terminal, Book, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger, Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@keyshield/ui';

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
  { method: 'POST', path: '/mpp/streams/{id}/close', desc: 'Close MPP stream' },
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

export default function Developer() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ color: '#707070' }}>Developer</h1>
          <p className="page-header-subtitle">API reference, CLI usage, and SDK documentation</p>
        </div>
      </div>

      <Tabs defaultValue="api">
        <TabsList className="mb-6">
          <TabsTrigger value="api">API Reference</TabsTrigger>
          <TabsTrigger value="cli">CLI Usage</TabsTrigger>
          <TabsTrigger value="sdk">SDK</TabsTrigger>
        </TabsList>

        <TabsContent value="api">
          <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
            <CardHeader><CardTitle style={{ color: '#707070' }}>API Endpoints</CardTitle><CardDescription>All KeyShield API endpoints</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>Method</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>Endpoint</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {endpoints.map((ep, i) => (
                    <TableRow key={i}>
                      <TableCell><Badge variant={ep.method === 'GET' ? 'success' : ep.method === 'POST' ? 'default' : 'destructive'} className="w-16 text-center">{ep.method}</Badge></TableCell>
                      <TableCell><code className="text-xs font-mono bg-[#0a0a0a] px-2 py-0.5 rounded" style={{ color: '#707070', borderColor: '#141414', borderWidth: '1px' }}>{ep.path}</code></TableCell>
                      <TableCell className="text-sm" style={{ color: '#505050' }}>{ep.desc}</TableCell>
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
                    <code className="text-sm font-mono" style={{ color: '#707070' }}>{c.cmd}</code>
                    <p className="text-xs mt-1" style={{ color: '#505050' }}>{c.desc}</p>
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
              <div className="p-4 rounded-lg bg-[#0a0a0a] text-sm font-mono space-y-2">
                <p><span style={{ color: '#505050' }}>// Install</span></p>
                <p style={{ color: '#707070' }}>npm install @keyshield/sdk</p>
                <p className="mt-4" style={{ color: '#505050' }}>// Usage</p>
                <p style={{ color: '#707070' }}>import &#123; KeyShield &#125; from '@keyshield/sdk';</p>
                <p style={{ color: '#707070' }}>const ks = new KeyShield(&#123; apiKey: 'your-key' &#125;);</p>
                <p style={{ color: '#707070' }}>const proxy = await ks.proxy('openai');</p>
                <p style={{ color: '#707070' }}>const response = await fetch(proxy.url, &#123; ... &#125;);</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
