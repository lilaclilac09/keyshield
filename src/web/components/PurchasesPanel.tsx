import React from 'react';
import { Receipt } from 'lucide-react';
import {
  groupPurchases,
  groupPurchasesByWallet,
  LEDGER_CATEGORY,
  ON_CHAIN_CATEGORY,
  type PurchaseRow,
} from '../lib/purchases';
import { downloadMppReceipt } from '../lib/mpp-shop';

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
  const groups = groupPurchases(rows);
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
          Every buy on this account, English only. Grouped by rail, then wallet.
          Each row shows size, type, and Solana Devnet explorer (or the probed URL).
          Tempo settlement is archived — these rows are MPP, top-up, ledger, or x402.
        </p>
      </div>
      {groups.map((group) => (
        <section
          key={group.category}
          data-testid={`purchases-cat-${group.category.replace(/\s+/g, '-').toLowerCase()}`}
          className="space-y-3"
        >
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[12px] uppercase tracking-wider text-[#8a96c2]">{group.category}</p>
            <p className="text-[12px] text-[#5e6a91]">{group.items.length} {group.items.length === 1 ? 'tx' : 'txs'}</p>
          </div>
          {group.items.length === 0 ? (
            <p className="text-[14px] text-[#5e6a91]">None yet in this category.</p>
          ) : (
            groupPurchasesByWallet(group.items).map((wallet) => (
              <div key={wallet.walletLabel} className="space-y-2">
                <p className="text-[13px] text-[#93b4ff]">{wallet.walletLabel}</p>
                {wallet.items.map((item) => (
                  <PurchaseCard key={item.id} item={item} />
                ))}
              </div>
            ))
          )}
          {group.category === ON_CHAIN_CATEGORY && (
            <button
              type="button"
              data-testid="purchases-buy-mpp"
              disabled={busy}
              onClick={onBuyMpp}
              className="h-11 px-5 rounded-xl bg-white text-black text-[15px] font-semibold disabled:opacity-50"
            >
              {buyMppLabel}
            </button>
          )}
          {group.category === LEDGER_CATEGORY && (
            <button
              type="button"
              data-testid="purchases-buy-ledger"
              disabled={busy}
              onClick={onBuyLedger}
              className="h-11 px-5 rounded-xl border border-zinc-500 text-white text-[15px] font-semibold disabled:opacity-50"
            >
              {buyLedgerLabel}
            </button>
          )}
        </section>
      ))}
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
        <p className="text-[12px] uppercase tracking-wider text-[#8a96c2] mt-2">Size</p>
      </div>
      <div className="text-right space-y-1">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-emerald-400">{item.txType}</p>
        <p className="text-[12px] text-[#8a96c2]">{item.railLabel}</p>
      </div>
    </div>
    <div>
      <p className="text-[16px] font-semibold text-white">{item.title}</p>
      <p className="text-[13px] text-[#8a96c2] mt-1">{item.detail}</p>
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
    {item.receipt && (
      <button
        type="button"
        data-testid={`purchase-receipt-${item.id}`}
        onClick={() => downloadMppReceipt(item.receipt!, 'html')}
        className="text-[13px] text-[#93b4ff] hover:underline"
      >
        Download receipt
      </button>
    )}
  </article>
);
