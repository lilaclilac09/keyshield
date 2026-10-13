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
    <div data-testid="purchases-panel" className="rounded-2xl border border-[#243365] bg-[#131c39] px-5 py-5 space-y-6">
      <div className="flex items-center gap-2">
        <Receipt size={18} className="text-white" />
        <h3 className="text-[20px] font-semibold text-white">Purchases</h3>
        <span data-testid="purchases-count" className="text-[13px] text-[#8a96c2]">{total} on this account</span>
      </div>
      <p className="text-[14px] text-[#8a96c2]">
        Every buy, grouped in English: on-chain MPP, Solana top-up, ledger credit.
        Size, type, user vs agent wallet, and Solana Devnet explorer links.
      </p>
      {groups.map((group) => (
        <section
          key={group.category}
          data-testid={`purchases-cat-${group.category.replace(/\s+/g, '-').toLowerCase()}`}
          className="space-y-3"
        >
          <p className="text-[12px] uppercase tracking-wider text-[#8a96c2]">{group.category}</p>
          {group.items.length === 0 ? (
            <p className="text-[14px] text-[#5e6a91]">None yet in this category.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#243365]">
              <table className="w-full min-w-[720px] text-left">
                <thead className="bg-[#0d0d0d] text-[10px] uppercase tracking-wider text-[#8a96c2]">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Item</th>
                    <th className="px-3 py-2 font-semibold">Type</th>
                    <th className="px-3 py-2 font-semibold">Size</th>
                    <th className="px-3 py-2 font-semibold">Wallet</th>
                    <th className="px-3 py-2 font-semibold">On-chain</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item) => (
                    <tr
                      key={item.id}
                      data-testid={`purchase-${item.id}`}
                      className="border-t border-[#243365]/40 bg-[#0e1631]"
                    >
                      <td className="px-3 py-3 align-top">
                        <p className="text-[14px] font-semibold text-white">{item.title}</p>
                        <p className="text-[12px] text-[#8a96c2] mt-0.5">{item.detail}</p>
                      </td>
                      <td className="px-3 py-3 align-top text-[13px] text-[#e8ecff]">{item.txType}</td>
                      <td className="px-3 py-3 align-top text-[14px] text-emerald-400 font-semibold">{item.sizeLabel || item.amountLabel}</td>
                      <td className="px-3 py-3 align-top text-[13px] text-[#93b4ff]">{item.walletLabel}</td>
                      <td className="px-3 py-3 align-top">
                        {item.explorer.length > 0 ? (
                          <div className="flex flex-col gap-1">
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
                        ) : (
                          <p className="text-[12px] text-[#5e6a91]">{item.kind === 'ledger' ? 'No chain tx' : '—'}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
