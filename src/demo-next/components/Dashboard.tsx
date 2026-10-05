'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletProviders } from './WalletProviders';
import { WalletButton } from './WalletButton';
import { useKeyShield } from '@/lib/useKeyShield';
import { planVerifyExecute } from '@/lib/onchain';
import { pingDevnetSlot } from '@/lib/rpc-ping';
import { shortHex } from '@/lib/bytes';
import { STATE_LABEL, VAULT_STATES, canRetryUi, formatLatencyMs } from '@/lib/vaultState';
import { ROLLBACK_LABEL } from '@/lib/errors';
import { TRUST } from '@/lib/trust';
import {
  demoTopup,
  ensureDemoSession,
  fetchHome,
  fmt,
  listAgents,
  listStreams,
  pingHealth,
  shortAddr,
  type KeychainHome,
  type StreamLog,
} from '@/lib/ks';

type CredRow = {
  id: string;
  name: string;
  upstream: string;
  prefix: string;
  stored: boolean;
};

const FALLBACK_CREDS: CredRow[] = [
  { id: 'openrouter', name: 'OpenRouter API', upstream: 'openrouter', prefix: 'sk-or-…', stored: false },
  { id: 'brave', name: 'Brave Search API', upstream: 'brave', prefix: 'BSA-…', stored: false },
  { id: 'llm-proxy', name: 'Custom LLM Proxy', upstream: 'openai', prefix: 'sk-proj-…', stored: false },
];

const AGENT_METHODS = [
  { id: 'proxy.call', label: 'proxy.call — inject vault key once, never persist', danger: false },
  { id: 'mpp.meter', label: 'mpp.meter — 2-phase hold (pending artifact)', danger: false },
  { id: 'mpp.capture', label: 'mpp.capture — Ed25519 session MAC settle', danger: false },
  { id: 'fulfill.502', label: 'upstream 502 — abort hold, no debit', danger: false },
  { id: 'fulfill.empty', label: 'empty payload — abort hold, no debit', danger: false },
  { id: 'fulfill.mismatch', label: 'artifact hash mismatch — abort, no debit', danger: false },
  { id: 'fulfill.clawback', label: 'dispute timeout — force_clawback refund', danger: false },
  {
    id: 'export.session-key',
    label: 'Export Temporary Session Private Key / High-Value Sign',
    danger: true,
  },
];

