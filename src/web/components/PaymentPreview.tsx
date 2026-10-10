import React, { useState } from 'react';
import { Button } from './ui/Button';
import { fetch402Preview, pay402Preview, parseMicroAmount, type X402Preview } from '../lib/x402-preview';
import { captureMppStream, recordMppUsage } from '../lib/api';
import { getToken } from '../lib/auth';
import { signArtifactMac } from '../lib/capture-mac';
import { explorerTxUrl } from '../lib/solana';
import { PaymentBadge } from './ui/PaymentBadge';

interface Props {
  streamId?: number;
  defaultAmount?: number;
  defaultMax?: number;
}

export const PaymentPreview: React.FC<Props> = ({ streamId, defaultAmount = 1, defaultMax = 1000 }) => {
  const [amount, setAmount] = useState(String(defaultAmount));
  const [maxAmount, setMaxAmount] = useState(String(defaultMax));
  const [preview, setPreview] = useState<X402Preview | null>(null);
  const [busy, setBusy] = useState<'details' | 'pay' | null>(null);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const [explorer, setExplorer] = useState('');
  const [mode, setMode] = useState<string>('');

  const runDetails = async () => {
    setBusy('details'); setMsg(''); setOk(false); setExplorer('');
    try {
      const amt = parseMicroAmount(amount);
      const cap = parseMicroAmount(maxAmount);
      const body = await fetch402Preview({ amountMicroUsdc: amt, maxAmountMicroUsdc: cap });
      setPreview(body);
      if (body.over_cap) {
        setMsg(`over cap: ${body.amount_micro_usdc} > --max-amount ${body.max_amount_micro_usdc}`);
        setOk(false);
      } else {
        setMsg('details ready — review the 402 body, then Pay');
        setOk(true);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'details failed');
      setOk(false);
    } finally {
      setBusy(null);
    }
  };

  const runPay = async () => {
    setBusy('pay'); setMsg(''); setOk(false);
    try {
      const amt = parseMicroAmount(amount);
      const cap = parseMicroAmount(maxAmount);
      if (cap > 0 && amt > cap) {
        throw new Error(`amount ${amt} exceeds --max-amount ${cap}`);
      }
      const paid = await pay402Preview({
        amountMicroUsdc: amt,
        maxAmountMicroUsdc: cap,
        streamId,
      });
      if (!paid.ok) {
        throw new Error(paid.detail || 'pay rejected');
      }
      let settle = paid.settle_mode || '';
      let sig = paid.signature || '';
      if (streamId && !paid.artifact_hash) {
        const token = getToken();
        if (!token) throw new Error('session token missing');
        const recorded = await recordMppUsage(streamId, {
          tokens: 1,
          calls: 1,
          status_code: 200,
          body: { choices: [{ message: { content: 'demo' } }], usage: { total_tokens: 1 } },
        });
        const hash = recorded.stream?.artifact_hash;
        if (!hash) throw new Error('record returned no artifact_hash');
        const mac = await signArtifactMac(token, hash);
        const captured = await captureMppStream(streamId, hash, mac);
        settle = captured.stream?.settle_mode || settle;
        sig = captured.stream?.on_chain_signature || sig;
      } else if (paid.artifact_hash && streamId) {
        const token = getToken();
        if (token) {
          const mac = await signArtifactMac(token, paid.artifact_hash);
          const captured = await captureMppStream(streamId, paid.artifact_hash, mac);
          settle = captured.stream?.settle_mode || settle;
          sig = captured.stream?.on_chain_signature || sig;
        }
      }
      setMode(settle);
      if (sig) setExplorer(explorerTxUrl(sig));
      setMsg(settle ? `paid · ${settle}` : 'paid');
      setOk(true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'pay failed');
      setOk(false);
    } finally {
      setBusy(null);
    }
  };

  const accept = preview?.accepts?.[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-[10px] text-[#8a96c2] uppercase tracking-wider mb-1.5">Amount (micro-USDC)</span>
          <input value={amount} onChange={e => { setAmount(e.target.value); setPreview(null); }} className="w-full bg-[#0e1631] border border-[#243365] rounded-lg px-3 py-2 text-[13px] text-white font-mono" />
        </label>
        <label className="block">
          <span className="block text-[10px] text-[#8a96c2] uppercase tracking-wider mb-1.5">--max-amount</span>
          <input value={maxAmount} onChange={e => { setMaxAmount(e.target.value); setPreview(null); }} className="w-full bg-[#0e1631] border border-[#243365] rounded-lg px-3 py-2 text-[13px] text-white font-mono" />
        </label>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={runDetails} loading={busy === 'details'}>Details</Button>
        <Button variant="primary" onClick={runPay} disabled={!preview || preview.over_cap} loading={busy === 'pay'}>Pay</Button>
        {mode && <PaymentBadge settleMode={mode} />}
      </div>
      {accept && (
        <pre className="text-[11px] font-mono text-[#a8b3d8] bg-[#0b1226] border border-[#243365] rounded-lg p-3 overflow-auto">
{JSON.stringify({
  x402Version: preview?.x402Version,
  error: preview?.error,
  accepts: preview?.accepts,
  over_cap: preview?.over_cap,
}, null, 2)}
        </pre>
      )}
      {msg && <p className={`text-[12px] ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</p>}
      {explorer && <a href={explorer} target="_blank" rel="noreferrer" className="text-[12px] text-white hover:underline">Solana Explorer</a>}
    </div>
  );
};
