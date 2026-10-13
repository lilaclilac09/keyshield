#!/usr/bin/env node
/**
 * Show Home / Docs / Payments + simulate RPC.
 * From the repo root:
 *
 *   node scripts/show-everything.mjs
 *
 * Do not paste HTML into zsh. Do not run eval. Do not run command substitution.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.KS_BASE || "http://127.0.0.1:8001";
const DEVNET = process.env.KS_SOLANA_RPC || "https://api.devnet.solana.com";
const OWNER = "GHpmxvrXbAfc5XWG7mPrJFqchWEQC6mc2hyStP5P4bhq";
const SETTLE = "3tGEtZ65Hop8mB4EYadBhq4QxgBNfjRBTQufS6hjD4Tb7i7ZXQ6n6VwCggT9bSjuuRLouRs9Q16RbXAasYVDm8Yb";
const OPEN = "4YW8ffsbMHhthcCrbfcHbqvi2Aw5B5V7pRa9bEUQAdsTUNNtcfhxJG7hgJP93hsit6YnyUSeHyLyaZ1eDaP12ici";
const OUT = process.env.KS_SHOW_OUT || "/opt/cursor/artifacts/show-everything.json";

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

async function timed(label, fn) {
  const t0 = performance.now();
  try {
    const value = await fn();
    return { label, ok: true, ms: Math.round(performance.now() - t0), value };
  } catch (err) {
    return { label, ok: false, ms: Math.round(performance.now() - t0), error: String(err && err.message ? err.message : err) };
  }
}

async function jsonGet(url, headers = {}) {
  const r = await fetch(url, { headers });
  const text = await r.text();
  let body = text;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  return { status: r.status, body };
}

async function solana(method, params = []) {
  const r = await fetch(DEVNET, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await r.json();
  if (body.error) throw new Error(body.error.message || JSON.stringify(body.error));
  return body.result;
}

function describeRpcPing(firstMs, secondMs, cache, rpc) {
  const faster = secondMs < firstMs;
  return [
    `1st ${Math.round(firstMs)}ms`,
    `2nd ${Math.round(secondMs)}ms`,
    faster ? "faster" : "same path",
    `cache ${cache || "n/a"}`,
    rpc || "rpc",
  ].join(" · ");
}

function extensionReport() {
  const man = JSON.parse(read("src/extension/manifest.json"));
  const popup = read("src/extension/popup.js");
  const html = read("src/extension/popup.html");
  const install = read("src/extension/INSTALL-LOCAL.md");
  const leftover = man.version === "1.2.4";
  return {
    name: man.name,
    version: man.version,
    path: resolve(ROOT, "src/extension"),
    leftover,
    want: "1.2.5",
    readyLine: "ok 1.2.5 <all_urls>",
    latestLine: "1.2.5 · latest",
    hasDefaultPopup: Boolean(man.action && man.action.default_popup),
    autoDetect: popup.includes("autoDetectAndFill"),
    autoFill: popup.includes("FILL_PAGE_NOW") && popup.includes("fillActiveTab"),
    passkeySignin: popup.includes("Sign in with passkey"),
    sessionAuto: popup.includes("ks_auto_store"),
    installHasMacPath: install.includes("/Users/aileen/Downloads/privacy_hack/keyshield"),
    installHasThreeLinePrint: install.includes("print(m['name'])") && install.includes("print(m['version'])"),
    macClone: "/Users/aileen/Downloads/privacy_hack/keyshield",
    loadUnpacked:
      leftover
        ? "leftover 1.2.4 — Remove every card, then Load unpacked 1.2.5"
        : "Remove every KeyShield card, Load unpacked src/extension (1.2.5)",
    htmlReady: html.includes("ok 1.2.5"),
  };
}

function sourceMap() {
  const home = read("src/web/components/sections/HomeSection.tsx");
  const docs = read("src/web/components/sections/DocsSection.tsx");
  const app = read("src/web/App.tsx");
  const panel = read("src/web/components/PurchasesPanel.tsx");
  const purchases = read("src/web/lib/purchases.ts");
  return {
    home: {
      savedApis: home.includes("home-saved-apis"),
      oneClick: home.includes("home-buy-mpp") && home.includes("home-call-first"),
      consumption: home.includes("home-consumption") && home.includes("Human consumption"),
      passkey: home.includes("passkey-pill"),
      subscription: home.includes("home-subscription") && home.includes("Auto-approve"),
      leftoverOffHome: !home.includes("ExtTroubleCase"),
    },
    docs: {
      tab: app.includes("label: 'Docs & Troubleshooting'"),
      toc: docs.includes("docs-toc") && docs.includes("docs-ch-1"),
      troubleshootingBottom: docs.includes("TroubleshootingSection") && docs.includes("docs-troubleshooting"),
    },
    payments: {
      grouped: panel.includes("groupPurchasesByRoleAndWallet"),
      portal: panel.includes("item.portal"),
      explorer: panel.includes("purchase-explorer-link"),
      receipt: panel.includes("Download receipt"),
      rails: panel.includes("Solana / Tempo / MPP / x402") || purchases.includes("solana-mpp"),
      whatChanged: panel.includes("item.whatChanged"),
    },
  };
}

function paymentRows() {
  const settleUrl = `https://explorer.solana.com/tx/${SETTLE}?cluster=devnet`;
  const openUrl = `https://explorer.solana.com/tx/${OPEN}?cluster=devnet`;
  return [
    {
      role: "Human",
      wallet: OWNER,
      portal: "Solana Devnet · MPP portal",
      callKind: "on-chain tx",
      rail: "solana-mpp",
      amount: "2.00 USDC",
      whatChanged: "Owner USDC 17.89 → 12.89 · escrow 5 → 3 · platform 0.60001 → 2.60001",
      potentialUse: "Shop SKU 2.00 USDC MPP capture",
      explorer: [settleUrl, openUrl],
      receipt: `KS-MPP-509959477`,
    },
    {
      role: "Human",
      wallet: "ledger",
      portal: "KeyShield ledger portal",
      callKind: "ledger credit",
      rail: "ledger",
      amount: "$0.10",
      whatChanged: "Ledger credit +$0.10",
      potentialUse: "Shop credit (off-chain)",
      explorer: [],
      receipt: "ledger-shop-credit-010",
    },
  ];
}

const report = {
  ok: false,
  api: API,
  rpc: DEVNET,
  home: null,
  docs: null,
  payments: null,
  extension: null,
  rpcSim: null,
  source: null,
  errors: [],
};

try {
  report.source = sourceMap();
  report.extension = extensionReport();
  report.home = {
    note: "Home is speed + saved API timings + human/agent consumption + passkey + subscription + one-click buy/call. Details live in Payments.",
    checks: report.source.home,
  };
  report.docs = {
    note: "Tab Docs & Troubleshooting. Chapters first. Leftover 1.2.4 at the bottom.",
    checks: report.source.docs,
  };
  report.payments = {
    note: "Every buy grouped by human/agent then wallet. Portal, rail, explorer, amount, what changed, downloadable receipt.",
    checks: report.source.payments,
    rows: paymentRows(),
  };

  const health1 = await timed("health-1", () => jsonGet(`${API}/health`));
  const health2 = await timed("health-2", () => jsonGet(`${API}/health`));
  const cache = await timed("rpc-cache", () => jsonGet(`${API}/keychain/rpc-cache`));
  const slot1 = await timed("devnet-slot-1", () => solana("getSlot"));
  const slot2 = await timed("devnet-slot-2", () => solana("getSlot"));
  const bal1 = await timed("devnet-balance-1", () => solana("getBalance", [OWNER]));
  const bal2 = await timed("devnet-balance-2", () => solana("getBalance", [OWNER]));

  let home1 = null;
  let home2 = null;
  const demoPost = await timed("demo-session-post", () => fetch(`${API}/auth/demo-session`, { method: "POST" }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) })));
  const token = demoPost.value && demoPost.value.body && demoPost.value.body.token;
  if (token) {
    const headers = { Authorization: `Bearer ${token}` };
    home1 = await timed("keychain-home-1", () => jsonGet(`${API}/keychain/home?address=${OWNER}`, headers));
    home2 = await timed("keychain-home-2", () => jsonGet(`${API}/keychain/home?address=${OWNER}`, headers));
  }

  report.rpcSim = {
    line: describeRpcPing(
      (home1 && home1.ms) || slot1.ms,
      (home2 && home2.ms) || slot2.ms,
      (home2 && home2.value && home2.value.body && home2.value.body.wallet && home2.value.body.wallet.cache) || "devnet",
      (home2 && home2.value && home2.value.body && home2.value.body.wallet && home2.value.body.wallet.rpc) || "solana-devnet",
    ),
    health: {
      first: { ms: health1.ms, body: health1.value && health1.value.body },
      second: { ms: health2.ms, body: health2.value && health2.value.body },
    },
    keychainRpcCache: cache.ok ? cache.value.body : { error: cache.error },
    keychainHome: {
      authed: Boolean(token),
      firstMs: home1 && home1.ms,
      secondMs: home2 && home2.ms,
      wallet: home2 && home2.value && home2.value.body && home2.value.body.wallet,
      apis: home2 && home2.value && home2.value.body && home2.value.body.apis,
      connection: home2 && home2.value && home2.value.body && home2.value.body.connection,
      demoStatus: demoPost.value && demoPost.value.status,
    },
    solanaDevnet: {
      slot1: slot1.value,
      slot2: slot2.value,
      slotMs: [slot1.ms, slot2.ms],
      owner: OWNER,
      lamports1: bal1.value && bal1.value.value,
      lamports2: bal2.value && bal2.value.value,
      balanceMs: [bal1.ms, bal2.ms],
      sol: bal2.value && typeof bal2.value.value === "number" ? bal2.value.value / 1e9 : null,
    },
    demo: demoPost.value && { status: demoPost.value.status, demo: demoPost.value.body && demoPost.value.body.demo, error: demoPost.value.body && demoPost.value.body.error },
  };

  const srcOk = Object.values(report.source.home).every(Boolean)
    && Object.values(report.source.docs).every(Boolean)
    && Object.values(report.source.payments).every(Boolean);
  const ext = report.extension;
  const extOk = Boolean(
    ext
    && ext.name === "KeyShield — Sovereign Vault"
    && ext.version === "1.2.5"
    && !ext.leftover
    && ext.hasDefaultPopup
    && ext.autoDetect
    && ext.autoFill
    && ext.passkeySignin
    && ext.sessionAuto
    && ext.installHasMacPath
    && ext.installHasThreeLinePrint
    && ext.htmlReady,
  );
  const rpcOk = health1.ok && health2.ok && slot1.ok && bal1.ok && cache.ok;
  report.ok = srcOk && extOk && rpcOk;
} catch (err) {
  report.errors.push(String(err && err.stack ? err.stack : err));
}

try {
  mkdirSync(resolve(OUT, ".."), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
} catch {
  writeFileSync(resolve(ROOT, "show-everything.json"), JSON.stringify(report, null, 2));
}

function line(title, obj) {
  console.log(`\n== ${title} ==`);
  console.log(typeof obj === "string" ? obj : JSON.stringify(obj, null, 2));
}

line("HOME", report.home);
line("DOCS", report.docs);
line("PAYMENTS", report.payments);
line("EXTENSION", report.extension);
line("RPC SIM", report.rpcSim);
console.log(`\nok ${report.ok}  wrote ${OUT}`);
if (report.extension && report.extension.leftover) {
  console.log("\nleftover 1.2.4 — Remove every KeyShield card, then Load unpacked 1.2.5");
}
if (!report.ok) process.exitCode = 1;
