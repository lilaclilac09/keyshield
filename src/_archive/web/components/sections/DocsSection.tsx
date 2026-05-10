import React, { useState } from 'react';
import {
  Rocket, Shield, Bot, Code2, Terminal, CreditCard, Lock, AlertCircle,
  Zap, Key, DollarSign, FileText, Check, ArrowRight, Activity,
} from 'lucide-react';
import { API_BASE, getToken } from '../../lib/auth';
import { CopyButton } from '../ui/CopyButton';
import { CodeBlock } from '../ui/CodeBlock';
import { BUILD_DATE, REPO_URL, VERSION } from '../../lib/version';

export const DocsSection: React.FC = () => {
  const KS_BASE = API_BASE;
  const installCmd = `curl -fsSL ${KS_BASE}/install.sh | bash`;
  const token  = getToken() ?? 'YOUR_TOKEN';

  const [activeChapter, setActiveChapter] = useState<string>('quickstart');

  const CHAPTERS = [
    { id: 'quickstart',   title: 'Quickstart',         icon: <Rocket size={14} /> },
    { id: 'concepts',     title: 'Core concepts',      icon: <Shield size={14} /> },
    { id: 'agents',       title: 'Agent setup',        icon: <Bot size={14} /> },
    { id: 'sdk',          title: 'Python SDK',         icon: <Code2 size={14} /> },
    { id: 'cli',          title: 'CLI reference',      icon: <Terminal size={14} /> },
    { id: 'billing',      title: 'Billing & x402 & MPP', icon: <CreditCard size={14} /> },
    { id: 'security',     title: 'Security',           icon: <Lock size={14} /> },
    { id: 'troubleshoot', title: 'Troubleshooting',    icon: <AlertCircle size={14} /> },
  ];

  return (
    <div className="flex gap-6">
      <aside className="w-56 shrink-0">
        <div className="sticky top-0 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 px-3 mb-2">Documentation</div>
          {CHAPTERS.map(ch => (
            <button
              key={ch.id}
              onClick={() => {
                setActiveChapter(ch.id);
                document.getElementById(`doc-${ch.id}`)?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] text-left transition-colors ${
                activeChapter === ch.id
                  ? 'bg-[#0e1430] text-white border border-[#1c2550]'
                  : 'text-zinc-400 hover:text-white hover:bg-[#0a0d1a] border border-transparent'
              }`}
            >
              <span className="text-zinc-600">{ch.icon}</span>
              <span>{ch.title}</span>
            </button>
          ))}

          <a
            href={`${KS_BASE}/install.sh`}
            download
            className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg border border-[#5b8cff]/40 bg-[#5b8cff]/10 text-[#5b8cff] text-[12px] hover:bg-[#5b8cff]/20 transition-colors"
          >
            <Rocket size={12} /> Download install.sh
          </a>
          <a
            href={`${KS_BASE}/static/keyshield_sdk.py`}
            download
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#1c2238] bg-[#0a0d1a] text-zinc-400 text-[12px] hover:text-white transition-colors"
          >
            <FileText size={12} /> Python SDK file
          </a>
        </div>
      </aside>

      <div className="flex-1 min-w-0 space-y-12">

        {/* ── Quickstart ─────────────────────────────────────────────── */}
        <section id="doc-quickstart" className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-[#5b8cff] mb-1">
              <Rocket size={12} /> CHAPTER 1
            </div>
            <h2 className="text-[24px] font-semibold text-white">Quickstart</h2>
            <p className="text-[14px] text-zinc-400 mt-1">From zero to first agent call in under a minute.</p>
          </div>

          <div className="rounded-2xl border border-[#5b8cff]/30 bg-gradient-to-br from-[#0e1430] to-[#0a0d1a] p-6 relative overflow-hidden">
            <div className="absolute top-3 right-3 text-[10px] text-[#5b8cff]/50 font-mono">ONE-CLICK INSTALL</div>
            <div className="flex items-center gap-2 text-[#5b8cff] mb-3">
              <Zap size={14} />
              <span className="text-[13px] font-medium">Run this in your terminal</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[#020408] border border-[#131929]">
              <code className="flex-1 text-[13px] font-mono text-zinc-200 break-all">{installCmd}</code>
              <CopyButton text={installCmd} />
            </div>
            <p className="text-[11px] text-zinc-500 mt-3">
              The installer creates a Python venv, downloads the SDK, generates an ed25519 keypair for the agent, and writes a ready-to-use <code className="text-[#5b8cff]">.env</code> file.
            </p>
          </div>

          <h3 className="text-[15px] font-medium text-white mt-6">What the installer does</h3>
          <ol className="space-y-2.5">
            {[
              ['Pings the KeyShield server', `curl ${KS_BASE}/health → confirms backend is up`],
              ['Creates a Python virtualenv',  '~/keyshield-agent/.venv'],
              ['Installs httpx + pynacl',      'two pure-Python deps, no native build'],
              ['Downloads keyshield_sdk.py',   `${KS_BASE}/static/keyshield_sdk.py`],
              ['Generates ed25519 keypair',    '32-byte private key + base58 public key'],
              ['Writes .env file',             'KS_OWNER_WALLET, KS_AGENT_KEY, KS_VAULT_PASS, KS_BASE'],
              ['Drops a starter script',       'agent_demo.py — copy-paste-runnable'],
            ].map(([t, d], i) => (
              <li key={t} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#0e1430] border border-[#1c2550] flex items-center justify-center text-[10px] text-[#5b8cff] shrink-0 mt-0.5">{i+1}</div>
                <div>
                  <div className="text-[13px] text-white">{t}</div>
                  <div className="text-[11px] text-zinc-600 font-mono mt-0.5">{d}</div>
                </div>
              </li>
            ))}
          </ol>

          <h3 className="text-[15px] font-medium text-white mt-6">After install</h3>
          <CodeBlock code={`# 1. cd into the install directory
cd keyshield-agent
source .venv/bin/activate

# 2. Register your agent's pubkey in the dashboard:
#    Agents tab → paste the KS_AGENT_PUBKEY from .env

# 3. Run the demo
python agent_demo.py
# → agent authenticated as DkX1zP9...
# → vault keys: ['openai', 'anthropic']`} />
        </section>

        {/* ── Core concepts ──────────────────────────────────────────── */}
        <section id="doc-concepts" className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-[#5b8cff] mb-1">
              <Shield size={12} /> CHAPTER 2
            </div>
            <h2 className="text-[24px] font-semibold text-white">Core concepts</h2>
            <p className="text-[14px] text-zinc-400 mt-1">The three things you have to understand — and why going through the proxy is <em className="text-emerald-300 not-italic">faster</em>, not slower.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                t: 'Vault',
                i: <Key size={16} className="text-[#5b8cff]" />,
                d: 'Your API keys, encrypted with AES-256-GCM. The decryption key never leaves your machine. KeyShield server stores ciphertext — that\'s it.',
              },
              {
                t: 'Proxy',
                i: <Shield size={16} className="text-emerald-400" />,
                d: 'A request hits /proxy/{upstream}/. The server decrypts your key in memory, injects it into the upstream request, and forwards. The agent never sees the plaintext.',
              },
              {
                t: 'Agent',
                i: <Bot size={16} className="text-violet-400" />,
                d: 'A programmatic identity with its own ed25519 keypair. You register the pubkey once. The agent then self-authenticates by signing a server challenge.',
              },
            ].map(c => (
              <div key={c.t} className="rounded-xl border border-[#1c2238] bg-[#0a0d1a]/60 p-4">
                <div className="flex items-center gap-2 mb-2">{c.i}<span className="text-[14px] font-medium text-white">{c.t}</span></div>
                <p className="text-[12px] text-zinc-400 leading-relaxed">{c.d}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 to-[#0a0d1a] p-5 mt-6 relative overflow-hidden">
            <div className="absolute top-3 right-3 text-[10px] text-emerald-400/60 font-mono">PERFORMANCE</div>
            <div className="flex items-center gap-2 mb-2">
              <Zap size={14} className="text-emerald-400" />
              <span className="text-[14px] font-medium text-white">Lower latency · up to 10× faster than direct API calls</span>
            </div>
            <p className="text-[12px] text-zinc-400 leading-relaxed">
              Going through KeyShield is <strong className="text-emerald-300">faster</strong>, not slower. Three reasons, all measurable:
            </p>
            <ul className="space-y-1.5 mt-3">
              <li className="text-[12px] text-zinc-400 flex items-start gap-2">
                <Check size={12} className="text-emerald-400 shrink-0 mt-1" />
                <span>
                  <strong className="text-white">Warm HTTP/2 connection pool</strong> — KeyShield keeps persistent <code className="text-emerald-300">httpx.AsyncClient</code> sessions to every upstream (100 conns, 20 keepalive). Your call skips DNS + TLS handshake (~150–300ms saved on cold starts).
                </span>
              </li>
              <li className="text-[12px] text-zinc-400 flex items-start gap-2">
                <Check size={12} className="text-emerald-400 shrink-0 mt-1" />
                <span>
                  <strong className="text-white">Concurrent batch fan-out</strong> — <code className="text-emerald-300">batch(requests)</code> dispatches up to 20 calls in parallel via <code className="text-emerald-300">asyncio.gather</code>. A 20-prompt workload returns in the latency of one call → effectively <strong className="text-emerald-300">10–20× faster</strong> wall-clock.
                </span>
              </li>
              <li className="text-[12px] text-zinc-400 flex items-start gap-2">
                <Check size={12} className="text-emerald-400 shrink-0 mt-1" />
                <span>
                  <strong className="text-white">MPP skips x402 round-trips</strong> — once a stream is open, calls go straight upstream with no per-call 402 negotiation. Saves ~200ms vs per-request micropayment.
                </span>
              </li>
            </ul>
            <p className="text-[11px] text-zinc-500 mt-3">
              Net effect: a sequential agent that does 20 short calls finishes in ~1× the latency of a single direct call. The proxy is in the request path, but it's not the bottleneck — the upstream LLM is.
            </p>
          </div>

          <h3 className="text-[15px] font-medium text-white mt-6">Self-custodian vs platform</h3>
          <div className="rounded-xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-[#141a2e]">
              <div className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Shield size={14} className="text-emerald-400" />
                  <span className="text-[13px] text-emerald-400 font-medium">Self-custodian (free)</span>
                </div>
                <p className="text-[12px] text-zinc-400 leading-relaxed">
                  You stored your own API key. KeyShield encrypts it, injects it into upstream calls, charges you nothing. Your usage cost goes directly to OpenAI / Anthropic / wherever.
                </p>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign size={14} className="text-amber-400" />
                  <span className="text-[13px] text-amber-400 font-medium">Platform (billed)</span>
                </div>
                <p className="text-[12px] text-zinc-400 leading-relaxed">
                  No vault key for that upstream. KeyShield falls back to its own platform key and bills you per call. Pay with prepaid credit or x402 micropayments.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Agent setup ────────────────────────────────────────────── */}
        <section id="doc-agents" className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-[#5b8cff] mb-1">
              <Bot size={12} /> CHAPTER 3
            </div>
            <h2 className="text-[24px] font-semibold text-white">Agent setup</h2>
            <p className="text-[14px] text-zinc-400 mt-1">How agents authenticate to your vault.</p>
          </div>

          <h3 className="text-[15px] font-medium text-white">The flow</h3>
          <div className="rounded-xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5">
            <pre className="text-[11px] font-mono text-zinc-400 leading-relaxed">{
`┌────────┐     1. GET /auth/agent-challenge        ┌──────────┐
│        │ ◀──────────────────────────────────────  │          │
│        │     {challenge, nonce}                   │          │
│ AGENT  │                                          │ KEYSHIELD│
│  with  │     2. sign(challenge) with ed25519      │          │
│ ed25519│ ──────────────────────────────────────▶  │  + DB    │
│ keypair│     POST /auth/agent-login                │          │
│        │     {ownerWallet, agentPubkey, sig}      │          │
│        │                                          │   verify │
│        │     3. lookup delegation                 │   sig &  │
│        │     ◀────  agent_keys table   ────▶      │   table  │
│        │                                          │          │
│        │     4. session token (24h TTL)           │          │
│        │ ◀──────────────────────────────────────  │          │
└────────┘                                          └──────────┘
   token now grants access to owner's vault — same as wallet login`
            }</pre>
          </div>

          <h3 className="text-[15px] font-medium text-white mt-6">Three steps</h3>
          <ol className="space-y-3">
            <li className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-[#0e1430] border border-[#1c2550] flex items-center justify-center text-[12px] text-[#5b8cff] shrink-0 font-medium">1</div>
              <div className="flex-1">
                <div className="text-[13px] text-white font-medium">Generate a keypair</div>
                <p className="text-[12px] text-zinc-500 mt-0.5">In the Agents tab, click <strong className="text-white">Generate</strong>, or run:</p>
                <CodeBlock code={`from keyshield_sdk import AgentKeyShield
creds = AgentKeyShield.generate_keypair()
print(creds)
# {"private_key_hex": "abcd...", "pubkey_b58": "9WzDX..."}`} />
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-[#0e1430] border border-[#1c2550] flex items-center justify-center text-[12px] text-[#5b8cff] shrink-0 font-medium">2</div>
              <div className="flex-1">
                <div className="text-[13px] text-white font-medium">Register the pubkey</div>
                <p className="text-[12px] text-zinc-500 mt-0.5">Agents tab → paste pubkey + name → Register. Or via SDK:</p>
                <CodeBlock code={`# Owner side
ks = KeyShield(token="${token.slice(0, 16)}...")
ks.agent_register(pubkey_b58=creds["pubkey_b58"], name="trading-bot-v1")`} />
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-[#0e1430] border border-[#1c2550] flex items-center justify-center text-[12px] text-[#5b8cff] shrink-0 font-medium">3</div>
              <div className="flex-1">
                <div className="text-[13px] text-white font-medium">Agent self-authenticates</div>
                <p className="text-[12px] text-zinc-500 mt-0.5">Drop into your bot. Picks up env vars automatically:</p>
                <CodeBlock code={`agent = AgentKeyShield()    # reads KS_OWNER_WALLET, KS_AGENT_KEY, KS_VAULT_PASS
client = agent.openai_client()  # auto-authenticates
resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "analyze SOL price"}],
)`} />
              </div>
            </li>
          </ol>
        </section>

        {/* ── Python SDK ─────────────────────────────────────────────── */}
        <section id="doc-sdk" className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-[#5b8cff] mb-1">
              <Code2 size={12} /> CHAPTER 4
            </div>
            <h2 className="text-[24px] font-semibold text-white">Python SDK</h2>
            <p className="text-[14px] text-zinc-400 mt-1">Two clients: <code className="text-[#5b8cff]">KeyShield</code> for humans, <code className="text-[#5b8cff]">AgentKeyShield</code> for bots.</p>
          </div>

          <h3 className="text-[15px] font-medium text-white">Common methods</h3>
          <div className="rounded-xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
            {[
              ['store(upstream, api_key)',          'Encrypt + save a key in the vault'],
              ['list_keys()',                       'Return list of stored upstream names'],
              ['decrypt_key(upstream)',             "Show plaintext (owner only — don't log it)"],
              ['delete_key(upstream)',              'Remove a stored key'],
              ['proxy(upstream, path, json=...)',   'Forward a single request — key injected'],
              ['batch(requests)',                   'Up to 20 concurrent proxied calls'],
              ['proxy_url(upstream)',               'Base URL for SDK plug-in mode'],
              ['openai_client() / anthropic_client()','Pre-wired SDK client'],
              ['agent_register(pubkey, name)',      'Owner: register an agent pubkey'],
              ['agent_list() / agent_revoke(id)',   'Owner: list / revoke agents'],
            ].map(([m, d]) => (
              <div key={m} className="flex items-start gap-4 px-5 py-2.5 border-b border-[#0d1020] last:border-0">
                <code className="text-[12px] font-mono text-[#5b8cff] w-72 shrink-0 truncate">{m}</code>
                <span className="text-[12px] text-zinc-400">{d}</span>
              </div>
            ))}
          </div>

          <h3 className="text-[15px] font-medium text-white mt-6">Async variant</h3>
          <CodeBlock code={`from keyshield_sdk import AsyncKeyShield

async with AsyncKeyShield() as ks:
    await ks.wallet_login_with_key(seed_hex, passphrase)
    keys = await ks.list_keys()`} />
        </section>

        {/* ── CLI ────────────────────────────────────────────────────── */}
        <section id="doc-cli" className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-[#5b8cff] mb-1">
              <Terminal size={12} /> CHAPTER 5
            </div>
            <h2 className="text-[24px] font-semibold text-white">CLI reference</h2>
            <p className="text-[14px] text-zinc-400 mt-1">Bash-friendly commands via <code className="text-[#5b8cff]">keyshield-cli.sh</code>.</p>
          </div>

          <CodeBlock code={`source keyshield-cli.sh

ks_login alice mypassphrase             # password login
ks_store openai sk-proj-abcd1234        # save a key
ks_list                                  # list stored upstreams
ks_proxy openai v1/chat/completions \\
  '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}'
ks_logout                                # revoke session`} />

          <p className="text-[12px] text-zinc-500">
            Every command sets <code className="text-[#5b8cff]">KS_TOKEN</code> in your shell so subsequent commands authenticate automatically.
          </p>
        </section>

        {/* ── Billing & x402 ─────────────────────────────────────────── */}
        <section id="doc-billing" className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-[#5b8cff] mb-1">
              <CreditCard size={12} /> CHAPTER 6
            </div>
            <h2 className="text-[24px] font-semibold text-white">Billing & x402 & MPP</h2>
            <p className="text-[14px] text-zinc-400 mt-1">How payment works for non-self-custodian calls — including the streaming Metered Payment Protocol.</p>
          </div>

          <p className="text-[13px] text-zinc-300">
            When you call <code className="text-[#5b8cff]">/proxy/openai/...</code> and you haven't stored an OpenAI key in your vault, KeyShield uses its own platform key and charges you. Four ways to pay:
          </p>
          <ol className="space-y-2 list-decimal list-inside text-[13px] text-zinc-300">
            <li><strong className="text-white">Free credit</strong> — every new wallet gets $0.10 to test. About 100 GPT-4o-mini calls.</li>
            <li><strong className="text-white">Prepaid balance</strong> — top up with USDC. Calls deduct in real time.</li>
            <li><strong className="text-white">x402 micropayments</strong> — when balance hits $0, the proxy returns HTTP 402 with a Coinbase-format payment instruction. Your client pays USDC on Base and retries.</li>
            <li><strong className="text-white">MPP streaming</strong> — open a metered channel once; the agent records usage on every call and the on-chain <code className="text-[#5b8cff]">PaymentStream</code> auto-settles in micro-USDC every <code className="text-[#5b8cff]">settlement_interval_secs</code>. Best for long-running, high-volume agents.</li>
          </ol>

          <h3 className="text-[15px] font-medium text-white mt-6">x402 response example</h3>
          <CodeBlock code={`HTTP/1.1 402 Payment Required
X-Payment-Required: x402
Content-Type: application/json

{
  "x402Version": 1,
  "error": "X-PAYMENT-REQUIRED",
  "accepts": [{
    "scheme": "exact",
    "network": "base-sepolia",
    "maxAmountRequired": "10000",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0xKEYSHIELD_TREASURY",
    "resource": "${KS_BASE}/proxy/openai/v1/chat/completions"
  }]
}`} />

          <h3 className="text-[15px] font-medium text-white mt-8 flex items-center gap-2">
            <Activity size={14} className="text-amber-400" /> MPP — streaming payment for long-running agents
          </h3>
          <p className="text-[13px] text-zinc-300">
            Per-call x402 means an HTTP 402 round-trip every time the balance dips. For agents making thousands of small calls,
            <strong className="text-white"> Metered Payment Protocol (MPP) </strong>
            is cheaper and faster: open a stream once, record usage as you go, and let the on-chain
            <code className="text-[#5b8cff]"> PaymentStream </code>
            auto-settle in micro-USDC every interval.
          </p>

          <div className="rounded-xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5 mt-3">
            <pre className="text-[11px] font-mono text-zinc-400 leading-relaxed">{
`┌──────┐  open_payment_stream(rate, interval)        ┌────────────┐
│ AGENT│ ───────────────────────────────────────────▶ │  KEYSHIELD │
│      │       grant_agent_payment_access (on-chain)  │  + Solana  │
│      │ ◀───────────────────────────────────────────  │  Program   │
│      │                                               │            │
│      │  proxy("v1/messages", ...) × N (no 402!)      │            │
│      │ ─────────────────────────────────────────────▶│  meter     │
│      │  record_usage(tokens) × N                     │  usage     │
│      │ ─────────────────────────────────────────────▶│            │
│      │                                               │            │
│      │  every settlement_interval_secs:              │  settle    │
│      │    PaymentStream debits micro-USDC on-chain   │  on-chain  │
└──────┘                                               └────────────┘`
            }</pre>
          </div>

          <h3 className="text-[15px] font-medium text-white mt-6">Open + use a stream</h3>
          <CodeBlock code={`from keyshield_sdk import AgentKeyShield

agent = AgentKeyShield()    # reads KS_OWNER_WALLET, KS_AGENT_KEY, KS_VAULT_PASS

# 1. Owner pre-grants per-token rate + settlement window (one-time, on-chain).
#    grant_agent_payment_access(agent_pubkey, rate_per_token=15, interval=60)

# 2. Agent opens a metered channel.
stream = agent.open_payment_stream(
    upstream="anthropic",
    rate_per_token_micro_usdc=15,    # $0.000015 per token
    settlement_interval_secs=60,     # auto-settle every 60s on-chain
)

# 3. Make calls. No HTTP 402 in the hot path — usage accumulates locally.
for prompt in prompts:
    resp = stream.proxy("v1/messages", json={
        "model": "claude-3-haiku",
        "messages": [{"role": "user", "content": prompt}],
    })
    stream.record_usage(resp.usage.input_tokens + resp.usage.output_tokens)

# 4. Settle (also fires automatically every interval). Pushes the
#    accumulated micro-USDC to the treasury via PaymentStream.
await stream.settle()
await stream.close()`} />

          <p className="text-[12px] text-zinc-500 mt-2">
            On-chain account: <code className="text-[#5b8cff]">PaymentStream</code> in
            <code className="text-[#5b8cff]"> programs/keyshield</code>.
            Owner sets <code className="text-[#5b8cff]">rate_per_call_micro_usdc</code>,
            <code className="text-[#5b8cff]"> rate_per_token_micro_usdc</code>, and
            <code className="text-[#5b8cff]"> settlement_interval_secs</code> via
            <code className="text-[#5b8cff]"> grant_agent_payment_access</code>.
            The agent can never debit more than the granted rate, and the owner can revoke at any time.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <div className="rounded-xl border border-[#1c2238] bg-[#0a0d1a]/60 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard size={14} className="text-[#5b8cff]" />
                <span className="text-[13px] font-medium text-white">Per-call x402</span>
              </div>
              <p className="text-[12px] text-zinc-400 leading-relaxed">
                Best for one-shot calls or low-frequency clients. Each request that hits a $0 balance triggers an HTTP 402, the client pays, and the call retries. Simple, but a network round-trip every time.
              </p>
            </div>
            <div className="rounded-xl border border-amber-900/40 bg-amber-950/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity size={14} className="text-amber-400" />
                <span className="text-[13px] font-medium text-amber-300">MPP streaming</span>
              </div>
              <p className="text-[12px] text-zinc-400 leading-relaxed">
                Best for long-running agents. Open once, meter every call, settle on a fixed cadence. Owner caps the rate; agent never sees the treasury wallet. No 402 in the hot path.
              </p>
            </div>
          </div>
        </section>

        {/* ── Security ───────────────────────────────────────────────── */}
        <section id="doc-security" className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-[#5b8cff] mb-1">
              <Lock size={12} /> CHAPTER 7
            </div>
            <h2 className="text-[24px] font-semibold text-white">Security model</h2>
            <p className="text-[14px] text-zinc-400 mt-1">What's protected, and what isn't.</p>
          </div>

          <div className="space-y-2">
            {[
              ['AES-256-GCM',        "Authenticated encryption — tampering with ciphertext fails decryption loudly"],
              ['PBKDF2-HMAC-SHA256', "100k iterations to derive the encryption key from your passphrase"],
              ['ed25519 challenges', "Wallet + agent auth signed with curve25519, replay-protected by 5-min nonces"],
              ['Single-use nonces',  "Every challenge consumed on first use — no replay attack window"],
              ['SQLite WAL mode',    "Concurrent reads + atomic writes for sessions, agents, usage logs"],
              ['Zero-trust proxy',   "Plaintext key only exists in a single httpx.Request, never logged or persisted"],
            ].map(([t, d]) => (
              <div key={t} className="flex items-start gap-3 p-3 rounded-lg bg-[#0a0d1a]/60 border border-[#1c2238]">
                <Check size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-[13px] text-white font-medium">{t}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">{d}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-amber-900/40 bg-amber-950/10 p-4 mt-4">
            <div className="flex items-start gap-2">
              <AlertCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-[13px] text-amber-300 font-medium">What's NOT protected</div>
                <p className="text-[12px] text-zinc-400 mt-1">
                  KeyShield runs as a service. If the server process is compromised mid-request, the plaintext key is briefly in memory. For maximum security, self-host on infrastructure you control.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Troubleshooting ────────────────────────────────────────── */}
        <section id="doc-troubleshoot" className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-[#5b8cff] mb-1">
              <AlertCircle size={12} /> CHAPTER 8
            </div>
            <h2 className="text-[24px] font-semibold text-white">Troubleshooting</h2>
          </div>

          <div className="space-y-3">
            {[
              { q: '401 unauthorized when calling /proxy/...',         a: 'Either your session expired (24h TTL) or no vault key + no platform key. Run authenticate() again. For the agent client this is automatic.' },
              { q: '402 Payment Required',                              a: 'Platform key was used but your balance is $0. Top up via Activity tab or send USDC to the address in X-Payment-Required.' },
              { q: 'Agent gets 403 "agent pubkey not registered"',     a: 'The owner forgot step 2 — register the agent\'s pubkey in the Agents tab.' },
              { q: 'pip install pynacl fails on M-series Mac',          a: 'pynacl ships with an arm64 wheel — `pip install --upgrade pip` first to pick it up.' },
              { q: 'CORS error in the browser',                         a: `Backend's CORS_ORIGINS env var doesn't include your dev port. Server defaults cover 3000-3005, 5173-5175.` },
            ].map(({ q, a }) => (
              <details key={q} className="rounded-lg border border-[#1c2238] bg-[#0a0d1a]/60">
                <summary className="cursor-pointer px-4 py-3 text-[13px] text-white font-medium hover:bg-[#070912] flex items-center gap-2">
                  <ArrowRight size={12} className="text-zinc-500" />
                  {q}
                </summary>
                <div className="px-4 pb-3 pt-1 text-[12px] text-zinc-400 leading-relaxed">{a}</div>
              </details>
            ))}
          </div>
        </section>

        <div className="text-center text-[10px] text-zinc-700 pt-8 pb-4">
          KeyShield v2 · self-custodian API key vault · made for agents
        </div>
      </div>
    </div>
  );
};
