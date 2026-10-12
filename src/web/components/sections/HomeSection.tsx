import React, { useState } from 'react';
import { Key, Wallet, Plug, ArrowRight } from 'lucide-react';
import { ExtensionInstallHint } from '../ExtensionInstallHint';
import { ExtensionTokenCopy } from '../ExtensionTokenCopy';
import { apiFetch, getPasskeyTrust } from '../../lib/auth';
import { describeBalanceChange, describeRpcPing, SHOP_CREDIT_USD, SHOP_ITEM_NAME, SHOP_MPP_USD, wantsShopDemo } from '../../lib/shop-demo';
import { buyMppShopSku, downloadMppReceipt, loadStoredMppReceipt } from '../../lib/mpp-shop';
import { formatMicroUsdc, type MppShopReceipt } from '../../lib/mpp-receipt';
import { BAZAAR_OFFERS, PAYAI_LIVE_EXTRAS } from '../../lib/x402-bazaar';
import { MppReceiptCard } from '../MppReceiptCard';
import { isVaultUnlocked } from '../../lib/vault-session';
import { ensureVerified } from '../../lib/zk-verify';
import { OPENROUTER_DEMO_MODEL, OPENROUTER_MODEL_URL } from '../../lib/openrouter-interface';
import {
  callKeychain,
  detectUpstream,
  extractDetectedKey,
  fetchKeychainHome,
  storeDetectedKey,
  type KeychainCallResult,
  type KeychainHome,
} from '../../lib/keychain';

interface Props {
  home: KeychainHome | null;
  loading?: boolean;
  error?: string | null;
  homeMs?: number | null;
  walletConnected: boolean;
  passkeyUnlocked?: boolean;
  onRefresh: () => void;
  onConnectWallet?: () => void;
  onUnlock?: () => void;
  unlocking?: boolean;
  onGo: (section: string) => void;
}

function fmt(n: number | null | undefined, digits = 4): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

const Pill: React.FC<{ ok: boolean; label: string; sub?: string }> = ({ ok, label, sub }) => (
  <div className={`flex-1 min-w-[140px] rounded-2xl border px-5 py-4 ${ok ? 'border-emerald-900/50 bg-emerald-950/20' : 'border-[#243365] bg-[#0e1631]'}`}>
    <div className="flex items-center gap-2">
      <span className={`w-2.5 h-2.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-[#5e6a91]'}`} />
      <span className="text-[18px] font-semibold text-white">{label}</span>
    </div>
    {sub && <p className="text-[16px] text-[#8a96c2] mt-1.5">{sub}</p>}
  </div>
);

