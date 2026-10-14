import React, { useEffect, useMemo, useState } from 'react';
import { PurchasesPanel } from './PurchasesPanel';
import { apiFetch } from '../lib/auth';
import {
  fetchAccountPurchases,
  listPurchases,
  recordLedgerPurchase,
  summarizeConsumption,
  type PurchaseRow,
} from '../lib/purchases';
import { buyMppShopSku, downloadMppReceipt } from '../lib/mpp-shop';
import {
  describeBalanceChange,
  formatUsd,
  SHOP_CREDIT_USD,
  SHOP_ITEM_NAME,
  SHOP_MPP_USD,
  formatRpcMs,
  loadRpcPing,
  SHOP_PROOF_CLAWBACK_IX,
  SHOP_PROOF_SETTLE_CU,
  SHOP_PROOF_SETTLE_IX,
} from '../lib/shop-demo';

interface Props {
  ledgerUsd?: number;
  onRefresh?: () => void;
}

export const PaymentsLedger: React.FC<Props> = ({ ledgerUsd = 0, onRefresh }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [tick, setTick] = useState(0);
  const [account, setAccount] = useState<PurchaseRow[]>([]);
  const rpcSample = useMemo(() => loadRpcPing(), [tick]);

  useEffect(() => {
    let cancelled = false;
    void fetchAccountPurchases().then((rows) => {
      if (!cancelled) setAccount(rows);
    });
    return () => { cancelled = true; };
  }, [tick, ledgerUsd]);

  const rows = useMemo(() => listPurchases([], account), [account, tick]);
  const consume = useMemo(() => summarizeConsumption(rows), [rows]);
  const explorerCount = useMemo(
    () => rows.reduce((n, row) => n + row.explorer.filter((link) => link.href.includes('explorer.solana.com')).length, 0),
    [rows],
  );

  const buyMpp = () => {
    setBusy('mpp');
    setMsg(null);
    void buyMppShopSku()
      .then((next) => {
        setTick((n) => n + 1);
        setOk(true);
        setMsg(`Bought ${next.sku} · receipt ready`);
        downloadMppReceipt(next, 'html');
        onRefresh?.();
      })
      .catch((err) => { setOk(false); setMsg(err instanceof Error ? err.message : 'MPP shop failed'); })
      .finally(() => setBusy(null));
  };

  const buyLedger = () => {
    const before = ledgerUsd;
    setBusy('shop');
    setMsg(null);
    void apiFetch('/billing/topup', { method: 'POST', body: JSON.stringify({ amount_usd: SHOP_CREDIT_USD }) })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((d as { detail?: string }).detail ?? 'Shop credit failed');
        const after = typeof (d as { balance_usd?: number }).balance_usd === 'number'
          ? (d as { balance_usd: number }).balance_usd
          : before + SHOP_CREDIT_USD;
        recordLedgerPurchase(SHOP_CREDIT_USD, SHOP_ITEM_NAME);
        setTick((n) => n + 1);
        setOk(true);
        setMsg(`Bought ${SHOP_ITEM_NAME} · ${describeBalanceChange(before, after).label}`);
        onRefresh?.();
      })
      .catch((err) => { setOk(false); setMsg(err instanceof Error ? err.message : 'Shop failed'); })
      .finally(() => setBusy(null));
  };

  return (
    <div className="space-y-6" data-testid="payments-dashboard">
      <div data-testid="payments-ledger">
        <p className="text-[13px] uppercase tracking-wider text-emerald-400">Transparency ledger</p>
        <h2 className="text-[28px] font-bold text-white mt-1">Payments</h2>
        <p className="text-[15px] text-[#8a96c2] mt-2">
          Every buy on this account. Grouped Human / Agent, then the full wallet.
          Each row shows purchased SKU, amount, rail, and Solana explorer.
          Ledger credits have no chain tx. Tempo is archived. Not Raydium / $X402 / $M32.
        </p>
      </div>
      <div data-testid="payments-kpis" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div data-testid="payments-kpi-human" className="rounded-2xl border border-[#243365] bg-[#131c39] px-5 py-4">
          <p className="text-[13px] text-[#8a96c2]">Human</p>
          <p className="text-[24px] font-bold text-white leading-none mt-2">{formatUsd(consume.humanUsd)}</p>
          <p className="text-[12px] text-[#5e6a91] mt-2">{consume.humanCount} txs · wallet + explorer</p>
        </div>
        <div data-testid="payments-kpi-agent" className="rounded-2xl border border-[#243365] bg-[#131c39] px-5 py-4">
          <p className="text-[13px] text-[#8a96c2]">Agent</p>
          <p className="text-[24px] font-bold text-white leading-none mt-2">{formatUsd(consume.agentUsd)}</p>
          <p className="text-[12px] text-[#5e6a91] mt-2">{consume.agentCount} txs · live /mpp/streams</p>
        </div>
        <div data-testid="payments-kpi-ledger" className="rounded-2xl border border-[#243365] bg-[#131c39] px-5 py-4">
          <p className="text-[13px] text-[#8a96c2]">Ledger</p>
          <p className="text-[24px] font-bold text-white leading-none mt-2">{formatUsd(consume.ledgerUsd)}</p>
          <p className="text-[12px] text-[#5e6a91] mt-2">{consume.ledgerCount} credits · no chain tx</p>
        </div>
        <div data-testid="payments-kpi-explorer" className="rounded-2xl border border-[#243365] bg-[#131c39] px-5 py-4">
          <p className="text-[13px] text-[#8a96c2]">On-chain proofs</p>
          <p className="text-[24px] font-bold text-white leading-none mt-2">{explorerCount}</p>
          <p className="text-[12px] text-[#5e6a91] mt-2">Solana Devnet explorer links</p>
        </div>
      </div>
      <PurchasesPanel
        rows={rows}
        busy={busy !== null}
        buyMppLabel={busy === 'mpp' ? 'Settling…' : `Buy $${SHOP_MPP_USD.toFixed(2)}`}
        buyLedgerLabel={busy === 'shop' ? 'Buying…' : `Ledger $${SHOP_CREDIT_USD.toFixed(2)}`}
        onBuyMpp={buyMpp}
        onBuyLedger={buyLedger}
      />
      {msg && <p className={`text-[14px] ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</p>}

      <div data-testid="shop-proof-strip" className="rounded-2xl border border-emerald-900/50 bg-emerald-950/20 px-5 py-5 space-y-4">
        <p className="text-[13px] uppercase tracking-wider text-emerald-400">How to buy · Solana Devnet MPP</p>
        <p className="text-[16px] text-white leading-snug">
          Click <strong>Buy ${SHOP_MPP_USD.toFixed(2)}</strong> · get a receipt. Open 5.00 USDC escrow, capture {SHOP_MPP_USD.toFixed(2)} (ix {SHOP_PROOF_SETTLE_IX}).
          That receipt is the paid API proof — not Raydium / $X402 / $M32.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-[40px] font-bold text-white leading-none tracking-tight">{SHOP_PROOF_SETTLE_CU.toLocaleString()} CU</p>
            <p className="text-[13px] text-[#8a96c2] mt-2">MppSettle compute</p>
          </div>
          <div>
            <p data-testid="payments-rpc-repeat-ms" className="text-[40px] font-bold text-white leading-none tracking-tight">{formatRpcMs(rpcSample?.secondMs)}</p>
            <p className="text-[13px] text-[#8a96c2] mt-2">{rpcSample ? `repeat vs ${formatRpcMs(rpcSample.firstMs)} first call (your RPC speed check)` : 'No RPC data yet · run RPC speed check on Home'}</p>
          </div>
          <div>
            <p className="text-[20px] font-semibold text-white leading-tight">WebAuthn PRF</p>
            <p className="text-[13px] text-[#8a96c2] mt-2">device-bound unwrap</p>
          </div>
          <div>
            <p className="text-[20px] font-semibold text-white leading-tight">ForceClawback ix {SHOP_PROOF_CLAWBACK_IX}</p>
            <p className="text-[13px] text-[#8a96c2] mt-2">on-chain recover</p>
          </div>
        </div>
      </div>
    </div>
  );
};