function DashboardInner() {
  const wallet = useWallet();
  const address = wallet.publicKey?.toBase58() || '';
  const ks = useKeyShield();
  const pollPendingRef = React.useRef(ks.pollPending);
  pollPendingRef.current = ks.pollPending;

  const [home, setHome] = useState<KeychainHome | null>(null);
  const [rpcMs, setRpcMs] = useState<number | null>(null);
  const [rpcOk, setRpcOk] = useState(false);
  const [slot, setSlot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [streams, setStreams] = useState<StreamLog[]>([]);
  const [agents, setAgents] = useState<{ name: string; pubkey_b58: string }[]>([]);
  const [modal, setModal] = useState<null | { method: string }>(null);

  const reload = useCallback(async () => {
    const data = await fetchHome(address || undefined);
    setHome(data);
    return data;
  }, [address]);

  const ping = useCallback(async () => {
    try {
      const [healthMs, devnet] = await Promise.all([pingHealth(), pingDevnetSlot()]);
      setRpcMs(devnet.ms || healthMs);
      setSlot(devnet.slot);
      setRpcOk(true);
      await pollPendingRef.current();
    } catch {
      setRpcOk(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureDemoSession();
        if (cancelled) return;
        await reload();
        const [s, a] = await Promise.all([listStreams(), listAgents()]);
        if (!cancelled) {
          setStreams(s);
          setAgents(a);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    void ping();
    const id = setInterval(() => void ping(), 3000);
    return () => clearInterval(id);
  }, [ping]);

  useEffect(() => {
    if (ks.snapshot.failKind === 'chain-failed') void reload();
  }, [ks.snapshot.failKind, ks.snapshot.chainError?.code, reload]);

  const creds = useMemo<CredRow[]>(() => {
    const stored = (home?.apis || []).map((a) => ({
      id: a.id,
      name: a.name,
      upstream: a.upstream,
      prefix: a.prefix,
      stored: true,
    }));
    const extra = FALLBACK_CREDS.filter((f) => !stored.some((s) => s.upstream === f.upstream || s.id === f.id));
    return [...stored, ...extra];
  }, [home]);

  const onTopup = async () => {
    setBusy('topup');
    setError(null);
    try {
      await demoTopup(5);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onPasskeyDecrypt = async (row: CredRow) => {
    setBusy(`prf:${row.id}`);
    await ks.decryptCredential(row, 'human');
    setBusy(null);
  };

  const onAgentGrant = async (row: CredRow) => {
    setBusy(`grant:${row.id}`);
    await ks.decryptCredential(row, 'agent');
    setBusy(null);
  };

  const onSimulate = (method = 'export.session-key') => {
    ks.resetPendingUi();
    setModal({ method });
  };

  const onAuthorize = async () => {
    const agentId = agents[0]?.name || 'demo-agent';
    const open = streams.find((s) => s.status === 'open');
    await ks.authorizeAgent({
      method: modal?.method || 'export.session-key',
      agentId,
      spendCap: 5000n,
      slot: BigInt(slot || 0),
      streamId: open?.id,
    });
  };

  const sol = home?.wallet.sol ?? null;
  const usdc = home?.wallet.usdc ?? null;
  const escrow = home?.ledger.balance_usd ?? 0;
  const pingText = formatLatencyMs(rpcMs);
  const banner = error || ks.snapshot.error;
  const prf = ks.snapshot.prf;
  const proof = ks.snapshot.proof;
  const planned = proof ? planVerifyExecute(proof, proof.publicInputs.spendCap) : null;
  const lastTx = ks.snapshot.lastTx;

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      <header className="shrink-0 border-b border-zinc-800 px-6 py-3 flex items-center justify-between gap-4">
        <div>
          <div className="text-[11px] tracking-[0.28em] text-zinc-500 uppercase">KeyShield</div>
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight">
            KeyShield // Zero-Knowledge Agent Vault
          </h1>
          <div className="font-mono text-[11px] text-zinc-500 mt-1">
            state={ks.snapshot.state} · {STATE_LABEL[ks.snapshot.state]}
            {prf ? ` · prf=${prf.source}/${prf.verifyLayer}` : ''}
            {slot != null ? ` · slot=${slot}` : ''}
          </div>
        </div>
        <WalletButton />
      </header>

      {banner && (
        <div className="shrink-0 px-6 py-2 text-sm text-red-300 border-b border-red-900/60 bg-red-950/40">
          {ks.snapshot.failKind ? `[${ks.snapshot.failKind}] ` : ''}
          {banner}
          {canRetryUi(ks.snapshot.state, ks.snapshot.pendingLocked, ks.snapshot.confirmation) && (
            <button type="button" className="ml-3 underline" onClick={() => ks.resetPendingUi()}>
              Retry
            </button>
          )}
          {(ks.snapshot.pendingLocked || ks.snapshot.confirmation === 'unknown') && (
            <span className="ml-3 text-amber-300">Retry locked · polling {ks.snapshot.lastTx.signature || 'sig'}</span>
          )}
        </div>
      )}

      <div className="shrink-0 px-6 py-1.5 border-b border-zinc-800 text-[11px] font-mono text-zinc-500 flex flex-wrap gap-x-4 gap-y-1">
        <span>Passkey: {TRUST.passkeyNote}</span>
        <span>Proof: {TRUST.proofNote}</span>
        <span>Keys: {TRUST.apiKeyNote}</span>
        <span>Wallet: {TRUST.walletNote}</span>
        {ks.snapshot.rollbackKind && <span className="text-amber-300">rollback: {ROLLBACK_LABEL[ks.snapshot.rollbackKind]}</span>}
      </div>

      <main className="flex-1 min-h-0 overflow-auto p-5 grid grid-cols-12 gap-4 content-start">
        <section className="col-span-12 lg:col-span-5 border border-zinc-800 bg-zinc-950 p-5 flex flex-col">
          <div className="text-[11px] tracking-[0.22em] text-zinc-500 uppercase mb-3">Wallet & Escrow</div>
          <div className="grid grid-cols-3 gap-4 flex-1">
            <div>
              <div className="text-zinc-500 text-sm">SOL</div>
              <div className="text-5xl font-semibold tabular-nums leading-none mt-1">{fmt(sol, 3)}</div>
              <div className="text-zinc-600 font-mono text-xs mt-2">{shortAddr(address || home?.wallet.address)}</div>
            </div>
            <div>
              <div className="text-zinc-500 text-sm">Escrow USDC</div>
              <div className="text-5xl font-semibold tabular-nums leading-none mt-1">{fmt(escrow, 2)}</div>
              <div className="text-zinc-600 text-xs mt-2">on-chain USDC {fmt(usdc, 2)}</div>
            </div>
            <div>
              <div className="text-zinc-500 text-sm flex items-center gap-2">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${rpcOk ? 'bg-emerald-400' : 'bg-red-500'}`} />
                Devnet RPC
              </div>
              <div className="text-5xl font-semibold tabular-nums leading-none mt-1">{pingText}</div>
              <div className="text-zinc-600 text-xs mt-2">getLatestBlockhash · 3s</div>
            </div>
          </div>
          <ol className="mt-4 flex flex-wrap gap-1.5 font-mono text-[10px] uppercase tracking-wide">
            {VAULT_STATES.map((s) => (
              <li
                key={s}
                className={`border px-1.5 py-0.5 ${
                  ks.snapshot.state === s
                    ? s === 'FAILED'
                      ? 'border-red-600 text-red-300'
                      : s === 'SETTLED'
                        ? 'border-emerald-600 text-emerald-300'
                        : 'border-amber-600 text-amber-200'
                    : 'border-zinc-800 text-zinc-600'
                }`}
              >
                {s}
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => void onTopup()}
            disabled={busy === 'topup' || ks.snapshot.pendingLocked}
            className="mt-4 h-11 border border-zinc-700 bg-zinc-900 text-zinc-100 text-sm tracking-wide uppercase hover:bg-zinc-800 disabled:opacity-50"
          >
            {busy === 'topup' ? 'Crediting…' : 'Top-up Escrow'}
          </button>
        </section>

        <section className="col-span-12 lg:col-span-7 border border-zinc-800 bg-zinc-950 p-5 flex flex-col min-h-0">
          <div className="text-[11px] tracking-[0.22em] text-zinc-500 uppercase mb-3">
            Detected API Credentials
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-left">
              <thead className="text-zinc-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="pb-2 font-medium">Provider</th>
                  <th className="pb-2 font-medium">Prefix</th>
                  <th className="pb-2 font-medium text-right">Passkey</th>
                </tr>
              </thead>
              <tbody>
                {creds.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-800">
                    <td className="py-3">
                      <div className="text-base">{row.name}</div>
                      <div className="text-zinc-600 text-xs font-mono">{row.upstream}</div>
                    </td>
                    <td className="py-3 font-mono text-zinc-300">{row.prefix}</td>
                    <td className="py-3 text-right">
                      {(() => {
                        const grant = ks.snapshot.grants.find((g) => g.id === row.id || g.upstream === row.upstream);
                        return (
                          <div className="flex flex-col items-end gap-1">
                            {ks.snapshot.pasted[row.id] && (
                              <span className="text-emerald-400 text-sm font-medium">[Decrypted & Pasted]</span>
                            )}
                            {grant && (
                              <span className="text-emerald-300/80 text-xs font-mono">
                                grant {Math.ceil(grant.ttlMs / 1000)}s
                              </span>
                            )}
                            <div className="inline-flex gap-2">
                              {!ks.snapshot.pasted[row.id] && (
                                <button
                                  type="button"
                                  onClick={() => void onPasskeyDecrypt(row)}
                                  disabled={busy === `prf:${row.id}` || ks.snapshot.pendingLocked}
                                  className="h-9 px-3 border border-zinc-700 text-xs uppercase tracking-wide hover:bg-zinc-900 disabled:opacity-50"
                                >
                                  {ks.snapshot.state === 'AWAITING_PASSKEY' && busy === `prf:${row.id}`
                                    ? 'Touch ID…'
                                    : 'One-Click Passkey'}
                                </button>
                              )}
                              {ks.snapshot.pasted[row.id] && (
                                <span className="inline-flex h-9 items-center px-3 border border-emerald-600 bg-emerald-950/40 text-emerald-300 text-xs uppercase tracking-wide">
                                  One-Click Passkey
                                </span>
                              )}
                              {!grant && (
                                <button
                                  type="button"
                                  onClick={() => void onAgentGrant(row)}
                                  disabled={busy === `grant:${row.id}` || ks.snapshot.pendingLocked}
                                  className="h-9 px-3 border border-zinc-700 text-xs uppercase tracking-wide hover:bg-zinc-900 disabled:opacity-50"
                                >
                                  {ks.snapshot.state === 'AWAITING_PASSKEY' && busy === `grant:${row.id}`
                                    ? 'Touch ID…'
                                    : 'Inject 300s'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {prf && (
            <div className="mt-3 font-mono text-[11px] text-zinc-500">
              HKDF session + witness · commit {shortHex(prf.witnessCommitment)} · vault {shortHex(prf.vaultId, 8)}
            </div>
          )}
        </section>

        <section className="col-span-12 border border-zinc-800 bg-zinc-950 p-5 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] tracking-[0.22em] text-zinc-500 uppercase">
              Agent Sandbox & Sensitive Methods
            </div>
            <button
              type="button"
              onClick={() => onSimulate()}
              disabled={ks.snapshot.pendingLocked}
              className="h-10 px-4 border border-amber-700/70 text-amber-200 text-xs uppercase tracking-wide hover:bg-amber-950/40 disabled:opacity-50"
            >
              Simulate Agent Request
            </button>
          </div>
          <ul className="space-y-2 overflow-auto">
            {AGENT_METHODS.map((m) => (
              <li
                key={m.id}
                className={`flex items-center justify-between border px-3 py-2 ${
                  m.danger ? 'border-amber-800/80 bg-amber-950/20' : 'border-zinc-800'
                }`}
              >
                <div>
                  <div className="text-base">{m.label}</div>
                  {m.danger && (
                    <span className="inline-block mt-1 text-[10px] uppercase tracking-widest border border-amber-600 text-amber-300 px-1.5 py-0.5">
                      Warning · session keypair only · never master wallet
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onSimulate(m.id)}
                  className="text-xs uppercase tracking-wide text-zinc-400 hover:text-zinc-100"
                >
                  Request
                </button>
              </li>
            ))}
          </ul>
          {agents.length > 0 && (
            <div className="mt-3 text-xs font-mono text-zinc-500">
              registered {agents.length}: {agents.map((a) => a.name).join(' · ')}
            </div>
          )}
        </section>
      </main>

      <footer className="shrink-0 border-t border-zinc-800">
        <button
          type="button"
          onClick={() => setDrawer((d) => !d)}
          className="w-full h-10 text-xs uppercase tracking-[0.2em] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
        >
          {drawer ? 'Hide' : 'View'} Verification & Monotonic State Logs
        </button>
        {drawer && (
          <div className="max-h-48 overflow-auto border-t border-zinc-800 px-5 py-3 font-mono text-xs text-zinc-400 space-y-2">
            {proof && (
              <div className="space-y-1">
                <div>
                  public: agent={proof.publicInputs.agentId} · action={shortHex(proof.publicInputs.actionHash)} ·
                  cap={proof.publicInputs.spendCap} · until={proof.publicInputs.validUntilSlot}
                </div>
                <div>
                  proof={proof.kind} (not Groth16) · nullifier={shortHex(proof.publicInputs.nullifier)} ·
                  root={shortHex(proof.publicInputs.merkleRoot)} · cred={shortHex(proof.publicInputs.credentialCommitment)}
                </div>
                <div>
                  constraints: merkle={proof.constraints.merkleMember ? 'ok' : 'fail'} ·
                  cap={proof.constraints.withinCap ? 'ok' : 'fail'} ·
                  window={proof.constraints.withinWindow ? 'ok' : 'fail'} ·
                  nullifier={proof.constraints.nullifierBound ? 'ok' : 'fail'}
                </div>
              </div>
            )}
            {planned && (
              <div>
                planned ixs: {planned.ixs.map((i) => i.name).join(' → ')} · verifier={planned.verifier}
              </div>
            )}
            <div>breakpoint={ks.snapshot.breakpointLine}</div>
            {ks.snapshot.chainError && (
              <div>
                chain={ks.snapshot.chainError.name}
                {ks.snapshot.chainError.code != null ? ` ${ks.snapshot.chainError.code}` : ''}
              </div>
            )}
            <div>
              tx={lastTx.layer}
              {lastTx.signature ? ` · sig=${lastTx.signature.slice(0, 12)}…` : ' · no-sig'}
              {lastTx.explorer ? ` · ${lastTx.explorer}` : ''} · {lastTx.note}
            </div>
            <div>
              settlement={ks.snapshot.settlement} · hold={ks.snapshot.holdId || '—'}
              {ks.snapshot.hold
                ? ` · status=${ks.snapshot.hold.status} · debit=${ks.snapshot.hold.debit} · until=${ks.snapshot.hold.disputeTimeoutSlot} · released=${ks.snapshot.hold.released ? 'yes' : 'no'}`
                : ''}
              {ks.snapshot.grants.length
                ? ` · grant ${ks.snapshot.grants.map((g) => `${g.upstream}:${Math.ceil(g.ttlMs / 1000)}s`).join(',')}`
                : ' · grant none'}
            </div>
            <button
              type="button"
              onClick={() => ks.revoke()}
              className="h-8 px-3 border border-zinc-700 text-[11px] uppercase tracking-wide hover:bg-zinc-900"
            >
              Revoke grants (not chain rollback)
            </button>
            {ks.snapshot.hold?.status === 'in-flight' && (
              <button
                type="button"
                onClick={() => ks.forceClawback(BigInt(slot ?? 0))}
                className="h-8 px-3 border border-zinc-700 text-[11px] uppercase tracking-wide hover:bg-zinc-900"
              >
                Force clawback (slot {slot ?? 0})
              </button>
            )}
            {streams.slice(0, 6).map((s) => (
              <div key={s.id} className="flex flex-wrap gap-x-4">
                <span>#{s.id}</span>
                <span className="text-zinc-200">{s.status}</span>
                <span>artifact={s.pending_artifact_hash || '—'}</span>
                <span>pda={shortAddr(s.stream_pda)}</span>
                <span>
                  clawback={
                    ks.snapshot.hold?.status === 'clawback'
                      ? 'refunded'
                      : s.status === 'closed' || s.status === 'settled'
                        ? 'armed'
                        : 'in-flight'
                  }
                </span>
              </div>
            ))}
          </div>
        )}
      </footer>

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6">
          <div className="w-full max-w-lg border border-amber-700 bg-zinc-950 p-6">
            <div className="text-[11px] tracking-[0.22em] text-amber-400 uppercase">Passkey verification</div>
            <h2 className="text-2xl font-semibold mt-2">Authorize agent</h2>
            <p className="text-zinc-400 mt-3 text-sm leading-relaxed">
              <span className="text-zinc-100 font-mono">{modal.method}</span> needs WebAuthn PRF → HKDF
              witness. Hardware key never leaves the chip. On-chain Passkey verify is{' '}
              <span className="text-amber-200">client-layer only</span> until the Groth16 ix ships.
            </p>
            <p className="text-zinc-500 text-xs font-mono mt-2">state={ks.snapshot.state}</p>
            {ks.snapshot.state === 'SETTLED' && (
              <div className="text-emerald-400 mt-4 space-y-1">
                <p>
                  Authorized · {prf?.source} PRF · proof {proof?.kind} · settlement {ks.snapshot.settlement}
                </p>
                <p className="font-mono text-xs text-emerald-200/80">{lastTx.note}</p>
                {lastTx.explorer ? (
                  <a className="underline text-sm" href={lastTx.explorer} target="_blank" rel="noreferrer">
                    Explorer {lastTx.signature?.slice(0, 8)}…
                  </a>
                ) : (
                  <p className="text-xs text-zinc-400">no Devnet signature — {lastTx.layer}</p>
                )}
              </div>
            )}
            {ks.snapshot.state === 'FAILED' && (
              <p className="text-red-400 mt-4 font-mono text-sm">
                {ks.snapshot.failKind}: {ks.snapshot.error}
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => void onAuthorize()}
                disabled={ks.snapshot.pendingLocked || ks.snapshot.state === 'AWAITING_PASSKEY' || ks.snapshot.state === 'GENERATING_PROOF'}
                className="flex-1 h-12 border border-amber-600 bg-amber-950/40 text-amber-100 uppercase tracking-wide text-sm hover:bg-amber-900/40 disabled:opacity-50"
              >
                {ks.snapshot.state === 'AWAITING_PASSKEY'
                  ? 'Waiting…'
                  : ks.snapshot.state === 'GENERATING_PROOF'
                    ? 'Proving…'
                    : ks.snapshot.state === 'HOLDING'
                      ? 'Holding…'
                      : ks.snapshot.state === 'SUBMITTING_DEVNET'
                        ? 'Submitting…'
                        : 'Verify with Passkey'}
              </button>
              <button
                type="button"
                onClick={() => setModal(null)}
                disabled={ks.snapshot.pendingLocked}
                className="h-12 px-4 border border-zinc-700 text-sm uppercase tracking-wide disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  return (
    <WalletProviders>
      <DashboardInner />
    </WalletProviders>
  );
}
