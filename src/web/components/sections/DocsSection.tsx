import React from 'react';
import { Rocket, Shield, Bot, Code2, Terminal, CreditCard, Lock, Zap, Key, DollarSign, FileText, ArrowRight } from 'lucide-react';
import { Card } from '../ui/Card';
import { CodeBlock } from '../ui/CodeBlock';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { API_BASE } from '../../lib/auth';
import { VERSION, BUILD_DATE, REPO_URL } from '../../lib/version';
import { OPENROUTER_CHAT_PATH, OPENROUTER_DEMO_MODEL, OPENROUTER_MODEL_URL, openrouterCurlSnippet, openrouterPythonSnippet } from '../../lib/openrouter-interface';
import { TroubleshootingSection } from './TroubleshootingSection';
import { copyWithFeedback } from '../../lib/app-feedback';
import { frameworkSnippets } from '../../lib/keychain';
import { ExtensionInstallHint } from '../ExtensionInstallHint';

const CHAPTERS = [
  { id: 'docs-ch-1', label: '1 · Quickstart' },
  { id: 'docs-ch-2', label: '2 · Core Concepts' },
  { id: 'docs-ch-3', label: '3 · Agent Setup' },
  { id: 'docs-ch-4', label: '4 · Billing & x402' },
  { id: 'docs-ch-5', label: '5 · Security' },
  { id: 'docs-troubleshooting', label: 'Troubleshooting' },
] as const;

