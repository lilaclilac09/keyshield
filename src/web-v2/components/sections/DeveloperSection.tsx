import React, { useState } from 'react';
import { Terminal, Eye, EyeOff, RotateCw } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { RevealField } from '../ui/RevealField';
import { CodeBlock } from '../ui/CodeBlock';
import { API_BASE, apiFetch, getToken, getWalletAddress, clearAuth, clearPasskeyTrust, notifyAuthChanged } from '../../lib/auth';

export const DeveloperSection: React.FC = () => {
  const token = getToken() ?? '';
  const wallet = getWalletAddress() ?? 'YOUR_WALLET';
  const [injectedAt, setInjectedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  React.useEffect(() => {
    if (!injectedAt) return;
    const id = window.setInterval(() => { const elapsed = Math.floor((Date.now() - injectedAt) / 1000); if (elapsed >= 30) { setInjectedAt(null); window.clearInterval(id); } else { setTick(t => t + 1); } }, 1000);
    return () => window.clearInterval(id);
  }, [injectedAt]);

  const t = injectedAt && token ? token : '<TOKEN_HERE>';
  const onRotate = async () => { try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {} clearAuth(); clearPasskeyTrust(); notifyAuthChanged(); };

  return (
    <div className="space-y-6">
      <Card title="Session Token" description="Use as Bearer in API/CLI calls. Valid 24h." headerRight={<Button variant="destructive" size="sm" onClick={onRotate}><RotateCw size={11} />Rotate</Button>}>
        <RevealField value={token} label="Session token" autoHideSec={30} />
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /><span className="text-[11px] text-zinc-500">Wallet: <span className="font-mono text-zinc-400">{wallet.length > 16 ? `${wallet.slice(0,8)}\u2026${wallet.slice(-6)}` : wallet}</span></span></div>
          <Button variant={injectedAt ? 'warning' : 'ghost'} size="sm" onClick={() => setInjectedAt(injectedAt ? null : Date.now())}>{injectedAt ? <EyeOff size={11} /> : <Eye size={11} />}{injectedAt ? `Injected \xb7 clears in ${30 - Math.floor((Date.now() - injectedAt) / 1000)}s` : 'Inject token into snippets'}</Button>
        </div>
      </Card>

      <Card title="CLI \u2014 keyshield-cli.sh" headerRight={<a href={`${API_BASE}/static/keyshield-cli.sh`} download className="text-[11px] text-zinc-500 hover:text-white">Download \u2192</a>}>
        <div className="space-y-3">
          <div><p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">Login & Store</p><CodeBlock code={`bash keyshield-cli.sh login <wallet-address> <passphrase>\nbash keyshield-cli.sh store openai sk-proj-your-openai-key`} /></div>
          <div><p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">Proxy a request</p><CodeBlock code={`curl -sS ${API_BASE}/proxy/openai/v1/models \\\n  -H "Authorization: Bearer ${t}"`} /></div>
          <div><p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">REST \u2014 store & list</p><CodeBlock code={`curl -sS -X POST ${API_BASE}/manage/store \\\n  -H "Authorization: Bearer ${t}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"upstream":"openai","apiKey":"sk-proj-your-key"}'`} /></div>
        </div>
      </Card>

      <Card title="Python SDK" headerRight={<a href={`${API_BASE}/static/keyshield_sdk.py`} download className="text-[11px] text-zinc-500 hover:text-white">Download \u2192</a>}>
        <CodeBlock code={`from keyshield_sdk import KeyShield\nks = KeyShield(token="${t}")\n\n# Store a key\nks.store("anthropic", "sk-ant-your-key")\n\n# Call Anthropic through the zero-trust proxy\nimport anthropic\nclient = anthropic.Anthropic(\n    base_url=ks.proxy_url("anthropic"),\n    api_key="placeholder",\n)\nmsg = client.messages.create(\n    model="claude-opus-4-5",\n    max_tokens=256,\n    messages=[{"role": "user", "content": "Hello"}],\n)\nprint(msg.content[0].text)`} />
      </Card>

      <Card title="Endpoint Reference">
        <div className="space-y-1.5">
          {[
            { m: 'POST', p: '/auth/login', d: 'userId + password \u2192 token' },
            { m: 'GET', p: '/auth/wallet-challenge', d: 'Get one-time signing challenge' },
            { m: 'POST', p: '/auth/wallet-login', d: 'Submit signature + passphrase \u2192 token' },
            { m: 'POST', p: '/auth/logout', d: 'Revoke current session' },
            { m: 'GET', p: '/manage/list', d: 'List stored upstream keys' },
            { m: 'POST', p: '/manage/store', d: 'Encrypt & store an API key' },
            { m: 'GET', p: '/manage/decrypt/{upstream}', d: 'Decrypt a stored key' },
            { m: 'DELETE', p: '/manage/secret/{upstream}', d: 'Delete a stored key' },
            { m: 'POST', p: '/proxy/{upstream}/{path}', d: 'Zero-trust API proxy' },
            { m: 'GET', p: '/agents/list', d: 'List registered agents' },
            { m: 'POST', p: '/agents/register', d: 'Register an ed25519 pubkey' },
            { m: 'DELETE', p: '/agents/{id}', d: 'Revoke agent' },
            { m: 'GET', p: '/health', d: 'Server + cache status' },
          ].map(({ m, p, d }) => (
            <div key={`${m}-${p}`} className="flex items-start gap-3 px-3 py-2 rounded-[2px] hover:bg-white/[0.02] transition-colors">
              <span className={`shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded border mt-0.5 ${m === 'GET' ? 'bg-emerald-950/40 border-emerald-900/50 text-emerald-400' : m === 'POST' ? 'bg-blue-950/40 border-blue-900/50 text-blue-400' : 'bg-red-950/40 border-red-900/50 text-red-400'}`}>{m}</span>
              <div className="flex-1 min-w-0"><code className="text-[12px] font-mono text-zinc-200">{p}</code><p className="text-[11px] text-zinc-500 mt-0.5">{d}</p></div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
