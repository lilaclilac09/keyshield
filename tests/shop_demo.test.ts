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
});
