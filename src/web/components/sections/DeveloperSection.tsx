import React, { useState } from 'react';
import { Terminal, Eye, EyeOff, RotateCw } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { RevealField } from '../ui/RevealField';
import { CodeBlock } from '../ui/CodeBlock';
import { API_BASE, apiFetch, getToken, getWalletAddress, clearAuth, clearPasskeyTrust, notifyAuthChanged } from '../../lib/auth';
import { OPENROUTER_DEMO_MODEL, OPENROUTER_CHAT_PATH, OPENROUTER_MODEL_URL, fetchOpenRouterStatus, openrouterCurlSnippet, openrouterPythonSnippet, type OpenRouterStatus } from '../../lib/openrouter-interface';
import { frameworkSnippets } from '../../lib/keychain';

export const DeveloperSection: React.FC<{ vaultUpstreams?: string[] }> = ({ vaultUpstreams = [] }) => {
  const token = getToken() ?? '';
  const wallet = getWalletAddress() ?? 'YOUR_WALLET';
  const [injectedAt, setInjectedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [orStatus, setOrStatus] = useState<OpenRouterStatus | null>(null);
  const [agentTok, setAgentTok] = useState<string>('');
  const [agentErr, setAgentErr] = useState<string>('');
  const mintAgentToken = async () => {
    setAgentErr('');
    try {
      const r = await apiFetch('/sessions/proxy-token', { method: 'POST', body: '{}' });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || typeof body.token !== 'string') throw new Error(body.detail || body.error || `HTTP ${r.status}`);
      setAgentTok(body.token);
    } catch (e) {
      setAgentErr(e instanceof Error ? e.message : String(e));
    }
  };

  React.useEffect(() => {
    void fetchOpenRouterStatus().then(setOrStatus).catch(() => {});
    const onOr = () => { void fetchOpenRouterStatus().then(setOrStatus).catch(() => {}); };
    window.addEventListener('ks-openrouter-connected', onOr);
    return () => window.removeEventListener('ks-openrouter-connected', onOr);
  }, []);

  React.useEffect(() => {
    if (!injectedAt) return;
    const id = window.setInterval(() => { const elapsed = Math.floor((Date.now() - injectedAt) / 1000); if (elapsed >= 30) { setInjectedAt(null); window.clearInterval(id); } else { setTick(t => t + 1); } }, 1000);
    return () => window.clearInterval(id);
  }, [injectedAt]);

  const t = agentTok || (injectedAt && token ? token : '<TOKEN_HERE>');
  const onRotate = async () => { try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {} clearAuth(); clearPasskeyTrust(); notifyAuthChanged(); };

  return (
    <div className="space-y-6">
      <Card title="Session Token" description="Your owner session: full vault access, valid 24h. Don't give it to agents. Create a proxy-only agent token below." headerRight={<Button variant="destructive" size="sm" onClick={onRotate}><RotateCw size={11} />Rotate</Button>}>
        <RevealField value={token} label="Session token" autoHideSec={30} />
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /><span className="text-[11px] text-[#8a96c2]">Wallet: <span className="font-mono text-[#a8b3d8]">{wallet.length > 16 ? `${wallet.slice(0,8)}\u2026${wallet.slice(-6)}` : wallet}</span></span></div>
          <Button variant={injectedAt ? 'secondary' : 'ghost'} size="sm" onClick={() => setInjectedAt(injectedAt ? null : Date.now())}>{injectedAt ? <EyeOff size={11} /> : <Eye size={11} />}{injectedAt ? `Injected \xb7 clears in ${30 - Math.floor((Date.now() - injectedAt) / 1000)}s` : 'Inject token into snippets'}</Button>
        </div>
      </Card>

      <Card title="Agent token (proxy-only)" description="For agents and scripts. Works on /proxy and /vproxy; gets 403 on /manage, /sessions and /agents, so it can't read your keys. Revoke it under Sessions.">
        {agentTok ? (
          <RevealField value={agentTok} label="Agent token" autoHideSec={60} />
        ) : (
          <Button variant="secondary" size="sm" onClick={() => void mintAgentToken()} data-testid="mint-agent-token">Create agent token</Button>
        )}
        {agentErr && <p className="mt-2 text-[11px] text-red-400">{agentErr}</p>}
      </Card>

      <Card title="CLI — keyshield-cli.sh" headerRight={<a href={`${API_BASE}/static/keyshield-cli.sh`} download className="text-[11px] text-[#8a96c2] hover:text-white">Download →</a>}>
        <div className="space-y-3">
          <div><p className="text-[11px] text-[#8a96c2] uppercase tracking-wider mb-1">Login & Store</p><CodeBlock code={`bash keyshield-cli.sh login <wallet-address> <passphrase>\nbash keyshield-cli.sh store openai sk-proj-your-openai-key`} /></div>
          <div><p className="text-[11px] text-[#8a96c2] uppercase tracking-wider mb-1">Proxy a request</p><CodeBlock code={`curl -sS ${API_BASE}/proxy/openai/v1/models \\\n  -H "Authorization: Bearer ${t}"`} /></div>
          <div><p className="text-[11px] text-[#8a96c2] uppercase tracking-wider mb-1">REST — store & list</p><CodeBlock code={`curl -sS -X POST ${API_BASE}/manage/store \\\n  -H "Authorization: Bearer ${t}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"upstream":"openai","apiKey":"sk-proj-your-key"}'`} /></div>
        </div>
      </Card>

      <Card title="OpenRouter interface" description={`Inserted from src/web/lib/openrouter-interface.ts + src/backend/proxy/openrouter_interface.py. Model ${OPENROUTER_DEMO_MODEL}.`}>
        <p className="text-[11px] text-[#8a96c2] mb-3">
          {orStatus?.key_configured ? `Key stored (${orStatus.key_prefix}) via Activity → Connect.` : 'Paste a key once in Activity → Connect. Not a public API.'}
          {' '}
          <a href={OPENROUTER_MODEL_URL} target="_blank" rel="noreferrer" className="text-white hover:underline">Model page</a>
        </p>
        <div className="space-y-3">
          <div><p className="text-[11px] text-[#8a96c2] uppercase tracking-wider mb-1">Auto-fill store</p><CodeBlock code={`curl -sS -X POST ${API_BASE}/manage/store \\\n  -H "Authorization: Bearer ${t}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"upstream":"openrouter","apiKey":"sk-or-v1-paste-here"}'`} /></div>
          <div><p className="text-[11px] text-[#8a96c2] uppercase tracking-wider mb-1">Proxy {OPENROUTER_CHAT_PATH}</p><CodeBlock code={openrouterCurlSnippet(t)} /></div>
          <div><p className="text-[11px] text-[#8a96c2] uppercase tracking-wider mb-1">Python interface</p><CodeBlock code={openrouterPythonSnippet(t)} /></div>
        </div>
      </Card>

      <Card title="Every stored API → curl / Python / JS" description="Same session token. Raw keys stay in the vault. Point the SDK base_url at /vproxy/{upstream}.">
        {(vaultUpstreams.length ? vaultUpstreams : ['openrouter', 'openai', 'helius']).map((up) => {
          const snippets = frameworkSnippets(up, t);
          return (
            <div key={up} className="mb-4 last:mb-0">
              <p className="text-[12px] font-semibold text-white uppercase tracking-wider mb-2">{up}</p>
              <div className="space-y-2">
                <CodeBlock code={snippets.curl} />
                <CodeBlock code={snippets.python} />
                <CodeBlock code={snippets.js} />
              </div>
            </div>
          );
        })}
      </Card>

      <Card title="Python SDK" headerRight={<a href={`${API_BASE}/static/keyshield_sdk.py`} download className="text-[11px] text-[#8a96c2] hover:text-white">Download →</a>}>
        <CodeBlock code={`from keyshield_sdk import KeyShield\nks = KeyShield(token="${t}")\n\n# Store a key\nks.store("anthropic", "sk-ant-your-key")\n\n# Call Anthropic through the zero-trust proxy\nimport anthropic\nclient = anthropic.Anthropic(\n    base_url=ks.proxy_url("anthropic"),\n    api_key="placeholder",\n)\nmsg = client.messages.create(\n    model="claude-opus-4-5",\n    max_tokens=256,\n    messages=[{"role": "user", "content": "Hello"}],\n)\nprint(msg.content[0].text)`} />
      </Card>

      <Card title="Endpoint Reference">
        <div className="space-y-1.5">
          {[
            { m: 'POST', p: '/auth/demo-session', d: 'KS_DEMO_MODE owner-signed demo login' },
            { m: 'POST', p: '/auth/login', d: 'userId + password \u2192 token' },
            { m: 'GET', p: '/auth/wallet-challenge', d: 'Get one-time signing challenge' },
            { m: 'POST', p: '/auth/wallet-login', d: 'Submit signature + passphrase \u2192 token' },
            { m: 'POST', p: '/auth/logout', d: 'Revoke current session' },
            { m: 'GET', p: '/manage/vault', d: 'List stored upstream keys' },
            { m: 'POST', p: '/manage/store', d: 'Encrypt & store an API key' },
            { m: 'GET', p: '/manage/decrypt/{id}', d: 'Decrypt a stored key (local shim)' },
            { m: 'DELETE', p: '/manage/vault/{id}', d: 'Delete a stored key' },
            { m: 'GET', p: '/billing/sol-quote', d: 'Pyth SOL quote for Phantom top-up' },
            { m: 'POST', p: '/billing/topup-solana', d: 'Credit after on-chain SOL transfer' },
            { m: 'GET', p: '/mpp/streams/{id}/usage', d: 'Per-stream usage artifacts' },
            { m: 'POST', p: '/proxy/{upstream}/{path}', d: 'Zero-trust API proxy' },
            { m: 'POST', p: '/sessions/proxy-token', d: 'Mint a proxy-only agent token (owner session)' },
            { m: 'GET', p: '/agents/list', d: 'List registered agents' },
            { m: 'POST', p: '/agents/register', d: 'Register an ed25519 pubkey' },
            { m: 'DELETE', p: '/agents/{id}', d: 'Revoke agent' },
            { m: 'GET', p: '/health', d: 'Server + cache status' },
            { m: 'GET', p: '/keychain/home', d: 'Wallet SOL/USDC + stored APIs + connection' },
            { m: 'GET', p: '/keychain/rpc-cache', d: 'Helius TTL table — getSlot 2s lowest' },
            { m: 'POST', p: '/keychain/detect', d: 'Classify a pasted key (prefix only)' },
            { m: 'POST', p: '/keychain/store', d: 'Detect + store without echoing the secret' },
            { m: 'POST', p: '/keychain/call', d: 'One-click probe via stored vault key' },
          ].map(({ m, p, d }) => (
            <div key={`${m}-${p}`} className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.02] transition-colors">
              <span className={`shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded border mt-0.5 ${m === 'GET' ? 'bg-emerald-950/40 border-emerald-900/50 text-emerald-400' : m === 'POST' ? 'bg-blue-950/40 border-blue-900/50 text-blue-400' : 'bg-red-950/40 border-red-900/50 text-red-400'}`}>{m}</span>
              <div className="flex-1 min-w-0"><code className="text-[12px] font-mono text-zinc-200">{p}</code><p className="text-[11px] text-[#8a96c2] mt-0.5">{d}</p></div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
