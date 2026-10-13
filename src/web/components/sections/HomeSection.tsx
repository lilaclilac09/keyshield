import React, { useState } from 'react';
import { Plug } from 'lucide-react';
import { getPasskeyTrust } from '../../lib/auth';
import { describeRpcPing, SHOP_PROOF_CACHE_MS, SHOP_PROOF_WAN_MS } from '../../lib/shop-demo';
import { isVaultUnlocked } from '../../lib/vault-session';
import {
  callKeychain,
  fetchKeychainHome,
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
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [lastCall, setLastCall] = useState<KeychainCallResult | null>(null);
  const [rpcPing, setRpcPing] = useState<string | null>(null);

  const passkey = !!getPasskeyTrust();
  const vaultOpen = isVaultUnlocked();
  const wallet = home?.wallet;
  const apis = home?.apis ?? [];
  const conn = home?.connection;

  const runCall = async (upstream: string) => {
    setBusy(upstream); setMsg(null);
    try {
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
    <div className="space-y-8" data-testid="home-metrics">
      <div>
        <p className="text-[15px] text-[#8a96c2]">RPC ping · API call latency</p>
        <h2 className="text-[32px] leading-tight font-bold text-white mt-1">Speed</h2>
        <p className="text-[14px] text-[#8a96c2] mt-2">
          Metrics only. Purchases, explorer links, and receipts live in Payments.
        </p>
      </div>

      <section data-testid="home-metrics-strip" className="rounded-2xl border border-[#243365] bg-[#131c39] px-5 py-5 space-y-5">
        <p className="text-[13px] uppercase tracking-wider text-[#8a96c2]">1 · RPC</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-[40px] font-bold text-white leading-none tracking-tight">{SHOP_PROOF_CACHE_MS}ms</p>
            <p className="text-[13px] text-[#8a96c2] mt-2">Cache hit</p>
          </div>
          <div>
            <p className="text-[40px] font-bold text-white leading-none tracking-tight">{SHOP_PROOF_WAN_MS}ms</p>
            <p className="text-[13px] text-[#8a96c2] mt-2">WAN</p>
          </div>
          <div>
            <p className="text-[40px] font-bold text-white leading-none tracking-tight">
              {home?.latency?.wallet_ms != null ? `${Math.round(home.latency.wallet_ms)}ms` : '—'}
            </p>
            <p className="text-[13px] text-[#8a96c2] mt-2">Wallet ping</p>
          </div>
          <div>
            <p className="text-[40px] font-bold text-white leading-none tracking-tight">{conn?.lowest_ttl_sec ?? 2}s</p>
            <p className="text-[13px] text-[#8a96c2] mt-2">RPC TTL</p>
          </div>
        </div>
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
                const line = describeRpcPing(ms1, ms2, second.wallet.cache || first.wallet.cache, second.wallet.rpc);
                setOk(true);
                setRpcPing(line);
                setMsg(line);
                onRefresh();
              })
              .catch((err) => { setOk(false); setMsg(err instanceof Error ? err.message : 'RPC ping failed'); })
              .finally(() => setBusy(null));
          }}
          className="h-11 px-5 rounded-xl border border-zinc-500 text-white text-[15px] font-semibold disabled:opacity-50"
        >
          {busy === 'rpc' ? 'Pinging…' : 'RPC speed check'}
        </button>
        {rpcPing && <p data-testid="shop-msg" className="text-[15px] text-emerald-400">{rpcPing}</p>}
      </section>

      <section className="rounded-2xl border border-[#243365] bg-[#131c39] px-5 py-5 space-y-5">
        <p className="text-[13px] uppercase tracking-wider text-[#8a96c2]">2 · API call</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-[40px] font-bold text-white leading-none tracking-tight">
              {lastCall ? `${Math.round(lastCall.latency_ms)}ms` : '—'}
            </p>
            <p className="text-[13px] text-[#8a96c2] mt-2">Last call</p>
          </div>
          <div>
            <p className="text-[40px] font-bold text-white leading-none tracking-tight">
              {homeMs != null ? `${Math.round(homeMs)}ms` : '—'}
            </p>
            <p className="text-[13px] text-[#8a96c2] mt-2">Health</p>
          </div>
          <div>
            <p className="text-[20px] font-semibold text-white leading-tight mt-1">
              {lastCall ? `${lastCall.upstream} · ${lastCall.cache}` : 'No call yet'}
            </p>
            <p className="text-[13px] text-[#8a96c2] mt-2">Upstream / cache</p>
          </div>
        </div>
        {apis.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {apis.slice(0, 6).map((api) => (
              <button
                key={api.id}
                type="button"
                data-testid={`api-call-${api.upstream}`}
                disabled={busy !== null}
                onClick={() => void runCall(api.upstream)}
                className="h-10 px-4 rounded-xl bg-white text-black text-[14px] font-semibold disabled:opacity-50"
              >
                {busy === api.upstream ? 'Calling…' : `Call ${api.upstream}`}
              </button>
            ))}
          </div>
        )}
        {lastCall && (
          <p data-testid="call-latency" className="text-[16px] font-mono text-white">
            Timed on this call: {lastCall.latency_ms}ms · {lastCall.live ? 'live' : `status ${lastCall.status}`} · {lastCall.upstream} {lastCall.path} · cache {lastCall.cache}
          </p>
        )}
        {msg && busy !== 'rpc' && (
          <p data-testid="key-msg" className={`text-[15px] ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</p>
        )}
      </section>

      <section className="space-y-4">
        <p className="text-[13px] uppercase tracking-wider text-[#8a96c2]">3 · Status</p>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-2xl border border-[#243365] bg-[#131c39] px-5 py-4">
            <p className="text-[13px] text-[#8a96c2]">SOL</p>
            <p className="text-[28px] font-bold text-white leading-none mt-2">{fmt(wallet?.sol)}</p>
          </div>
          <div className="rounded-2xl border border-[#243365] bg-[#131c39] px-5 py-4">
            <p className="text-[13px] text-[#8a96c2]">USDC</p>
            <p className="text-[28px] font-bold text-white leading-none mt-2">{fmt(wallet?.usdc)}</p>
          </div>
          <div className="rounded-2xl border border-[#243365] bg-[#131c39] px-5 py-4">
            <p className="text-[13px] text-[#8a96c2]">Credit</p>
            <p className="text-[28px] font-bold text-white leading-none mt-2">${fmt(home?.ledger.balance_usd, 2)}</p>
          </div>
        </div>
        {!walletConnected && onConnectWallet && (
          <button type="button" onClick={onConnectWallet} className="h-11 px-4 rounded-xl bg-white text-black text-[16px] font-semibold">Connect wallet</button>
        )}
        <div className="flex flex-wrap gap-3">
          <Pill ok={!!conn?.api && !error} label="API" sub={loading ? 'Connecting…' : error ? `Offline · ${error}` : `Online${homeMs != null ? ` · ${Math.round(homeMs)}ms` : ''}`} />
          <Pill ok={walletConnected && !!wallet?.address} label="Wallet" sub={wallet?.address ? `${wallet.address.slice(0, 4)}…${wallet.address.slice(-4)}` : 'Not connected'} />
          <div data-testid="passkey-pill">
            <Pill ok={passkey || vaultOpen} label="Passkey" sub={vaultOpen ? 'Device Vault open' : passkey ? 'Trusted on this device' : 'Unlock to verify'} />
          </div>
          <Pill ok={home?.latency?.online !== false && (conn?.rpc === 'helius-cache' || conn?.rpc === 'public')} label="RPC" sub={`${home?.latency?.online === false ? 'Offline' : 'Online'} · ${wallet?.rpc === 'helius-cache' ? `cache ${wallet.cache}` : wallet?.rpc || '—'}`} />
        </div>
        <div className="flex flex-wrap gap-3">
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
            Payments →
          </button>
          <button
            type="button"
            onClick={() => onGo('troubleshooting')}
            className="h-12 px-5 rounded-xl border border-[#243365] text-white text-[16px] font-semibold"
          >
            Troubleshooting →
          </button>
        </div>
      </section>

      <button type="button" onClick={onRefresh} className="text-[14px] text-[#8a96c2] hover:text-white inline-flex items-center gap-2">
        <Plug size={14} /> Refresh
      </button>
    </div>
  );
};
