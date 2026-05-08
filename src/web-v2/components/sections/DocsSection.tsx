import React from 'react';
import { Rocket, Shield, Bot, Code2, Terminal, CreditCard, Lock, AlertCircle, Zap, Key, DollarSign, FileText, ArrowRight } from 'lucide-react';
import { Card } from './ui/Card';
import { CodeBlock } from './ui/CodeBlock';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { API_BASE } from '../lib/auth';
import { VERSION, BUILD_DATE, REPO_URL } from '../lib/version';

export const DocsSection: React.FC = () => {
  const installCmd = `curl -fsSL ${API_BASE}/install.sh | bash`;

  return (
    <div className="space-y-8">
      {/* Quickstart */}
      <div>
        <div className="flex items-center gap-2 text-[11px] text-white mb-1"><Rocket size={12} />CHAPTER 1</div>
        <h2 className="text-[24px] font-bold text-white uppercase tracking-wider">Quickstart</h2>
        <p className="text-[14px] text-zinc-400 mt-1">From zero to first agent call in under a minute.</p>
      </div>

      <Card variant="bordered">
        <div className="flex items-center gap-2 text-white mb-3"><Zap size={14} /><span className="text-[13px] font-semibold uppercase tracking-wider">Run this in your terminal</span></div>
        <div className="flex items-center gap-2 px-4 py-3 rounded-[2px] bg-[#050505] border border-zinc-800"><code className="flex-1 text-[13px] font-mono text-zinc-200 break-all">{installCmd}</code><Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(installCmd)}>Copy</Button></div>
        <p className="text-[11px] text-zinc-500 mt-3">The installer creates a Python venv, downloads the SDK, generates an ed25519 keypair for the agent, and writes a ready-to-use <code className="text-white">.env</code> file.</p>
      </Card>

      {/* Core concepts */}
      <div>
        <div className="flex items-center gap-2 text-[11px] text-white mb-1"><Shield size={12} />CHAPTER 2</div>
        <h2 className="text-[24px] font-bold text-white uppercase tracking-wider">Core Concepts</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><div className="flex items-center gap-2 mb-2"><Key size={16} className="text-white" /><span className="text-[14px] font-medium text-white">Vault</span></div><p className="text-[12px] text-zinc-400 leading-relaxed">Your API keys, encrypted with AES-256-GCM. The decryption key never leaves your machine.</p></Card>
        <Card><div className="flex items-center gap-2 mb-2"><Shield size={16} className="text-emerald-400" /><span className="text-[14px] font-medium text-white">Proxy</span></div><p className="text-[12px] text-zinc-400 leading-relaxed">A request hits /proxy/{upstream}/. The server decrypts your key in memory, injects it, and forwards. The agent never sees the plaintext.</p></Card>
        <Card><div className="flex items-center gap-2 mb-2"><Bot size={16} className="text-zinc-400" /><span className="text-[14px] font-medium text-white">Agent</span></div><p className="text-[12px] text-zinc-400 leading-relaxed">A programmatic identity with its own ed25519 keypair. You register the pubkey once. The agent self-authenticates by signing a server challenge.</p></Card>
      </div>

      {/* Performance */}
      <Card variant="bordered">
        <div className="flex items-center gap-2 mb-2"><Zap size={14} className="text-emerald-400" /><span className="text-[14px] font-medium text-white">Lower latency \u2014 up to 10x faster than direct API calls</span></div>
        <p className="text-[12px] text-zinc-400 leading-relaxed">Going through KeyShield is <strong className="text-white">faster</strong>, not slower. Three reasons:</p>
        <ul className="space-y-1.5 mt-3">
          <li className="text-[12px] text-zinc-400 flex items-start gap-2"><span className="text-emerald-400 mt-1">&#x2713;</span><span><strong className="text-white">Warm HTTP/2 connection pool</strong> \u2014 KeyShield keeps persistent sessions to every upstream. Your call skips DNS + TLS handshake (~150\u2013300ms saved on cold starts).</span></li>
          <li className="text-[12px] text-zinc-400 flex items-start gap-2"><span className="text-emerald-400 mt-1">&#x2713;</span><span><strong className="text-white">Concurrent batch fan-out</strong> \u2014 <code className="text-white">batch(requests)</code> dispatches up to 20 calls in parallel via <code className="text-white">asyncio.gather</code>. A 20-prompt workload returns in the latency of one call.</span></li>
          <li className="text-[12px] text-zinc-400 flex items-start gap-2"><span className="text-emerald-400 mt-1">&#x2713;</span><span><strong className="text-white">MPP skips x402 round-trips</strong> \u2014 once a stream is open, calls go straight upstream with no per-call 402 negotiation. Saves ~200ms.</span></li>
        </ul>
      </Card>

      {/* Agent setup */}
      <div>
        <div className="flex items-center gap-2 text-[11px] text-white mb-1"><Bot size={12} />CHAPTER 3</div>
        <h2 className="text-[24px] font-bold text-white uppercase tracking-wider">Agent Setup</h2>
      </div>

      <Card><pre className="text-[11px] font-mono text-zinc-400 leading-relaxed">{`\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510     1. GET /auth/agent-challenge        \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\n\u2502        \u2502 \u25c0\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  \u2502          \u2502\n\u2502 AGENT  \u2502     {challenge, nonce}                  \u2502 KEYSHIELD  \u2502\n\u2502  with  \u2502                                             \u2502            \u2502\n\u2502 ed25519\u2502 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u25b6  \u2502  + DB      \u2502\n\u2502 keypair\u2502     POST /auth/agent-login                \u2502            \u2502\n\u2502        \u2502     {ownerWallet, agentPubkey, sig}     \u2502   verify   \u2502\n\u2502        \u2502     3. lookup delegation                 \u2502   sig &    \u2502\n\u2502        \u2502     \u25c0\u2500\u2500\u2500\u2500 agent_keys table   \u2500\u2500\u2500\u2500\u25b6      \u2502   table    \u2502\n\u2502        \u2502                                             \u2502            \u2502\n\u2502        \u2502     4. session token (24h TTL)            \u2502            \u2502\n\u2502        \u2502 \u25c0\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  \u2502            \u2502\n\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518                                             \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518`}</pre></Card>

      <div className="space-y-3">
        <div className="flex items-start gap-3"><div className="w-7 h-7 rounded-[2px] bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[12px] text-white shrink-0 font-medium">1</div><div className="flex-1"><div className="text-[13px] text-white font-medium">Generate a keypair</div><p className="text-[12px] text-zinc-500 mt-0.5">In the Agents tab, click Generate, or run:</p><CodeBlock code={`from keyshield_sdk import AgentKeyShield\ncreds = AgentKeyShield.generate_keypair()\nprint(creds)\n# {"private_key_hex": "abcd...", "pubkey_b58": "9WzDX..."}`} /></div></div>
        <div className="flex items-start gap-3"><div className="w-7 h-7 rounded-[2px] bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[12px] text-white shrink-0 font-medium">2</div><div className="flex-1"><div className="text-[13px] text-white font-medium">Register the pubkey</div><p className="text-[12px] text-zinc-500 mt-0.5">Agents tab \u2192 paste pubkey + name \u2192 Register.</p></div></div>
        <div className="flex items-start gap-3"><div className="w-7 h-7 rounded-[2px] bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[12px] text-white shrink-0 font-medium">3</div><div className="flex-1"><div className="text-[13px] text-white font-medium">Agent self-authenticates</div><p className="text-[12px] text-zinc-500 mt-0.5">Drop into your bot. Picks up env vars automatically:</p><CodeBlock code={`agent = AgentKeyShield()    # reads KS_OWNER_WALLET, KS_AGENT_KEY, KS_VAULT_PASS\nclient = agent.openai_client()  # auto-authenticates\nresp = client.chat.completions.create(\n    model="gpt-4o-mini",\n    messages=[{"role": "user", "content": "analyze SOL price"}],\n)`} /></div></div>
      </div>

      {/* Billing */}
      <div>
        <div className="flex items-center gap-2 text-[11px] text-white mb-1"><CreditCard size={12} />CHAPTER 4</div>
        <h2 className="text-[24px] font-bold text-white uppercase tracking-wider">Billing & x402</h2>
        <p className="text-[14px] text-zinc-400 mt-1">How payment works for non-self-custodian calls.</p>
      </div>

      <p className="text-[13px] text-zinc-300">When you call <code className="text-white">/proxy/openai/...</code> and you haven\'t stored an OpenAI key in your vault, KeyShield uses its own platform key and charges you. Four ways to pay:</p>
      <ol className="space-y-2 list-decimal list-inside text-[13px] text-zinc-300 mt-2">
        <li><strong className="text-white">Free credit</strong> \u2014 every new wallet gets $0.10 to test. About 100 GPT-4o-mini calls.</li>
        <li><strong className="text-white">Prepaid balance</strong> \u2014 top up with USDC. Calls deduct in real time.</li>
        <li><strong className="text-white">x402 micropayments</strong> \u2014 when balance hits $0, the proxy returns HTTP 402 with a Coinbase-format payment instruction.</li>
        <li><strong className="text-white">MPP streaming</strong> \u2014 open a metered channel once; the agent records usage on every call and the on-chain PaymentStream auto-settles in micro-USDC.</li>
      </ol>

      {/* Security */}
      <div>
        <div className="flex items-center gap-2 text-[11px] text-white mb-1"><Lock size={12} />CHAPTER 5</div>
        <h2 className="text-[24px] font-bold text-white uppercase tracking-wider">Security Model</h2>
      </div>

      <div className="space-y-2">
        {[
          ['AES-256-GCM', 'Authenticated encryption \u2014 tampering with ciphertext fails decryption loudly'],
          ['PBKDF2-HMAC-SHA256', '100k iterations to derive the encryption key from your passphrase'],
          ['ed25519 challenges', 'Wallet + agent auth signed with curve25519, replay-protected by 5-min nonces'],
          ['Zero-knowledge', 'Server never sees your key material or passphrase in plaintext'],
        ].map(([t, d]) => (
          <div key={t} className="flex items-start gap-3 px-4 py-3 rounded-[2px] bg-[#0a0a0a] border border-zinc-800/50">
            <Badge variant="success" className="shrink-0 mt-0.5">{t}</Badge>
            <p className="text-[12px] text-zinc-400">{d}</p>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-zinc-800/50">
        <p className="text-[11px] text-zinc-600">KeyShield {VERSION} \xb7 built {BUILD_DATE} \xb7 <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white">GitHub</a></p>
      </div>
    </div>
  );
};
