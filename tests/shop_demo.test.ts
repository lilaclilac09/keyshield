import { describe, expect, it } from "vitest";
import {
  SHOP_CREDIT_USD,
  SHOP_MPP_ITEM_NAME,
  SHOP_MPP_USD,
  describeBalanceChange,
  describeRpcPing,
  formatUsd,
  wantsShopDemo,
} from "../src/web/lib/shop-demo";
import {
  LAST_LIVE_MPP_RECEIPT,
  describeMppReceipt,
  explorerTx,
  formatMicroUsdc,
  isMppShopReceipt,
  receiptFilename,
  receiptNumber,
  renderMppReceiptHtml,
  shortSig,
} from "../src/web/lib/mpp-receipt";

describe("shop demo helpers", () => {
  it("recognizes the extension Sign-in shop landing", () => {
    expect(wantsShopDemo("?ext=1&demo=shop")).toBe(true);
    expect(wantsShopDemo("ext=1")).toBe(false);
    expect(SHOP_CREDIT_USD).toBe(0.1);
  });

  it("formats a credit balance change", () => {
    const row = describeBalanceChange(1, 1.1);
    expect(row.delta).toBeCloseTo(0.1);
    expect(row.label).toContain("$1.00 → $1.10");
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("describes an accelerated second RPC read", () => {
    expect(describeRpcPing(80, 8, "HIT", "helius-cache")).toBe(
      "1st 80ms · 2nd 8ms · faster · cache HIT · helius-cache",
    );
  });

  it("keeps the 2.00 USDC MPP shop SKU separate from ledger credit", () => {
    expect(SHOP_MPP_USD).toBe(2);
    expect(SHOP_MPP_ITEM_NAME).toContain("2.00 USDC");
    expect(isMppShopReceipt(LAST_LIVE_MPP_RECEIPT)).toBe(true);
    expect(LAST_LIVE_MPP_RECEIPT.settleTx).toContain("3tGEtZ65");
    expect(formatMicroUsdc(2_000_000)).toBe("2.00");
    expect(shortSig(LAST_LIVE_MPP_RECEIPT.settleTx || "")).toContain("…");
    expect(explorerTx(LAST_LIVE_MPP_RECEIPT.settleTx || "")).toContain("cluster=devnet");
    expect(describeMppReceipt(LAST_LIVE_MPP_RECEIPT)).toContain("2.00 USDC");
  });

  it("renders a downloadable receipt with the live settle tx", () => {
    expect(receiptNumber(LAST_LIVE_MPP_RECEIPT)).toBe("KS-MPP-509959477");
    expect(receiptFilename(LAST_LIVE_MPP_RECEIPT, "html")).toBe(
      "keyshield-receipt-ks-mpp-509959477.html",
    );
    const html = renderMppReceiptHtml(LAST_LIVE_MPP_RECEIPT);
    expect(html).toContain("PAID · SOLANA DEVNET");
    expect(html).toContain("3tGEtZ65Hop8mB4EYadBhq4QxgBNfjRBTQufS6hjD4Tb7i7ZXQ6n6VwCggT9bSjuuRLouRs9Q16RbXAasYVDm8Yb");
    expect(html).toContain("cluster=devnet");
    expect(html).toContain("not $X402 / $M32");
  });
});
