import React, { useEffect, useRef, useState } from 'react';
import { Terminal, ChevronRight, ExternalLink, Eye, EyeOff, RotateCw } from 'lucide-react';
import { API_BASE, apiFetch, clearAuth, clearPasskeyTrust, getToken, getWalletAddress, notifyAuthChanged } from '../../lib/auth';
import { CodeBlock } from '../ui/CodeBlock';
import { RevealField } from '../ui/RevealField';
import { ConfirmButton } from '../ui/ConfirmButton';

const TOKEN_PLACEHOLDER = '<TOKEN_HERE>';
const INJECT_AUTOCLEAR_SEC = 30;

export const DeveloperSection: React.FC = () => {
  const token  = getToken() ?? '';
  const wallet = getWalletAddress() ?? 'YOUR_WALLET';
  const [injectedAt, setInjectedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const tickRef = useRef<number | null>(null);

  // Auto-clear the injected token from snippets after INJECT_AUTOCLEAR_SEC.
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
  const _useTick = tick; void _useTick;

  const cliStore = `# Real CLI: subcommand syntax (see v2-mvp/keyshield-cli.sh)
bash keyshield-cli.sh login <wallet-address> <passphrase>
bash keyshield-cli.sh store openai sk-proj-your-openai-key`;

  const cliProxy = `# Use as drop-in base URL for any OpenAI SDK call
curl -sS ${API_BASE}/proxy/openai/v1/models \\
  -H "Authorization: Bearer ${t}"`;

  const pySnippet = `from keyshield_sdk import KeyShield
ks = KeyShield(token="${t}")

# Store a key
ks.store("anthropic", "sk-ant-your-key")

# Call Anthropic through the zero-trust proxy
import anthropic
client = anthropic.Anthropic(
    base_url=ks.proxy_url("anthropic"),
    api_key="placeholder",          # key injected server-side
)
msg = client.messages.create(
    model="claude-opus-4-5",
    max_tokens=256,
    messages=[{"role": "user", "content": "Hello"}],
)
print(msg.content[0].text)`;

  const tsSnippet = `import { KeyShield, KeyShieldAnthropic } from './keyshield-sdk';
const ks = new KeyShield({ token: '${t}' });

const client = new KeyShieldAnthropic(ks);
const resp = await client.messages.create({
  model: 'claude-opus-4-5',
  max_tokens: 256,
  messages: [{ role: 'user', content: 'Hello' }],
});
console.log(resp.content[0].text);`;

  const curlStore = `curl -sS -X POST ${API_BASE}/manage/store \\
  -H "Authorization: Bearer ${t}" \\
  -H "Content-Type: application/json" \\
  -d '{"upstream":"openai","apiKey":"sk-proj-your-key"}'`;

  const curlList = `curl -sS ${API_BASE}/manage/list \\
  -H "Authorization: Bearer ${t}"`;

  const onRotate = async () => {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {}
    clearAuth();
    clearPasskeyTrust();
    notifyAuthChanged();
  };

  return (
    <div className="space-y-6">
      {/* Session token — masked + reveal + rotate */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[14px] font-medium text-white">Session token</h3>
          <ConfirmButton
            variant="destructive"
            onConfirm={onRotate}
            confirmLabel="Confirm rotate"
            title="Rotate (logs out everywhere on this browser; cascades to agents using this token)"
            className="h-7 px-2 rounded-md text-[11px] flex items-center gap-1"
          >
            <RotateCw size={11} />
            Rotate
          </ConfirmButton>
        </div>
        <p className="text-[12px] text-zinc-500 mb-3">
          Use as <code className="text-[#5b8cff]">Bearer</code> in API/CLI calls. Valid 24h. Token is masked by default — click <em>Reveal</em> to expose for 30s.
        </p>
        <RevealField value={token} autoHideSec={30} />
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[11px] text-zinc-500">
              Wallet: <span className="font-mono text-zinc-400">{wallet.length > 16 ? `${wallet.slice(0,8)}…${wallet.slice(-6)}` : wallet}</span>
            </span>
          </div>
          <button
            onClick={() => setInjectedAt(injectedAt ? null : Date.now())}
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-colors ${
              injectedAt
                ? 'border-amber-700 bg-amber-950/40 text-amber-300'
                : 'border-[#1c2238] bg-[#070912] text-zinc-400 hover:text-white'
            }`}
            disabled={!token}
            title={token ? 'Inject live token into snippets below (auto-clears after 30s)' : 'Log in to enable'}
          >
            {injectedAt ? <EyeOff size={11} /> : <Eye size={11} />}
            {injectedAt ? `Injected · clears in ${secLeft}s` : 'Inject token into snippets'}
          </button>
        </div>
      </div>

      {/* CLI */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Terminal size={14} className="text-[#5b8cff]" />
          <h3 className="text-[14px] font-medium text-white">CLI — keyshield-cli.sh</h3>
          <a
            href={`${API_BASE}/static/keyshield-cli.sh`}
            download
            className="ml-auto flex items-center gap-1 text-[11px] text-zinc-500 hover:text-white transition-colors"
          >
            <ExternalLink size={11} /> Download
          </a>
        </div>

        <div className="space-y-1">
          <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Login &amp; store</p>
          <CodeBlock code={cliStore} />
        </div>
        <div className="space-y-1">
          <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Proxy a request</p>
          <CodeBlock code={cliProxy} />
        </div>
        <div className="space-y-1">
          <p className="text-[11px] text-zinc-500 uppercase tracking-wider">REST — store &amp; list</p>
          <CodeBlock code={curlStore} />
          <CodeBlock code={curlList} />
        </div>
      </div>

      {/* Python SDK */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <ChevronRight size={14} className="text-yellow-400" />
          <h3 className="text-[14px] font-medium text-white">Python SDK</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">keyshield_sdk.py</span>
          <a
            href={`${API_BASE}/static/keyshield_sdk.py`}
            download
            className="ml-auto flex items-center gap-1 text-[11px] text-zinc-500 hover:text-white transition-colors"
          >
            <ExternalLink size={11} /> Download
          </a>
        </div>
        <CodeBlock code={pySnippet} />
      </div>

      {/* TypeScript SDK */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <ChevronRight size={14} className="text-blue-400" />
          <h3 className="text-[14px] font-medium text-white">TypeScript SDK</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-400/10 text-blue-400 border border-blue-400/20">keyshield-sdk.ts</span>
          <a
            href={`${API_BASE}/static/keyshield-sdk.ts`}
            download
            className="ml-auto flex items-center gap-1 text-[11px] text-zinc-500 hover:text-white transition-colors"
          >
            <ExternalLink size={11} /> Download
          </a>
        </div>
        <CodeBlock code={tsSnippet} />
      </div>

      {/* Endpoints reference */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5">
        <h3 className="text-[14px] font-medium text-white mb-3">Endpoint reference</h3>
        <div className="space-y-1.5">
          {[
            { m: 'POST',   p: '/auth/login',                     d: 'userId + password → token' },
            { m: 'GET',    p: '/auth/wallet-challenge',          d: 'Get one-time signing challenge' },
            { m: 'POST',   p: '/auth/wallet-login',              d: 'Submit signature + passphrase → token' },
            { m: 'GET',    p: '/auth/agent-challenge',           d: 'Per-agent challenge nonce' },
            { m: 'POST',   p: '/auth/agent-login',               d: 'Agent ed25519 signature → scoped token' },
            { m: 'POST',   p: '/auth/logout',                    d: 'Revoke current session' },
            { m: 'GET',    p: '/sessions/list',                  d: 'List all sessions for the current user' },
            { m: 'POST',   p: '/sessions/{token_id}/revoke',     d: 'Revoke any of your sessions by token_id' },
            { m: 'GET',    p: '/manage/list',                    d: 'List stored upstream keys' },
            { m: 'POST',   p: '/manage/store',                   d: 'Encrypt & store an API key' },
            { m: 'GET',    p: '/manage/decrypt/{upstream}',      d: 'Decrypt a stored key (full-scope only)' },
            { m: 'DELETE', p: '/manage/secret/{upstream}',       d: 'Delete a stored key (full-scope only)' },
            { m: 'POST',   p: '/proxy/{upstream}/{path}',        d: 'Zero-trust API proxy — returns x-ks-key-type header' },
            { m: 'POST',   p: '/manage/batch',                   d: 'Parallel batch proxy (up to 20)' },
            { m: 'GET',    p: '/agents/list',                    d: 'List registered agents' },
            { m: 'POST',   p: '/agents/register',                d: 'Register an ed25519 pubkey + scopes' },
            { m: 'DELETE', p: '/agents/{id}',                    d: 'Revoke agent (cascades to live tokens)' },
            { m: 'GET',    p: '/usage/stats',                    d: 'Per-upstream call counts, tokens, cost' },
            { m: 'GET',    p: '/usage/history',                  d: 'Recent proxy call log (up to 100)' },
            { m: 'GET',    p: '/billing/balance',                d: 'Prepaid credit balance + total spend' },
            { m: 'POST',   p: '/billing/topup-solana',           d: 'On-chain SOL topup (verified via Helius)' },
            { m: 'POST',   p: '/billing/topup-solana-usdc',      d: 'On-chain USDC topup' },
            { m: 'GET',    p: '/billing/topup-history',          d: 'Past topups' },
            { m: 'GET',    p: '/auth/passkey/register-options',  d: 'WebAuthn registration options' },
            { m: 'POST',   p: '/auth/passkey/register-verify',   d: 'Verify & store passkey' },
            { m: 'GET',    p: '/auth/passkey/auth-options',      d: 'WebAuthn auth challenge' },
            { m: 'POST',   p: '/auth/passkey/auth-verify',       d: 'Verify assertion → token' },
            { m: 'GET',    p: '/health',                         d: 'Server + cache status' },
          ].map(({ m, p, d }) => (
            <div key={`${m}-${p}`} className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-[#070912] transition-colors">
              <span className={`shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded border mt-0.5 ${
                m === 'GET'    ? 'bg-emerald-950/40 border-emerald-900/50 text-emerald-400' :
                m === 'POST'   ? 'bg-blue-950/40 border-blue-900/50 text-blue-400' :
                                 'bg-rose-950/40 border-rose-900/50 text-rose-400'
              }`}>{m}</span>
              <div className="flex-1 min-w-0">
                <code className="text-[12px] font-mono text-zinc-200">{p}</code>
                <p className="text-[11px] text-zinc-500 mt-0.5">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
