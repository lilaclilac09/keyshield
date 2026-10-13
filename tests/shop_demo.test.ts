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
  groupPurchasesByRoleAndWallet,
  listPurchases,
  mergePurchaseRows,
  mppPurchaseFromReceipt,
  summarizeConsumption,
  LAST_LIVE_LEDGER,
  ON_CHAIN_CATEGORY,
  purchaseFromMppStream,
  purchaseFromSolanaTopup,
  SOLANA_TOPUP_CATEGORY,
  X402_CATEGORY,
  x402Purchases,
} from "../src/web/lib/purchases";

describe("show-everything script", () => {
  it("is zsh-safe and covers Home / Docs / Payments plus RPC", () => {
    const script = readFileSync(resolve(__dirname, "../scripts/show-everything.mjs"), "utf8");
    expect(script).toContain("node scripts/show-everything.mjs");
    expect(script).toContain("Do not run eval");
    expect(script).not.toContain("eval(");
    expect(script).toContain("home-saved-apis");
    expect(script).toContain("Docs & Troubleshooting");
    expect(script).toContain("groupPurchasesByRoleAndWallet");
    expect(script).toContain("getSlot");
    expect(script).toContain("getBalance");
    expect(script).toContain("/keychain/rpc-cache");
  });
});

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
    expect(home).toContain("home-metrics-strip");
    expect(home).toContain("SHOP_PROOF_CACHE_MS");
    expect(home).toContain("1 · RPC");
    expect(home).toContain("2 · API call");
    expect(home).toContain("home-saved-apis");
    expect(home).toContain("home-consumption");
    expect(home).toContain("home-subscription");
    expect(home).toContain("home-buy-mpp");
    expect(home).toContain("text-[40px]");
    expect(home).not.toContain("shop-proof-strip");
    expect(home).not.toContain("PurchasesPanel");
    expect(home).not.toContain("SHOP_PROOF_SETTLE_CU");
    expect(home).not.toContain("key-paste");
    expect(home).not.toContain("ExtensionInstallHint");
    expect(home).not.toMatch(/[\u4e00-\u9fff]/);
    const payments = readFileSync(resolve(__dirname, "../src/web/components/PaymentsLedger.tsx"), "utf8");
    expect(payments).toContain("shop-proof-strip");
    expect(payments).toContain("SHOP_PROOF_SETTLE_CU");
    expect(payments).toContain("WebAuthn PRF");
    expect(payments).toContain("ForceClawback");
    expect(payments).toContain("PurchasesPanel");
    expect(payments).toContain("payments-dashboard");
    expect(payments).toContain("payments-kpis");
    expect(payments).toContain("payments-kpi-human");
    expect(payments).toContain("Transparency ledger");
    expect(payments).not.toMatch(/[\u4e00-\u9fff]/);
    const activity = readFileSync(resolve(__dirname, "../src/web/components/sections/ActivitySection.tsx"), "utf8");
    expect(activity).toContain("PaymentsLedger");
    const panel = readFileSync(resolve(__dirname, "../src/web/components/PurchasesPanel.tsx"), "utf8");
    expect(panel).toContain('data-testid="purchases-panel"');
    expect(panel).toContain("purchase-explorer-link");
    expect(panel).toContain("Explorer ·");
    expect(panel).toContain("item.txType");
    expect(panel).toContain("item.railLabel");
    expect(panel).toContain("item.sizeLabel");
    expect(panel).toContain("Download receipt");
    expect(panel).toContain("groupPurchasesByRoleAndWallet");
    expect(panel).toContain("item.portal");
    expect(panel).toContain("item.whatChanged");
    expect(panel).toContain("purchase-wallet-full");
    expect(panel).toContain("purchase-sku");
    expect(panel).toContain("purchase-amount");
    expect(panel).toContain("purchase-rail");
    expect(panel).toContain("<table");
    expect(panel).toContain("Transparency dashboard");
    expect(panel).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("lists every on-chain buy with explorer links, grouped", () => {
    const row = mppPurchaseFromReceipt(LAST_LIVE_MPP_RECEIPT);
    expect(row.category).toBe(ON_CHAIN_CATEGORY);
    expect(row.explorer.length).toBeGreaterThanOrEqual(3);
    expect(row.explorer.some((link) => link.href.includes("/tx/") && link.href.includes("cluster=devnet"))).toBe(true);
    expect(explorerLinksForReceipt(LAST_LIVE_MPP_RECEIPT).some((link) => link.label.startsWith("Settle"))).toBe(true);
    const grouped = groupPurchases(listPurchases([]));
    expect(grouped[0]?.category).toBe(ON_CHAIN_CATEGORY);
    expect(row.walletRole).toBe("user");
    expect(row.walletAddress).toBe(LAST_LIVE_MPP_RECEIPT.owner);
    expect(row.callKind).toBe("on-chain tx");
    expect(row.portal).toContain("MPP");
    expect(row.whatChanged).toContain("Owner USDC");
    expect(row.txType).toContain("MPP");
    expect(row.rail).toBe("solana-mpp");
    expect(row.sizeLabel).toContain("USDC");
    expect(row.receipt?.settleTx).toBeTruthy();
    const byRole = groupPurchasesByRoleAndWallet(listPurchases([]));
    expect(byRole.some((g) => g.role === "user" && g.wallets.some((w) => w.walletAddress === LAST_LIVE_MPP_RECEIPT.owner))).toBe(true);
    expect(LAST_LIVE_MPP_RECEIPT.owner).toBe("GHpmxvrXbAfc5XWG7mPrJFqchWEQC6mc2hyStP5P4bhq");
    expect(row.explorer.some((link) => link.href.includes("4YW8ffsb"))).toBe(true);
    expect(row.explorer.some((link) => link.href.includes("3tGEtZ65"))).toBe(true);
    expect(summarizeConsumption(listPurchases([])).humanUsd).toBeGreaterThan(0);
    expect(row.explorer.some((link) => link.href.includes("/address/") && link.label.startsWith("ATA"))).toBe(true);
  });

  it("turns every settled MPP stream and Solana top-up into an explorer row", () => {
    const stream = purchaseFromMppStream({
      id: 7,
      agent_name: "keyshield-shop-big",
      upstream: "openrouter",
      status: "open",
      settled_micro_usdc: 2_000_000,
      on_chain_signature: "SettleSig1111111111111111111111111111111111111111111111111111111111",
      stream_pda: "StreamPda111111111111111111111111111111111111",
      stream_usdc_ata: "Ata11111111111111111111111111111111111111111",
      total_calls: 1,
    });
    expect(stream?.category).toBe(ON_CHAIN_CATEGORY);
    expect(stream?.explorer.some((link) => link.href.includes("/tx/") && link.href.includes("cluster=devnet"))).toBe(true);
    expect(stream?.explorer.some((link) => link.label.startsWith("Stream"))).toBe(true);
    expect(purchaseFromMppStream({ id: 8, settled_micro_usdc: 0 })).toBeNull();

    const topup = purchaseFromSolanaTopup({
      tx_signature: "TopupSig111111111111111111111111111111111111111111111111111111111",
      chain: "solana",
      asset: "USDC",
      amount_usd: 2,
    });
    expect(topup?.category).toBe(SOLANA_TOPUP_CATEGORY);
    expect(topup?.explorer[0]?.href).toContain("cluster=devnet");
    expect(topup?.explorer[0]?.href).toContain("/tx/");

    const merged = groupPurchases(listPurchases([], [stream!, topup!]));
    expect(merged.some((g) => g.category === SOLANA_TOPUP_CATEGORY && g.items.length === 1)).toBe(true);
    expect(merged.some((g) => g.category === ON_CHAIN_CATEGORY && g.items.length >= 2)).toBe(true);
    expect(mergePurchaseRows([stream!, stream!])).toHaveLength(1);
    expect(x402Purchases().some((row) => row.category === X402_CATEGORY)).toBe(true);
    expect(LAST_LIVE_LEDGER.amountUsd).toBe(0.1);
    const listed = listPurchases([]);
    expect(listed.some((row) => row.id === "ledger-shop-credit-010")).toBe(true);
    expect(listed.some((row) => row.kind === "x402")).toBe(true);
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
