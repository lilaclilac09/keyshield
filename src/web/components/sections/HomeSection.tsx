import React, { useState } from 'react';
import { Key, Wallet, Plug, ArrowRight } from 'lucide-react';
import { getPasskeyTrust } from '../../lib/auth';
import { isVaultUnlocked } from '../../lib/vault-session';
import {
  callKeychain,
  detectUpstream,
  extractDetectedKey,
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
  onUnlock?: () => void;
  unlocking?: boolean;
  onGo: (section: string) => void;
}

function fmt(n: number | null | undefined, digits = 4): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

const Pill: React.FC<{ ok: boolean; label: string; sub?: string }> = ({ ok, label, sub }) => (
  <div className={`flex-1 min-w-[140px] rounded-2xl border px-4 py-3 ${ok ? 'border-emerald-900/50 bg-emerald-950/20' : 'border-[#243365] bg-[#0e1631]'}`}>
    <div className="flex items-center gap-2">
      <span className={`w-2.5 h-2.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-[#5e6a91]'}`} />
      <span className="text-[16px] font-semibold text-white">{label}</span>
    </div>
    {sub && <p className="text-[13px] text-[#8a96c2] mt-1">{sub}</p>}
  </div>
);

export const HomeSection: React.FC<Props> = ({
  home, loading, error, homeMs, walletConnected, onRefresh, onUnlock, unlocking, onGo,
}) => {
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState<'save' | 'call' | string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [lastCall, setLastCall] = useState<KeychainCallResult | null>(null);

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-[#243365] bg-[#131c39] px-5 py-5">
          <p className="text-[15px] text-[#8a96c2]">SOL</p>
          <p className="text-[36px] font-bold tracking-tight text-white leading-none mt-2">{fmt(wallet?.sol)}</p>
          <p className="text-[14px] text-[#5e6a91] mt-2">{walletConnected ? 'Connected wallet' : 'Connect wallet to load'}</p>
        </div>
        <div className="rounded-2xl border border-[#243365] bg-[#131c39] px-5 py-5">
          <p className="text-[15px] text-[#8a96c2]">USDC</p>
          <p className="text-[36px] font-bold tracking-tight text-white leading-none mt-2">{fmt(wallet?.usdc)}</p>
          <p className="text-[14px] text-[#5e6a91] mt-2">{wallet?.rpc === 'helius-cache' ? `RPC cache ${wallet.cache}` : wallet?.rpc === 'public' ? 'Public RPC' : 'Waiting for address'}</p>
        </div>
        <div className="rounded-2xl border border-[#243365] bg-[#131c39] px-5 py-5">
          <p className="text-[15px] text-[#8a96c2]">Credit</p>
          <p className="text-[36px] font-bold tracking-tight text-white leading-none mt-2">${fmt(home?.ledger.balance_usd, 2)}</p>
          <p className="text-[14px] text-[#5e6a91] mt-2">Proxy ledger · free ${fmt(home?.ledger.free_credit_usd, 2)}</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[20px] font-semibold text-white">Stored APIs</h3>
          <button type="button" onClick={() => onGo('vault')} className="text-[15px] text-[#93b4ff] hover:underline">Vault →</button>
        </div>
        {apis.length === 0 ? (
          <p className="text-[16px] text-[#8a96c2]">None yet. Paste a key below or let the extension save one from a provider page.</p>
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
          <Pill ok={passkey || vaultOpen} label="Passkey" sub={vaultOpen ? 'Device Vault open' : passkey ? 'Trusted on this device' : 'You keep the secret — unlock to verify'} />
          <Pill ok={!!conn?.autosign} label="Autosign" sub={conn?.autosign ? 'Owner keystore ready' : 'Off'} />
          <Pill ok={home?.latency?.online !== false && (conn?.rpc === 'helius-cache' || conn?.rpc === 'public')} label="RPC" sub={`${home?.latency?.online === false ? 'Offline' : 'Online'}${home?.latency?.wallet_ms != null ? ` · ${Math.round(home.latency.wallet_ms)}ms` : ''} · ${conn?.lowest_ttl_sec ?? 2}s TTL`} />
        </div>
        {onUnlock && !vaultOpen && (
          <button
            type="button"
            onClick={onUnlock}
            disabled={unlocking}
            className="mt-4 h-12 px-5 rounded-xl bg-white text-black text-[16px] font-semibold disabled:opacity-50"
          >
            {unlocking ? 'Unlocking…' : 'Unlock with passkey'}
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-[#243365] bg-[#131c39] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Wallet size={18} className="text-white" />
          <h3 className="text-[20px] font-semibold text-white">Paste → detect → one-click call</h3>
        </div>
        <p className="text-[15px] text-[#8a96c2]">
          Paste a key, or save one from the page via the extension. Agent passwords and private keys stay on your device — passkey / PRF verifies without the server seeing plaintext. Frameworks use <code className="text-white">/vproxy/…</code>.
        </p>
        <textarea
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
          <button type="button" disabled={busy !== null || !paste.trim()} onClick={() => void savePaste()} className="h-11 px-5 rounded-xl bg-white text-black text-[15px] font-semibold disabled:opacity-50">
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            disabled={busy !== null || !detected.upstream}
            onClick={() => detected.upstream && void runCall(detected.upstream)}
            className="h-11 px-5 rounded-xl border border-zinc-500 text-white text-[15px] font-semibold disabled:opacity-50"
          >
            Call
          </button>
        </div>
        {msg && <p className={`text-[15px] ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</p>}
        {lastCall && (
          <p className="text-[14px] font-mono text-[#8a96c2]">
            {lastCall.upstream} {lastCall.path} · {lastCall.latency_ms}ms · {lastCall.cache} · {lastCall.key_prefix}
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
