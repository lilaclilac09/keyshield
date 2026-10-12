import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SHOP_CREDIT_USD,
  SHOP_MPP_ITEM_NAME,
  SHOP_MPP_USD,
  SHOP_PROOF_CACHE_MS,
  SHOP_PROOF_CLAWBACK_IX,
  SHOP_PROOF_SETTLE_CU,
  SHOP_PROOF_SETTLE_IX,
  SHOP_PROOF_WAN_MS,
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

  it("highlights 1,906 CU, 0.004ms cache, PRF, and clawback", () => {
    expect(SHOP_PROOF_SETTLE_CU).toBe(1906);
    expect(SHOP_PROOF_CACHE_MS).toBe(0.004);
    expect(SHOP_PROOF_WAN_MS).toBe(37.7);
    expect(SHOP_PROOF_CLAWBACK_IX).toBe(28);
    expect(SHOP_PROOF_SETTLE_IX).toBe(26);
    const home = readFileSync(resolve(__dirname, "../src/web/components/sections/HomeSection.tsx"), "utf8");
    expect(home).toContain("shop-proof-strip");
    expect(home).toContain("SHOP_PROOF_SETTLE_CU");
    expect(home).toContain("WebAuthn PRF");
    expect(home).toContain("ForceClawback");
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
