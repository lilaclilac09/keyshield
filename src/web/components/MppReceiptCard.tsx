import React from 'react';
import {
  explorerAddress,
  explorerTx,
  formatMicroUsdc,
  receiptNumber,
  shortSig,
  type MppShopReceipt,
} from '../lib/mpp-receipt';
import { downloadMppReceipt, openMppReceiptPrint } from '../lib/mpp-shop';

export const MppReceiptCard: React.FC<{ receipt: MppShopReceipt }> = ({ receipt }) => {
  const no = receiptNumber(receipt);
  return (
    <div
      data-testid="shop-receipt"
      className="rounded-xl border border-emerald-900/60 bg-[#0e1612] px-4 py-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-semibold tracking-[0.14em] text-emerald-300">PAID · RECEIPT {no}</p>
        <p className="text-[12px] text-[#8a96c2]">{formatMicroUsdc(receipt.captureMicroUsdc)} USDC · Devnet</p>
      </div>
      <p className="text-white text-[18px] font-semibold">{receipt.sku}</p>
      <div className="text-[13px] font-mono space-y-1">
        <p>
          Open{' '}
          {receipt.openTx ? (
            <a className="text-[#93b4ff]" href={explorerTx(receipt.openTx)} target="_blank" rel="noreferrer">
              {shortSig(receipt.openTx)}
            </a>
          ) : '—'}
          {receipt.openSlot != null ? ` · slot ${receipt.openSlot}` : ''}
        </p>
        <p>
          Settle{' '}
          {receipt.settleTx ? (
            <a className="text-[#93b4ff]" href={explorerTx(receipt.settleTx)} target="_blank" rel="noreferrer">
              {shortSig(receipt.settleTx)}
            </a>
          ) : '—'}
          {receipt.settleSlot != null ? ` · slot ${receipt.settleSlot}` : ''}
          {receipt.settleCu != null ? ` · ${receipt.settleCu} CU` : ''}
          {receipt.settleErr == null && receipt.settleTx ? ' · err=null' : ''}
        </p>
        <p>
          Owner {receipt.ownerUsdcBefore ?? '—'} → {receipt.ownerUsdcAfter ?? '—'}
          {' · '}escrow {receipt.escrowBefore ?? '—'} → {receipt.escrowAfter ?? '—'}
          {' · '}platform {receipt.platformBefore ?? '—'} → {receipt.platformAfter ?? '—'}
        </p>
        {receipt.streamPda && (
          <p>
            stream{' '}
            <a className="text-[#93b4ff]" href={explorerAddress(receipt.streamPda)} target="_blank" rel="noreferrer">
              {shortSig(receipt.streamPda)}
            </a>
            {receipt.streamAta ? (
              <>
                {' · '}ATA{' '}
                <a className="text-[#93b4ff]" href={explorerAddress(receipt.streamAta)} target="_blank" rel="noreferrer">
                  {shortSig(receipt.streamAta)}
                </a>
              </>
            ) : null}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          data-testid="shop-receipt-download"
          onClick={() => downloadMppReceipt(receipt, 'html')}
          className="h-10 px-4 rounded-xl bg-white text-black text-[14px] font-semibold"
        >
          Download receipt
        </button>
        <button
          type="button"
          data-testid="shop-receipt-json"
          onClick={() => downloadMppReceipt(receipt, 'json')}
          className="h-10 px-4 rounded-xl border border-[#243365] text-white text-[14px] font-semibold"
        >
          JSON
        </button>
        <button
          type="button"
          data-testid="shop-receipt-print"
          onClick={() => openMppReceiptPrint(receipt)}
          className="h-10 px-4 rounded-xl border border-[#243365] text-white text-[14px] font-semibold"
        >
          Open / print
        </button>
      </div>
    </div>
  );
};
