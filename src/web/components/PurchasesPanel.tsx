import React from 'react';
import { Receipt } from 'lucide-react';
import {
  downloadPurchaseReceipt,
  groupPurchasesByRoleAndWallet,
  LEDGER_CATEGORY,
  ON_CHAIN_CATEGORY,
  TEMPO_CATEGORY,
  type PurchaseRow,
} from '../lib/purchases';

interface Props {
  rows: PurchaseRow[];
  buyMppLabel: string;
  buyLedgerLabel: string;
  busy: boolean;
  onBuyMpp: () => void;
  onBuyLedger: () => void;
}

export const PurchasesPanel: React.FC<Props> = ({
  rows, buyMppLabel, buyLedgerLabel, busy, onBuyMpp, onBuyLedger,
}) => {
  const groups = groupPurchasesByRoleAndWallet(rows);
  const total = rows.length;
  return (
    <div data-testid="purchases-panel" className="rounded-2xl border border-[#243365] bg-[#131c39] px-5 py-5 space-y-7">
      <div>
        <div className="flex items-center gap-2">
          <Receipt size={18} className="text-white" />
          <h3 className="text-[20px] font-semibold text-white">Transaction record</h3>
          <span data-testid="purchases-count" className="text-[13px] text-[#8a96c2]">{total} rows</span>
        </div>
        <p className="text-[14px] text-[#8a96c2] mt-2">
          Every buy on this account, English only. Grouped by human or agent, then wallet address.
          Each row shows portal, API or on-chain tx, amount, what changed, rail (Solana / Tempo / MPP / x402),
          and a downloadable receipt.
        </p>
      </div>
      {groups.map((group) => (
        <section
          key={group.role}
          data-testid={`purchases-role-${group.role}`}
          className="space-y-3"
        >
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[12px] uppercase tracking-wider text-[#8a96c2]">{group.roleLabel}</p>
            <p className="text-[12px] text-[#5e6a91]">
              {group.wallets.reduce((n, w) => n + w.items.length, 0)} {group.wallets.reduce((n, w) => n + w.items.length, 0) === 1 ? 'tx' : 'txs'}
            </p>
          </div>
          {group.wallets.length === 0 ? (
            <p className="text-[14px] text-[#5e6a91]">None yet for {group.roleLabel.toLowerCase()}.</p>
          ) : (
            group.wallets.map((wallet) => (
              <div key={`${group.role}-${wallet.walletAddress || wallet.walletLabel}`} className="space-y-2">
                <p className="text-[13px] text-[#93b4ff] font-mono break-all">
                  {wallet.walletLabel}
                  {wallet.walletAddress && wallet.walletAddress !== wallet.walletLabel ? ` · ${wallet.walletAddress}` : ''}
                </p>
                {wallet.items.map((item) => (
                  <PurchaseCard key={item.id} item={item} />
                ))}
              </div>
            ))
          )}
        </section>
      ))}
      <section data-testid={`purchases-cat-${ON_CHAIN_CATEGORY.replace(/\s+/g, '-').toLowerCase()}`} className="space-y-3">
        <p className="text-[12px] uppercase tracking-wider text-[#8a96c2]">{ON_CHAIN_CATEGORY}</p>
        <button
          type="button"
          data-testid="purchases-buy-mpp"
          disabled={busy}
          onClick={onBuyMpp}
          className="h-11 px-5 rounded-xl bg-white text-black text-[15px] font-semibold disabled:opacity-50"
        >
          {buyMppLabel}
        </button>
      </section>
      <section data-testid={`purchases-cat-${LEDGER_CATEGORY.replace(/\s+/g, '-').toLowerCase()}`} className="space-y-3">
        <p className="text-[12px] uppercase tracking-wider text-[#8a96c2]">{LEDGER_CATEGORY}</p>
        <button
          type="button"
          data-testid="purchases-buy-ledger"
          disabled={busy}
          onClick={onBuyLedger}
          className="h-11 px-5 rounded-xl border border-zinc-500 text-white text-[15px] font-semibold disabled:opacity-50"
        >
          {buyLedgerLabel}
        </button>
      </section>
      <section data-testid={`purchases-cat-${TEMPO_CATEGORY.replace(/\s+/g, '-').toLowerCase()}`} className="space-y-2">
        <p className="text-[12px] uppercase tracking-wider text-[#8a96c2]">{TEMPO_CATEGORY}</p>
        <p className="text-[14px] text-[#5e6a91]">
          Tempo settlement is archived. This ledger has Solana Devnet MPP, Solana top-up, KeyShield ledger, and x402 rows — no Tempo txs.
        </p>
      </section>
    </div>
  );
};

const PurchaseCard: React.FC<{ item: PurchaseRow }> = ({ item }) => (
  <article
    data-testid={`purchase-${item.id}`}
    className="rounded-xl border border-[#243365] bg-[#0e1631] px-4 py-4 space-y-3"
  >
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[28px] font-bold tracking-tight text-white leading-none">{item.sizeLabel || item.amountLabel}</p>
        <p className="text-[12px] uppercase tracking-wider text-[#8a96c2] mt-2">Amount</p>
      </div>
      <div className="text-right space-y-1">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-emerald-400">{item.txType}</p>
        <p className="text-[12px] text-[#8a96c2]">{item.railLabel}</p>
        <p className="text-[12px] text-[#93b4ff]">{item.callKind}</p>
      </div>
    </div>
    <div>
      <p className="text-[16px] font-semibold text-white">{item.title}</p>
      <p className="text-[13px] text-[#8a96c2] mt-1">{item.portal}</p>
      <p className="text-[13px] text-[#8a96c2] mt-1">{item.detail}</p>
    </div>
    <div className="space-y-1">
      <p className="text-[13px] text-white"><span className="text-[#8a96c2]">Use · </span>{item.potentialUse}</p>
      <p className="text-[13px] text-white"><span className="text-[#8a96c2]">Changed · </span>{item.whatChanged}</p>
    </div>
    {item.explorer.length > 0 ? (
      <div className="flex flex-col gap-1">
        {item.explorer.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            data-testid="purchase-explorer-link"
            className="text-[12px] text-[#93b4ff] hover:underline font-mono break-all"
          >
            {link.href.includes('explorer.solana.com') ? `Explorer · ${link.label}` : link.label}
          </a>
        ))}
      </div>
    ) : (
      <p className="text-[12px] text-[#5e6a91]">{item.kind === 'ledger' ? 'No chain tx' : '—'}</p>
    )}
    <button
      type="button"
      data-testid={`purchase-receipt-${item.id}`}
      onClick={() => downloadPurchaseReceipt(item)}
      className="text-[13px] text-[#93b4ff] hover:underline"
    >
      Download receipt
    </button>
  </article>
);