export const HomeSection: React.FC<Props> = ({
  home, loading, error, homeMs, walletConnected, onRefresh, onConnectWallet, onUnlock, unlocking, onGo,
}) => {
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState<'save' | 'call' | string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [lastCall, setLastCall] = useState<KeychainCallResult | null>(null);
  const [receipt, setReceipt] = useState<MppShopReceipt>(() => loadStoredMppReceipt());
  const highlightShop = typeof window !== 'undefined' && wantsShopDemo(window.location.search);

  const detected = detectUpstream(paste);
  const passkey = !!getPasskeyTrust();
  const vaultOpen = isVaultUnlocked();
  const wallet = home?.wallet;
  const apis = home?.apis ?? [];
  const conn = home?.connection;

  const savePaste = async () => {
    const raw = extractDetectedKey(paste);
    if (!raw) { setOk(false); setMsg('Paste a key first'); return; }
    setBusy('save'); setMsg(null);
    try {
      const stored = await storeDetectedKey(raw, detected.upstream ?? undefined);
      setOk(true);
      setMsg(`Saved ${stored.upstream} ${stored.prefix}`);
      setPaste('');
      onRefresh();
    } catch (err) {
      setOk(false);
      setMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(null);
    }
  };

  const runCall = async (upstream: string) => {
    setBusy(upstream); setMsg(null);
    try {
      if (!isVaultUnlocked() && getPasskeyTrust()) {
        setMsg('Verifying with passkey…');
        const verified = await ensureVerified();
        if (!verified.ok && verified.detail && /PRF|passkey|Face ID|No passkey/i.test(verified.detail)) {
          /* Server vault can still call; local decrypt skipped. */
        }
      }
      const result = await callKeychain(upstream);
      setLastCall(result);
      setOk(result.live);
      setMsg(`${upstream} ${result.live ? 'live' : 'failed'} · ${result.latency_ms.toFixed(0)}ms · cache ${result.cache}`);
    } catch (err) {
      setOk(false);
      setMsg(err instanceof Error ? err.message : 'Call failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[15px] text-[#8a96c2]">Balance · stored APIs · connection</p>
        <h2 className="text-[32px] leading-tight font-bold text-white mt-1">Keychain</h2>
      </div>

      <ExtensionTokenCopy />
      <ExtensionInstallHint variant="home" onOpenDocs={() => onGo('docs')} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-[#243365] bg-[#131c39] px-6 py-6">
          <p className="text-[16px] text-[#8a96c2]">SOL</p>
          <p className="text-[56px] font-bold tracking-tight text-white leading-none mt-3">{fmt(wallet?.sol)}</p>
          <p className="text-[15px] text-[#5e6a91] mt-3">{walletConnected ? 'Connected wallet' : 'Connect wallet to load'}</p>
          {!walletConnected && onConnectWallet && (
            <button type="button" onClick={onConnectWallet} className="mt-3 h-11 px-4 rounded-xl bg-white text-black text-[16px] font-semibold">Connect wallet</button>
          )}
        </div>
        <div className="rounded-2xl border border-[#243365] bg-[#131c39] px-6 py-6">
          <p className="text-[16px] text-[#8a96c2]">USDC</p>
          <p className="text-[56px] font-bold tracking-tight text-white leading-none mt-3">{fmt(wallet?.usdc)}</p>
          <p className="text-[15px] text-[#5e6a91] mt-3">{wallet?.rpc === 'helius-cache' ? `RPC cache ${wallet.cache}` : wallet?.rpc === 'public' ? 'Public RPC' : 'Waiting for address'}</p>
        </div>
        <div className="rounded-2xl border border-[#243365] bg-[#131c39] px-6 py-6">
          <p className="text-[16px] text-[#8a96c2]">Credit</p>
          <p className="text-[56px] font-bold tracking-tight text-white leading-none mt-3">${fmt(home?.ledger.balance_usd, 2)}</p>
          <p className="text-[15px] text-[#5e6a91] mt-3">Proxy ledger · free ${fmt(home?.ledger.free_credit_usd, 2)}</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[20px] font-semibold text-white">Stored APIs</h3>
          <button type="button" onClick={() => onGo('vault')} className="text-[15px] text-[#93b4ff] hover:underline">Vault →</button>
        </div>
        {apis.length === 0 ? (
          <p className="text-[16px] text-[#8a96c2]">None yet. Paste a key below, or install the Chrome extension (above) and save one from a provider page.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {apis.map((api) => (
              <div key={api.id} className="flex items-center gap-3 rounded-2xl border border-[#243365] bg-[#0e1631] px-4 py-3">
                <Key size={18} className="text-white" />
                <div>
                  <p className="text-[17px] font-semibold text-white">{api.upstream}</p>
                  <p className="text-[13px] font-mono text-[#8a96c2]">{api.prefix}</p>
                </div>
                <button
                  type="button"
                  data-testid={`api-call-${api.upstream}`}
                  disabled={busy !== null}
                  onClick={() => void runCall(api.upstream)}
                  className="ml-2 h-10 px-4 rounded-xl bg-white text-black text-[15px] font-semibold disabled:opacity-50"
                >
                  {busy === api.upstream ? 'Calling…' : 'Call'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-[20px] font-semibold text-white mb-3">Connection</h3>
        <div className="flex flex-wrap gap-3">
          <Pill ok={!!conn?.api && !error} label="API" sub={loading ? 'Connecting…' : error ? `Offline · ${error}` : `Online${homeMs != null ? ` · ${Math.round(homeMs)}ms` : ''}`} />
          <Pill ok={walletConnected && !!wallet?.address} label="Wallet" sub={wallet?.address ? `${wallet.address.slice(0, 4)}…${wallet.address.slice(-4)}` : 'Not connected'} />
          <div data-testid="passkey-pill">
            <Pill ok={passkey || vaultOpen} label="Passkey" sub={vaultOpen ? 'Device Vault open' : passkey ? 'Trusted on this device' : 'You keep the secret — unlock to verify'} />
          </div>
          <Pill ok={!!home?.plan} label={home?.plan?.name ?? 'Free'} sub={home?.plan?.auto_plugin ? (home.plan.low_latency ? 'Accelerate · cache on' : 'Plugin · biometric ZK') : 'Vault + passkeys · PAYG calls'} />
          <Pill ok={!!conn?.autosign} label="Autosign" sub={conn?.autosign ? 'Owner keystore ready' : 'Off'} />
          <Pill ok={home?.latency?.online !== false && (conn?.rpc === 'helius-cache' || conn?.rpc === 'public')} label="RPC" sub={`${home?.latency?.online === false ? 'Offline' : 'Online'}${home?.latency?.wallet_ms != null ? ` · ${Math.round(home.latency.wallet_ms)}ms` : ''} · ${conn?.lowest_ttl_sec ?? 2}s TTL`} />
        </div>
        <div className="flex flex-wrap gap-3 mt-4">
          {onUnlock && !vaultOpen && (
            <button
              type="button"
              onClick={onUnlock}
              disabled={unlocking}
              className="h-12 px-5 rounded-xl bg-white text-black text-[16px] font-semibold disabled:opacity-50"
            >
              {unlocking ? 'Unlocking…' : 'Unlock with passkey'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onGo('activity')}
            className="h-12 px-5 rounded-xl border border-[#243365] text-white text-[16px] font-semibold"
          >
            Plans →
          </button>
        </div>
      </div>

      <div
        data-testid="shop-demo-card"
        className={`rounded-2xl border bg-[#131c39] p-5 space-y-4 ${highlightShop ? 'border-emerald-700/80' : 'border-[#243365]'}`}
      >
        <div className="flex items-center gap-2">
          <Wallet size={18} className="text-white" />
          <h3 className="text-[20px] font-semibold text-white">Shop</h3>
        </div>
        <div className="rounded-xl border border-[#243365] bg-[#0e1631] px-4 py-4 space-y-2">
          <p className="text-[13px] uppercase tracking-wider text-[#8a96c2]">For sale · Solana Devnet</p>
          <p className="text-[22px] font-semibold text-white">{formatMicroUsdc(receipt.captureMicroUsdc)} USDC metered call</p>
          <p className="text-[15px] text-[#8a96c2]">
            Open 5.00 USDC escrow, capture {SHOP_MPP_USD.toFixed(2)} (ix 26).
            Not Raydium / Pump.fun <code className="text-white">$X402</code> / <code className="text-white">$M32</code>.
          </p>
          <p className="text-[28px] font-bold text-white" data-testid="shop-balance">${SHOP_MPP_USD.toFixed(2)}</p>
        </div>
        <MppReceiptCard receipt={receipt} />
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            data-testid="shop-buy-mpp"
            disabled={busy !== null}
            onClick={() => {
              setBusy('mpp');
              setMsg(null);
              void buyMppShopSku()
                .then((next) => {
                  setReceipt(next);
                  setOk(true);
                  setMsg(`Bought ${next.sku} · receipt ready`);
                  downloadMppReceipt(next, 'html');
                  onRefresh();
                })
                .catch((err) => { setOk(false); setMsg(err instanceof Error ? err.message : 'MPP shop failed'); })
                .finally(() => setBusy(null));
            }}
            className="h-11 px-5 rounded-xl bg-white text-black text-[15px] font-semibold disabled:opacity-50"
          >
            {busy === 'mpp' ? 'Settling…' : `Buy $${SHOP_MPP_USD.toFixed(2)} · get receipt`}
          </button>
          <button
            type="button"
            data-testid="shop-buy"
            disabled={busy !== null}
            onClick={() => {
              const before = home?.ledger.balance_usd ?? 0;
              setBusy('shop');
              setMsg(null);
              void apiFetch('/billing/topup', { method: 'POST', body: JSON.stringify({ amount_usd: SHOP_CREDIT_USD }) })
                .then(async (r) => {
                  const d = await r.json().catch(() => ({}));
                  if (!r.ok) throw new Error((d as { detail?: string }).detail ?? 'Shop credit failed');
                  const after = typeof (d as { balance_usd?: number }).balance_usd === 'number'
                    ? (d as { balance_usd: number }).balance_usd
                    : before + SHOP_CREDIT_USD;
                  setOk(true);
                  setMsg(`Bought ${SHOP_ITEM_NAME} (ledger, no Solana tx) · ${describeBalanceChange(before, after).label}`);
                  onRefresh();
                })
                .catch((err) => { setOk(false); setMsg(err instanceof Error ? err.message : 'Shop failed'); })
                .finally(() => setBusy(null));
            }}
            className="h-11 px-5 rounded-xl border border-zinc-500 text-white text-[15px] font-semibold disabled:opacity-50"
          >
            {busy === 'shop' ? 'Buying…' : `Ledger $${SHOP_CREDIT_USD.toFixed(2)}`}
          </button>
          <button
            type="button"
            data-testid="shop-rpc"
            disabled={busy !== null}
            onClick={() => {
              setBusy('rpc');
              setMsg(null);
              const addr = home?.wallet.address ?? '';
              const t0 = performance.now();
              void fetchKeychainHome(addr)
                .then(async (first) => {
                  const ms1 = performance.now() - t0;
                  const t1 = performance.now();
                  const second = await fetchKeychainHome(addr);
                  const ms2 = performance.now() - t1;
                  setOk(true);
                  setMsg(describeRpcPing(ms1, ms2, second.wallet.cache || first.wallet.cache, second.wallet.rpc));
                  onRefresh();
                })
                .catch((err) => { setOk(false); setMsg(err instanceof Error ? err.message : 'RPC ping failed'); })
                .finally(() => setBusy(null));
            }}
            className="h-11 px-5 rounded-xl border border-zinc-500 text-white text-[15px] font-semibold disabled:opacity-50"
          >
            {busy === 'rpc' ? 'Pinging…' : 'RPC speed check'}
          </button>
          <button
            type="button"
            onClick={() => onGo('activity')}
            className="h-11 px-5 rounded-xl border border-[#243365] text-white text-[15px] font-semibold"
          >
            Payments →
          </button>
        </div>
        {msg && (busy === 'mpp' || busy === 'shop' || busy === 'rpc' || !lastCall) && (
          <p data-testid="shop-msg" className={`text-[15px] ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</p>
        )}
        <div data-testid="shop-bazaar" className="rounded-xl border border-[#243365] bg-[#0e1631] px-4 py-4 space-y-3">
          <p className="text-[13px] uppercase tracking-wider text-[#8a96c2]">Third-party x402 · probed</p>
          <p className="text-[14px] text-[#8a96c2]">
            LIVE means Solana Devnet Circle USDC. KeyShield cannot settle these 402s.
            Not Raydium / <code className="text-white">$X402</code> / <code className="text-white">$M32</code>.
          </p>
          {[...BAZAAR_OFFERS, ...PAYAI_LIVE_EXTRAS].map((offer) => (
            <div
              key={offer.id}
              data-testid={`shop-bazaar-${offer.id}`}
              className="rounded-lg border border-[#243365] px-3 py-3 space-y-1"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span className={`text-[11px] font-semibold uppercase ${offer.status === 'LIVE' ? 'text-emerald-400' : 'text-[#f87171]'}`}>
                  {offer.status.replace('_', ' ')}
                </span>
                <span className="text-[15px] font-semibold text-white">{offer.name}</span>
                {offer.amountLabel && <span className="text-[13px] text-[#a8b3d8]">{offer.amountLabel}</span>}
              </div>
              <p className="text-[13px] text-[#8a96c2]">{offer.method} · {offer.detail}</p>
              <a
                href={offer.url}
                target="_blank"
                rel="noreferrer"
                className="text-[12px] text-[#93b4ff] hover:underline break-all"
              >
                {offer.url}
              </a>
            </div>
          ))}
        </div>
      </div>

      <div data-testid="nemotron-save-card" className="rounded-2xl border border-[#243365] bg-[#131c39] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Wallet size={18} className="text-white" />
          <h3 className="text-[20px] font-semibold text-white">OpenRouter · NVIDIA Nemotron</h3>
        </div>
        <p className="text-[15px] text-[#8a96c2]">
          Paste your own <code className="text-white">sk-or-…</code> from openrouter.ai/keys, Save to the vault, then Call.
          Default model is free{' '}
          <a href={OPENROUTER_MODEL_URL} target="_blank" rel="noreferrer" className="text-white hover:underline">{OPENROUTER_DEMO_MODEL}</a>.
          The number below is milliseconds this Call timed — not a marketing claim.
        </p>
        <textarea
          data-testid="key-paste"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={3}
          placeholder="sk-or-…  sk-proj-…  sk-ant-…  gsk_…  helius_auth_…"
          className="w-full rounded-xl bg-[#0e1631] border border-[#243365] px-4 py-3 text-[16px] font-mono text-white placeholder:text-[#3e4a72]"
        />
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[15px] text-[#a8b3d8]">
            {detected.matched ? `Detected ${detected.upstream} ${detected.prefix}` : paste.trim() ? 'Unrecognized shape — pick Vault to choose a provider' : 'Waiting for paste'}
          </span>
          <button
            type="button"
            data-testid="key-save"
            disabled={busy !== null || !paste.trim()}
            onClick={() => void savePaste()}
            className="h-11 px-5 rounded-xl bg-white text-black text-[15px] font-semibold disabled:opacity-50"
          >
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            data-testid="key-call"
            disabled={busy !== null || !detected.upstream}
            onClick={() => detected.upstream && void runCall(detected.upstream)}
            className="h-11 px-5 rounded-xl border border-zinc-500 text-white text-[15px] font-semibold disabled:opacity-50"
          >
            Call
          </button>
        </div>
        {msg && <p data-testid="key-msg" className={`text-[15px] ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</p>}
        {lastCall && (
          <p data-testid="call-latency" className="text-[16px] font-mono text-white">
            Timed on this call: {lastCall.latency_ms}ms · {lastCall.live ? 'live' : `status ${lastCall.status}`} · {lastCall.upstream} {lastCall.path} · cache {lastCall.cache}
            {lastCall.model ? ` · ${lastCall.model}` : ''}
          </p>
        )}
      </div>

      <div>
        <h3 className="text-[20px] font-semibold text-white mb-3">More</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { id: 'activity', title: 'Payments', sub: 'Open stream, meter, capture' },
            { id: 'developer', title: 'Framework snippets', sub: 'curl / Python / JS for every stored API' },
            { id: 'docs', title: 'Links & troubleshooting', sub: 'Extension, proxy, RPC cache' },
            { id: 'settings', title: 'Settings', sub: 'Passkey, sessions, account' },
          ].map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => onGo(row.id)}
              className="text-left rounded-2xl border border-[#243365] bg-[#0e1631] px-5 py-4 hover:border-white/30"
            >
              <div className="flex items-center justify-between">
                <p className="text-[18px] font-semibold text-white">{row.title}</p>
                <ArrowRight size={18} className="text-[#8a96c2]" />
              </div>
              <p className="text-[14px] text-[#8a96c2] mt-1">{row.sub}</p>
            </button>
          ))}
        </div>
      </div>

      <button type="button" onClick={onRefresh} className="text-[14px] text-[#8a96c2] hover:text-white inline-flex items-center gap-2">
        <Plug size={14} /> Refresh balances
      </button>
    </div>
  );
};
