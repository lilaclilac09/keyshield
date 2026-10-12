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
import {
  explorerLinksForReceipt,
  groupPurchases,
  listPurchases,
  mppPurchaseFromReceipt,
  ON_CHAIN_CATEGORY,
} from "../src/web/lib/purchases";

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
    expect(home).toContain("text-[40px]");
    expect(home).toContain("WebAuthn PRF");
    expect(home).toContain("ForceClawback");
    expect(home.indexOf("shop-proof-strip")).toBeLessThan(home.indexOf("Stored APIs"));
    expect(home.indexOf("shop-proof-strip")).toBeLessThan(home.indexOf(">Connection<"));
    expect(home).toContain("PurchasesPanel");
    expect(home.indexOf("PurchasesPanel")).toBeLessThan(home.indexOf("Stored APIs"));
    expect(home).not.toMatch(/[\u4e00-\u9fff]/);
    const panel = readFileSync(resolve(__dirname, "../src/web/components/PurchasesPanel.tsx"), "utf8");
    expect(panel).toContain('data-testid="purchases-panel"');
    expect(panel).toContain("item.explorer.map");
  });

  it("lists every on-chain buy with explorer links, grouped", () => {
    const row = mppPurchaseFromReceipt(LAST_LIVE_MPP_RECEIPT);
    expect(row.category).toBe(ON_CHAIN_CATEGORY);
    expect(row.explorer.length).toBeGreaterThanOrEqual(3);
    expect(row.explorer.some((link) => link.href.includes("/tx/") && link.href.includes("cluster=devnet"))).toBe(true);
    expect(explorerLinksForReceipt(LAST_LIVE_MPP_RECEIPT).some((link) => link.label.startsWith("Settle"))).toBe(true);
    const grouped = groupPurchases(listPurchases([
      {
        id: "helius-1",
        name: "Helius RPC · dashboard",
        upstream: "helius",
        prefix: "abcd12…wxyz",
        family: "RPC",
        product: "Solana RPC",
        domain: "dashboard.helius.dev",
      },
    ]));
    expect(grouped[0]?.category).toBe(ON_CHAIN_CATEGORY);
    expect(grouped.some((g) => g.category === "RPC APIs" && g.items.length === 1)).toBe(true);
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
