import React from 'react';
import { Receipt } from 'lucide-react';
import {
  groupPurchases,
  LEDGER_CATEGORY,
  ON_CHAIN_CATEGORY,
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
  const groups = groupPurchases(rows);
  const total = rows.length;
  return (
    <div data-testid="purchases-panel" className="rounded-2xl border border-[#243365] bg-[#131c39] px-5 py-5 space-y-5">
      <div className="flex items-center gap-2">
        <Receipt size={18} className="text-white" />
        <h3 className="text-[20px] font-semibold text-white">Purchases</h3>
        <span data-testid="purchases-count" className="text-[13px] text-[#8a96c2]">{total} on this account</span>
      </div>
      <p className="text-[14px] text-[#8a96c2]">
        Every buy, grouped: on-chain MPP, Solana top-up, ledger credit, stored APIs.
        On-chain rows open Solana Devnet explorer. Buy again in each category.
      </p>
      {groups.map((group) => (
        <section
          key={group.category}
          data-testid={`purchases-cat-${group.category.replace(/\s+/g, '-').toLowerCase()}`}
          className="rounded-xl border border-[#243365] bg-[#0e1631] px-4 py-4 space-y-3"
        >
          <p className="text-[13px] uppercase tracking-wider text-[#8a96c2]">{group.category}</p>
          {group.items.length === 0 ? (
            <p className="text-[14px] text-[#5e6a91]">None yet in this category.</p>
          ) : group.items.map((item) => (
            <div
              key={item.id}
              data-testid={`purchase-${item.id}`}
              className="rounded-lg border border-[#243365] px-3 py-3 space-y-1"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[16px] font-semibold text-white">{item.title}</p>
                <p className="text-[14px] text-emerald-400">{item.amountLabel}</p>
              </div>
              <p className="text-[13px] text-[#8a96c2]">{item.detail}</p>
              {item.explorer.length > 0 ? (
                <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
                  {item.explorer.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      data-testid="purchase-explorer-link"
                      className="text-[12px] text-[#93b4ff] hover:underline font-mono"
                    >
                      Explorer · {link.label}
                    </a>
                  ))}
                </div>
              ) : item.kind === 'ledger' ? (
                <p className="text-[12px] text-[#5e6a91]">No chain tx</p>
              ) : null}
            </div>
          ))}
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