export const DocsSection: React.FC = () => {
  const installCmd = `curl -fsSL ${API_BASE}/install.sh | bash`;

  return (
    <div className="space-y-8">
      <nav data-testid="docs-toc" className="rounded-2xl border border-[#243365] bg-[#131c39] px-5 py-4">
        <p className="text-[12px] uppercase tracking-wider text-[#8a96c2] mb-3">Chapters</p>
        <div className="flex flex-wrap gap-2">
          {CHAPTERS.map((ch) => (
            <a
              key={ch.id}
              href={`#${ch.id}`}
              className="h-9 px-3 rounded-lg border border-[#243365] text-[13px] text-white hover:border-zinc-400"
            >
              {ch.label}
            </a>
          ))}
        </div>
      </nav>

      <Card variant="bordered">
        <div className="flex items-center gap-2 text-white mb-2"><Shield size={14} /><span className="text-[13px] font-semibold uppercase tracking-wider">Human-usable UX standard</span></div>
        <p className="text-[12px] text-[#a8b3d8] leading-relaxed">
          Operator-facing acceptance criteria for waiting states, readable feedback timing, actionable errors, and desktop focus behavior:
          {' '}
          <a
            href={`${REPO_URL}/blob/main/docs/technical/human-usable-ui-standards.md`}
            target="_blank"
            rel="noreferrer"
            className="text-white hover:underline"
          >
            docs/technical/human-usable-ui-standards.md
          </a>
        </p>
      </Card>

      {/* Quickstart */}
      <div id="docs-ch-1">
        <div className="flex items-center gap-2 text-[11px] text-white mb-1"><Rocket size={12} />CHAPTER 1</div>
        <h2 className="text-[24px] font-bold text-white uppercase tracking-wider">Quickstart</h2>
        <p className="text-[14px] text-[#a8b3d8] mt-1">From zero to first agent call in under a minute — or install the Chrome extension (preferred, next card) to save keys detected on provider sites while signed in here.</p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-amber-200">Test build</span>
          <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-amber-200">Under development</span>
          <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-amber-200">Not production release</span>
        </div>
      </div>

      <Card variant="bordered">
        <div className="flex items-center gap-2 text-white mb-3"><FileText size={14} /><span className="text-[13px] font-semibold uppercase tracking-wider">Install links (placeholder behavior)</span></div>
        <p className="text-[12px] text-[#a8b3d8] leading-relaxed">
          These are docs-only placeholders for testing copy and flow. They are not a production installer or store listing.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={`${REPO_URL}/blob/main/DEVELOPMENT.md#mac-app-personal-dmg`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-[#243365] bg-[#0e1631] px-3 py-2 text-[12px] text-white hover:bg-white/5">
            Desktop install (placeholder) <ArrowRight size={12} />
          </a>
          <a href={`${REPO_URL}/blob/main/src/extension/README.md#install--firefox--muse-browser-agnostic`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-[#243365] bg-[#0e1631] px-3 py-2 text-[12px] text-white hover:bg-white/5">
            Extension install (placeholder) <ArrowRight size={12} />
          </a>
        </div>
        <p className="text-[11px] text-[#8a96c2] mt-3">
          Marketing release label: <strong className="text-white">v0.3 · 2026-11-11</strong>. Verify latest in <a href={`${REPO_URL}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer" className="text-white hover:underline">CHANGELOG</a> and <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-white hover:underline">GitHub main</a>.
        </p>
      </Card>

      <Card variant="bordered">
        <div className="flex items-center gap-2 text-white mb-3"><Zap size={14} /><span className="text-[13px] font-semibold uppercase tracking-wider">Run this in your terminal</span></div>
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[#0e1631] border border-[#243365]"><code className="flex-1 text-[13px] font-mono text-zinc-200 break-all">{installCmd}</code><Button variant="ghost" size="sm" onClick={() => { void copyWithFeedback(installCmd); }}>Copy</Button></div>
        <p className="text-[11px] text-[#8a96c2] mt-3">The installer creates a Python venv, downloads the SDK, generates an ed25519 keypair for the agent, and writes a ready-to-use <code className="text-white">.env</code> file.</p>
      </Card>

      <ExtensionInstallHint variant="home" />

      <Card variant="bordered">
        <div className="flex items-center gap-2 text-white mb-3"><Zap size={14} /><span className="text-[13px] font-semibold uppercase tracking-wider">Legacy OpenRouter proxy examples — separate from Device Vault</span></div>
        <p className="text-[12px] text-[#a8b3d8] leading-relaxed mb-3">
          Free Nemotron: <a href={OPENROUTER_MODEL_URL} target="_blank" rel="noreferrer" className="text-white hover:underline">{OPENROUTER_DEMO_MODEL}</a>.
          Get your own key at openrouter.ai/keys. Activity → Connect saves it only in your unlocked device vault; unlock or create the vault first. Connect does not send the key to KeyShield or configure hosted vproxy or Meter.
          Legacy proxy integration is separate from the dashboard Device Vault. The Python keyshield-proxy uses separately sealed keys plus a server share, not dashboard Device Vault keys, and has no per-use approval. These examples do not provide access to Device Vault keys. Give agents only a proxy-only token.
        </p>
        <div className="space-y-3">
          <CodeBlock code={openrouterCurlSnippet('<YOUR_AGENT_TOKEN>')} />
          <CodeBlock code={openrouterPythonSnippet('<YOUR_AGENT_TOKEN>')} />
          <p className="text-[11px] text-[#5e6a91]">Files: `src/web/lib/openrouter-interface.ts` · `src/backend/proxy/openrouter_interface.py` · path `{OPENROUTER_CHAT_PATH}`</p>
        </div>
      </Card>

      <Card variant="bordered">
        <div className="flex items-center gap-2 text-white mb-3"><Key size={14} /><span className="text-[13px] font-semibold uppercase tracking-wider">API keychain</span></div>
        <p className="text-[14px] text-[#a8b3d8] leading-relaxed mb-3">
          Unlock the Device Vault, then paste and save a key. Keys are encrypted on this device; only ciphertext is synced, not plaintext. Save + Call skips the call for device-encrypted keys.
          Per-agent use of Device Vault keys is not available in this app. Approval exists only as an opt-in development mock, not in the packaged app.
          Lowest cached RPC TTL is 2s (<code className="text-white">getSlot</code> / <code className="text-white">getLatestBlockhash</code>). Writes never cache.
        </p>
      </Card>

      {/* Core concepts */}
      <div id="docs-ch-2">
        <div className="flex items-center gap-2 text-[11px] text-white mb-1"><Shield size={12} />CHAPTER 2</div>
        <h2 className="text-[24px] font-bold text-white uppercase tracking-wider">Core Concepts</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><div className="flex items-center gap-2 mb-2"><Key size={16} className="text-white" /><span className="text-[14px] font-medium text-white">Vault</span></div><p className="text-[12px] text-[#a8b3d8] leading-relaxed">Your API keys, encrypted with AES-256-GCM. The decryption key never leaves your machine.</p></Card>
        <Card><div className="flex items-center gap-2 mb-2"><Shield size={16} className="text-emerald-400" /><span className="text-[14px] font-medium text-white">Device Vault limitations</span></div><p className="text-[12px] text-[#a8b3d8] leading-relaxed">Per-agent use of Device Vault keys is not available in this app. Approval exists only as an opt-in development mock, not in the packaged app.</p></Card>
        <Card><div className="flex items-center gap-2 mb-2"><Bot size={16} className="text-[#a8b3d8]" /><span className="text-[14px] font-medium text-white">Agent</span></div><p className="text-[12px] text-[#a8b3d8] leading-relaxed">A programmatic identity with its own ed25519 keypair. You register the pubkey once. The agent self-authenticates by signing a server challenge.</p></Card>
      </div>

      {/* Performance */}
      <Card variant="bordered">
        <div className="flex items-center gap-2 mb-2"><Zap size={14} className="text-emerald-400" /><span className="text-[14px] font-medium text-white">Call path — pool, cache, MPP skip</span></div>
        <p className="text-[12px] text-[#a8b3d8] leading-relaxed">Home → Call prints the milliseconds <strong className="text-white">that request actually timed</strong>. Do not quote a marketing band. Three reasons the proxy can be cheaper than a cold direct hop:</p>
        <ul className="space-y-1.5 mt-3">
          <li className="text-[12px] text-[#a8b3d8] flex items-start gap-2"><span className="text-emerald-400 mt-1">&#x2713;</span><span><strong className="text-white">Warm HTTP/2 connection pool</strong> — KeyShield keeps persistent sessions to every upstream, so a later call can skip a fresh DNS + TLS handshake.</span></li>
          <li className="text-[12px] text-[#a8b3d8] flex items-start gap-2"><span className="text-emerald-400 mt-1">&#x2713;</span><span><strong className="text-white">Concurrent batch fan-out</strong> — <code className="text-white">batch(requests)</code> dispatches up to 20 calls in parallel via <code className="text-white">asyncio.gather</code>.</span></li>
          <li className="text-[12px] text-[#a8b3d8] flex items-start gap-2"><span className="text-emerald-400 mt-1">&#x2713;</span><span><strong className="text-white">MPP skips x402 round-trips</strong> — once a stream is open, calls go straight upstream with no per-call 402 negotiation.</span></li>
        </ul>
      </Card>

      {/* Agent setup */}
      <div id="docs-ch-3">
        <div className="flex items-center gap-2 text-[11px] text-white mb-1"><Bot size={12} />CHAPTER 3</div>
        <h2 className="text-[24px] font-bold text-white uppercase tracking-wider">Agent Setup</h2>
      </div>

      <Card><pre className="text-[11px] font-mono text-[#a8b3d8] leading-relaxed">{`\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510     1. GET /auth/agent-challenge        \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\n\u2502        \u2502 \u25c0\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  \u2502          \u2502\n\u2502 AGENT  \u2502     {challenge, nonce}                  \u2502 KEYSHIELD  \u2502\n\u2502  with  \u2502                                             \u2502            \u2502\n\u2502 ed25519\u2502 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u25b6  \u2502  + DB      \u2502\n\u2502 keypair\u2502     POST /auth/agent-login                \u2502            \u2502\n\u2502        \u2502     {ownerWallet, agentPubkey, sig}     \u2502   verify   \u2502\n\u2502        \u2502     3. lookup delegation                 \u2502   sig &    \u2502\n\u2502        \u2502     \u25c0\u2500\u2500\u2500\u2500 agent_keys table   \u2500\u2500\u2500\u2500\u25b6      \u2502   table    \u2502\n\u2502        \u2502                                             \u2502            \u2502\n\u2502        \u2502     4. session token (24h TTL)            \u2502            \u2502\n\u2502        \u2502 \u25c0\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  \u2502            \u2502\n\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518                                             \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518`}</pre></Card>

      <div className="space-y-3">
        <div className="flex items-start gap-3"><div className="w-7 h-7 rounded-lg bg-zinc-900 border border-[#243365] flex items-center justify-center text-[12px] text-white shrink-0 font-medium">1</div><div className="flex-1"><div className="text-[13px] text-white font-medium">Generate a keypair</div><p className="text-[12px] text-[#8a96c2] mt-0.5">In the Agents tab, click Generate, or run:</p><CodeBlock code={`from keyshield_sdk import AgentKeyShield\ncreds = AgentKeyShield.generate_keypair()\nprint(creds)\n# {"private_key_hex": "abcd...", "pubkey_b58": "9WzDX..."}`} /></div></div>
        <div className="flex items-start gap-3"><div className="w-7 h-7 rounded-lg bg-zinc-900 border border-[#243365] flex items-center justify-center text-[12px] text-white shrink-0 font-medium">2</div><div className="flex-1"><div className="text-[13px] text-white font-medium">Register the pubkey</div><p className="text-[12px] text-[#8a96c2] mt-0.5">Agents tab → paste pubkey + name → Register.</p></div></div>
        <div className="flex items-start gap-3"><div className="w-7 h-7 rounded-lg bg-zinc-900 border border-[#243365] flex items-center justify-center text-[12px] text-white shrink-0 font-medium">3</div><div className="flex-1"><div className="text-[13px] text-white font-medium">Legacy proxy example — separate from Device Vault</div><p className="text-[12px] text-[#8a96c2] mt-0.5">This is not a Device Vault workflow. The Python keyshield-proxy uses separately sealed keys plus a server share, not dashboard Device Vault keys, and has no per-use approval. Use only a proxy-only agent token:</p><CodeBlock code={frameworkSnippets('openai').python} /></div></div>
      </div>

      {/* Billing */}
      <div id="docs-ch-4">
        <div className="flex items-center gap-2 text-[11px] text-white mb-1"><CreditCard size={12} />CHAPTER 4</div>
        <h2 className="text-[24px] font-bold text-white uppercase tracking-wider">Billing & x402</h2>
        <p className="text-[14px] text-[#a8b3d8] mt-1">How payment works for non-self-custodian calls.</p>
      </div>

      <p className="text-[13px] text-[#e8ecff]">Legacy proxy billing is separate from dashboard Device Vault storage. It does not enable per-agent use of Device Vault keys. Four ways to pay:</p>
      <ol className="space-y-2 list-decimal list-inside text-[13px] text-[#e8ecff] mt-2">
        <li><strong className="text-white">Free credit</strong> — every new wallet gets $0.10 to test. About 100 GPT-4o-mini calls.</li>
        <li><strong className="text-white">Prepaid balance</strong> — top up with USDC. Calls deduct in real time.</li>
        <li><strong className="text-white">x402 micropayments</strong> — when balance hits $0, the proxy returns HTTP 402 with a Coinbase-format payment instruction.</li>
        <li><strong className="text-white">MPP streaming</strong> — open a metered channel once; the agent records usage on every call and the on-chain PaymentStream auto-settles in micro-USDC.</li>
      </ol>

      {/* Security */}
      <div id="docs-ch-5">
        <div className="flex items-center gap-2 text-[11px] text-white mb-1"><Lock size={12} />CHAPTER 5</div>
        <h2 className="text-[24px] font-bold text-white uppercase tracking-wider">Security Model</h2>
      </div>

      <div className="space-y-2">
        {[
          ['AES-256-GCM', 'Authenticated encryption \u2014 tampering with ciphertext fails decryption loudly'],
          ['PBKDF2-HMAC-SHA256', '100k iterations to derive the encryption key from your passphrase'],
          ['ed25519 challenges', 'Wallet + agent auth signed with curve25519, replay-protected by 5-min nonces'],
          ['Zero-knowledge (Device Vault)', 'Device Vault sync stores ciphertext only. Legacy non-ZK backend storage keeps a server-readable plaintext copy and is separate from Device Vault'],
          ['Proxy-only agent tokens', 'Agent and developer tokens get 403 on vault, decrypt and management routes'],
        ].map(([t, d]) => (
          <div key={t} className="flex items-start gap-3 px-4 py-3 rounded-lg bg-[#131c39] border border-[#243365]/50">
            <Badge variant="success" className="shrink-0 mt-0.5">{t}</Badge>
            <p className="text-[12px] text-[#a8b3d8]">{d}</p>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-[#243365]/50">
        <p className="text-[11px] text-[#5e6a91]">KeyShield {VERSION} · built {BUILD_DATE} · <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-[#8a96c2] hover:text-white">GitHub</a></p>
      </div>

      <TroubleshootingSection />
    </div>
  );
};
