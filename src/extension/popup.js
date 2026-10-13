// KeyShield popup — standalone, no React.
// Three entry points:
//   1. Primary "Sign in to KeyShield" button → opens the dashboard. The
//      dashboard pushes the session token back via externally_connectable
//      after wallet login. The popup auto-refreshes its status.
//   2. Settings + manual token (collapsed) → override API/dashboard URLs,
//      manually paste a token if the bridge isn't working, or sign out.
//   3. Background.js handles `OPEN_DASHBOARD_FOR_SIGNIN` and auto-corrects
//      stale dashboard URLs (old `:5173`/`:8001` defaults from earlier
//      builds) to the public API / dashboard defaults below, unless
//      the user has explicitly pinned a non-production target.

// Sign-in default is the hosted dashboard. keyshield.dev has no DNS.
// ks.app.aileena.xyz is the wrong label — the real host is app.ks.aileena.xyz.
// Local Vite is Settings → Use local dev (127.0.0.1:5173), not the default.
const PROD_API_BASE       = "https://keyshield-production.up.railway.app";
const PROD_DASHBOARD_URL  = "https://app.ks.aileena.xyz";
const LOCAL_API_BASE      = "http://127.0.0.1:8001";
const LOCAL_DASHBOARD_URL = "http://127.0.0.1:5173";
const DEFAULT_API_BASE      = PROD_API_BASE;
const DEFAULT_DASHBOARD_URL = "https://app.ks.aileena.xyz";

const STALE_DASHBOARD_DEFAULTS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
];
const STALE_API_DEFAULTS = [
  "http://127.0.0.1:8001",
  "http://localhost:8001",
  "http://127.0.0.1:8000",
  "http://localhost:8000",
];
const LEGACY_API_BASES = [];

const DEAD_DASHBOARD_URLS = [
  "https://keyshield.dev",
  "https://www.keyshield.dev",
  "https://app.keyshield.dev",
  "https://ks.app.aileena.xyz",
];

function isDeadDashboardUrl(url) {
  const u = String(url || "").replace(/\/+$/, "");
  return DEAD_DASHBOARD_URLS.some((d) => u === d || u.startsWith(`${d}/`));
}

// Marker we set when the user explicitly opts into a non-production target so
// the migration logic in loadSettings() doesn't fight them on every open.
const PIN_PREF_KEY = "ks_url_pref_pinned";

function $(id) {
  try { return document.getElementById(id); } catch { return null; }
}

function manifestVersion() {
  try { return String(chrome.runtime.getManifest().version || "").trim(); }
  catch { return ""; }
}

function paintLoadedBuild() {
  const ver = manifestVersion() || "?";
  const build = $("build");
  if (build) build.textContent = `v${ver} · KeyShield — Sovereign Vault`;
  const ready = $("detect-ready");
  if (ready && !/ok 1\.2\.[45]/.test(ready.textContent || "")) {
    ready.textContent = `checking ${ver} + <all_urls>…`;
    ready.style.display = "block";
  }
}

function setStatus(text, kind = "ok", ms = 1500) {
  const s = $("status");
  if (!s) return;
  s.textContent = text;
  s.className = `status ${kind}`;
  if (ms > 0) setTimeout(() => { s.className = "status"; }, ms);
}

function formatCollectedCount(n) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  return count === 1 ? "1 collected" : `${count} collected`;
}

function formatFilledCount(n) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  return count === 1 ? "1 filled" : `${count} filled`;
}

function formatPopupMs(ms) {
  if (ms == null || !Number.isFinite(Number(ms)) || Number(ms) < 0) return "—";
  return `${Math.max(0, Math.round(Number(ms)))}ms`;
}

function formatFilledLine(filled, ms) {
  return `${formatFilledCount(filled)} · ${formatPopupMs(ms)}`;
}

function formatSignedStatus(signed) {
  return signed ? "signed" : "Sign in";
}

function paintCopyStatus(text, kind = "") {
  const el = $("copy-status");
  if (el) {
    el.textContent = text;
    el.className = `line ${kind}`.trim();
  }
  const filled = $("filled-line");
  if (filled && text) {
    filled.textContent = text;
    filled.className = `line ${kind}`.trim();
  }
}

function paintFilledLine(filled, ms, kind = "ok") {
  const text = formatFilledLine(filled, ms);
  paintCopyStatus(text, kind);
  const msEl = $("fill-ms");
  if (msEl) msEl.textContent = formatPopupMs(ms);
}

function paintSignedStatus(signed) {
  const el = $("signed-status");
  if (!el) return;
  // Signed-in hero is the vault count ("5 saved"), not the word "signed".
  if (!signed) el.textContent = formatSignedStatus(false);
}

function formatDetectReadyLine(version, hasAllUrls) {
  const ver = String(version || "").trim();
  if ((ver === "1.2.5" || ver === "1.2.4") && hasAllUrls) return { ok: true, text: `ok ${ver} <all_urls>` };
  if (!hasAllUrls) {
    return { ok: false, text: `need Remove + Load unpacked · v${ver || "?"} missing <all_urls>` };
  }
  return { ok: false, text: `need Remove + Load unpacked · v${ver} (want 1.2.5)` };
}

async function hasAllUrlsPermission() {
  try {
    if (chrome.permissions?.contains) {
      return await chrome.permissions.contains({ origins: ["<all_urls>"] });
    }
  } catch { /* treat as missing so the badge says Remove + Load unpacked */ }
  return false;
}

async function refreshDetectReady() {
  const el = $("detect-ready");
  const ver = chrome.runtime.getManifest().version;
  const hasAllUrls = await hasAllUrlsPermission();
  const ready = formatDetectReadyLine(ver, hasAllUrls);
  if (el) {
    el.textContent = ready.text;
    el.className = `status ${ready.ok ? "ok" : "err"}`;
    el.style.display = "block";
  }
  const latest = $("ext-latest");
  if (latest) {
    latest.textContent = ver === "1.2.5" ? "1.2.5 · latest" : "";
    latest.style.display = ver === "1.2.5" ? "block" : "none";
  }
  let auto = false;
  try {
    const stored = await chrome.storage.local.get("ks_auto_store");
    auto = !!stored.ks_auto_store;
  } catch { /* noop */ }
  const line = $("detect-line");
  if (line) {
    line.textContent = ready.ok
      ? (auto ? `detect on · ok ${ver}` : `detect ready · ok ${ver}`)
      : `detect · ${ready.text}`;
    line.className = `line ${ready.ok ? "ok" : "err"}`;
  }
  return ready;
}

async function armLiveScanAfterLogin() {
  const { ks_token } = await chrome.storage.local.get("ks_token");
  if (!ks_token) return;
  await chrome.storage.local.set({ ks_auto_store: true });
  try { await chrome.runtime.sendMessage({ type: "INJECT_DETECT" }); } catch { /* sw cold */ }
  try { await refreshSavedApis(); } catch { /* vault list paints on next open */ }
}

function summarizeSavedApis(data) {
  const rows = Array.isArray(data)
    ? data
    : data && Array.isArray(data.items)
      ? data.items
      : data && Array.isArray(data.keys)
        ? data.keys
        : [];
  const out = [];
  for (const it of rows) {
    if (!it || typeof it !== "object") continue;
    const upstream = String(it.upstream || "").toLowerCase().trim();
    if (!upstream) continue;
    let masked = String(it.masked_value || "").trim();
    if (!masked) masked = it.cipher ? "encrypted" : "saved";
    out.push({
      id: String(it.id || upstream),
      upstream,
      name: String(it.name || `${upstream} key`),
      masked,
      family: String(it.family || ""),
      product: String(it.product || ""),
      domain: String(it.domain || ""),
      expires_at: it.expires_at ? String(it.expires_at) : null,
      created_at: it.created_at ? String(it.created_at) : null,
      notes: String(it.notes || ""),
    });
  }
  return out;
}

function formatApiRowTitle(api) {
  const name = String((api && api.name) || "").trim();
  return name || String((api && api.upstream) || "API");
}

function formatApiRowNote(api) {
  if (!api) return "";
  if (api.notes) return String(api.notes);
  const bits = [api.family, api.product, api.domain].filter(Boolean);
  const exp = api.expires_at ? `expires ${String(api.expires_at).slice(0, 10)}` : "";
  if (exp) bits.push(exp);
  if (api.masked) bits.push(api.masked);
  return bits.join(" · ");
}

function applySignedInChrome(signed) {
  try { document.body.classList.toggle("signed-in", !!signed); } catch { /* noop */ }
}

function formatSavedCount(n) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  return count === 1 ? "1 saved" : `${count} saved`;
}

function listedApiCount(box, apis) {
  const fromApis = Array.isArray(apis) ? apis.length : 0;
  const fromDom = box && box.querySelectorAll ? box.querySelectorAll(".api-row").length : 0;
  return Math.max(fromApis, fromDom);
}

function looksLikeSessionToken(raw) {
  return String(raw || "").trim().length >= 12;
}

function paintSavedCount(n) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  const saved = formatSavedCount(count);
  const collected = formatCollectedCount(count);
  const signedIn = count > 0 || document.body.classList.contains("signed-in");
  const signedEl = $("signed-status");
  if (signedEl) signedEl.textContent = signedIn ? saved : formatSignedStatus(false);
  const hero = $("saved-count");
  if (hero) hero.textContent = saved;
  const collectedEl = $("collected-line");
  if (collectedEl) {
    collectedEl.textContent = collected;
    collectedEl.className = "line ok";
  }
  const badge = $("conn");
  if (badge && document.body.classList.contains("signed-in")) {
    badge.textContent = saved;
    badge.title = saved;
  }
}

function hideLeftoverCopyButtons() {
  ["copy-cursor-key", "copy-cursor-key-signed"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.hidden = true;
    try { el.style.display = "none"; } catch { /* leftover node */ }
  });
}

const DASHBOARD_HARVEST_URLS = [
  "https://app.ks.aileena.xyz/*",
  "https://*.aileena.xyz/*",
  "http://127.0.0.1:5173/*",
  "http://localhost:5173/*",
];

async function harvestTokenFromDashboardTabs() {
  if (!chrome.scripting || !chrome.tabs) return null;
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: DASHBOARD_HARVEST_URLS });
  } catch {
    try { tabs = await chrome.tabs.query({}); } catch { return null; }
  }
  let foundUser = null;
  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    if (!/ks\.aileena\.xyz|127\.0\.0\.1:5173|localhost:5173/.test(tab.url)) continue;
    try {
      const injected = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({
          token: localStorage.getItem("ks_token") || "",
          user: localStorage.getItem("ks_wallet") || localStorage.getItem("ks_passkey_user") || "",
        }),
      });
      const result = injected && injected[0] && injected[0].result;
      if (result && looksLikeSessionToken(result.token)) {
        await chrome.storage.local.set({
          ks_token: result.token,
          ks_user: result.user || null,
          ks_auto_store: true,
        });
        return result.token;
      }
      if (result && result.user && !foundUser) foundUser = result.user;
    } catch { /* restricted tab */ }
  }
  if (foundUser) {
    try { await chrome.storage.local.set({ ks_user: foundUser }); } catch { /* noop */ }
  }
  return null;
}

async function refreshSavedApis() {
  const box = $("saved-apis");
  const empty = $("saved-empty");
  let resp;
  try {
    resp = await chrome.runtime.sendMessage({ type: "LIST_SAVED_APIS" });
  } catch {
    resp = { ok: false, apis: [] };
  }
  const apis = resp && Array.isArray(resp.apis) ? resp.apis : [];
  if (box) {
    box.replaceChildren();
    for (const api of apis) {
      const row = document.createElement("div");
      row.className = "api-row";
      const name = document.createElement("strong");
      name.textContent = formatApiRowTitle(api);
      const note = document.createElement("span");
      note.className = "api-note";
      note.textContent = formatApiRowNote(api);
      const mask = document.createElement("code");
      mask.textContent = api.masked;
      row.append(name, note, mask);
      box.appendChild(row);
    }
  }
  if (empty) empty.style.display = apis.length ? "none" : "block";
  paintSavedCount(listedApiCount(box, apis));
  return apis;
}

async function refreshFillStatus() {
  const started = Date.now();
  let filled = 0;
  let kind = "ok";
  try {
    const resp = await chrome.runtime.sendMessage({ type: "FILL_PAGE_NOW" });
    if (resp && typeof resp.filled === "number") filled = resp.filled;
    if (resp && resp.reason === "restricted-tab") kind = "";
  } catch {
    kind = "";
  }
  const ms = Date.now() - started;
  try {
    await chrome.storage.local.set({ ks_last_fill: { filled, ms, at: Date.now() } });
  } catch { /* noop */ }
  paintFilledLine(filled, ms, kind);
  return { filled, ms };
}

async function loadSettings() {
  const stored = await chrome.storage.local.get([
    "ks_api_base",
    "ks_dashboard_url",
    "ks_token",
    "ks_user",
    PIN_PREF_KEY,
  ]);
  let { ks_api_base, ks_dashboard_url, ks_token, ks_user } = stored;
  const pinned = !!stored[PIN_PREF_KEY];
  if (!looksLikeSessionToken(ks_token)) {
    const harvested = await harvestTokenFromDashboardTabs();
    if (harvested) {
      const again = await chrome.storage.local.get(["ks_token", "ks_user"]);
      ks_token = again.ks_token;
      ks_user = again.ks_user;
    }
  }

  // Auto-correct stale defaults written by older versions:
  //   - dashboard URL pointing at a backend port (`:8001`/`:8000`) — always
  //     wrong, that's the API not the dashboard.
  //   - dashboard or API URL pointing at a localhost dev server when the
  //     user hasn't explicitly pinned a local target. We migrate to the
  //     production defaults so the Sign-in button actually opens a reachable
  //     page on a fresh install.
  let dash = ks_dashboard_url || DEFAULT_DASHBOARD_URL;
  const dashIsBackendPort = /:800[01](\/|$)/.test(dash);
  const dashIsStaleLocal  = STALE_DASHBOARD_DEFAULTS.some((u) => dash === u || dash.startsWith(u + "/"));
  // 5173 is only kept when the user pinned local. A leftover 1.1.3 default
  // (or a refused Vite) must not stay as the Sign-in target.
  if (dashIsBackendPort || isDeadDashboardUrl(dash) || (!pinned && dashIsStaleLocal)) {
    dash = DEFAULT_DASHBOARD_URL;
    try { await chrome.storage.local.set({ ks_dashboard_url: dash }); } catch { /* noop */ }
  }

  let api = ks_api_base || DEFAULT_API_BASE;
  const apiIsStaleLocal = !pinned && STALE_API_DEFAULTS.some((u) => api === u || api.startsWith(u + "/"));
  const apiIsLegacy     = !pinned && LEGACY_API_BASES.some((u) => api === u || api.startsWith(u + "/"));
  if (apiIsStaleLocal || apiIsLegacy) {
    api = DEFAULT_API_BASE;
    try { await chrome.storage.local.set({ ks_api_base: api }); } catch { /* noop */ }
  }

  const apiEl = $("api");
  const dashEl = $("dash");
  if (apiEl) apiEl.value = api;
  if (dashEl) dashEl.value = dash;
  const build = $("build");
  if (build) {
    const ver = manifestVersion() || "?";
    build.textContent = `v${ver} · Sign-in opens ${dash}`;
  }
  await refreshDetectReady();
  const signed = looksLikeSessionToken(ks_token);
  applySignedInChrome(signed);
  paintSignedStatus(signed);
  if (signed) {
    await armLiveScanAfterLogin();
    await refreshSavedApis();
  } else {
    paintSavedCount(0);
  }
  await refreshFillStatus();

  // Pre-fill the "Remote API base" input if we're currently pointed at one
  // (i.e. not the local default). Leaves the placeholder visible otherwise.
  const remoteInput = $("remote");
  if (remoteInput) {
    if (ks_api_base && !/^https?:\/\/(127\.0\.0\.1|localhost)\b/i.test(ks_api_base)) {
      remoteInput.value = ks_api_base;
    } else {
      remoteInput.value = "";
    }
  }

  // Also report whether a vault key (Path A lite) is registered. Session
  // storage gets cleared on browser close, so this lives separate from
  // the token state.
  const session = await chrome.storage.session.get("ks_vault_key");
  const hasVault = !!session.ks_vault_key;

  const badge = $("conn");
  const signinBtn = $("signin");
  if (signed) {
    const short = ks_user ? `${ks_user.slice(0, 4)}…${ks_user.slice(-4)}` : "signed in";
    if (badge && !/saved$/.test(badge.textContent || "")) {
      badge.textContent = short;
    }
    if (badge) {
      badge.title = hasVault
        ? `${short} · vault key on this device`
        : `${short} · detect stays on`;
    }
    if (signinBtn) signinBtn.textContent = "Open KeyShield";
  } else {
    if (badge) {
      badge.textContent = "no token";
      badge.title = "Sign in on app.ks.aileena.xyz — this popup reads that tab.";
    }
    if (signinBtn) signinBtn.textContent = ks_user ? "Sign in with passkey" : "Sign in";
  }
}

async function autoDetectAndFill() {
  const stored = await chrome.storage.local.get(["ks_token", "ks_user", "ks_auto_store", "ks_pending_vault"]);
  if (!looksLikeSessionToken(stored.ks_token)) {
    await harvestTokenFromDashboardTabs();
  }
  const again = await chrome.storage.local.get(["ks_token", "ks_user", "ks_pending_vault"]);
  const signed = looksLikeSessionToken(again.ks_token);
  const pending = Array.isArray(again.ks_pending_vault) && again.ks_pending_vault.length;
  if (signed) {
    try { await chrome.storage.local.set({ ks_auto_store: true }); } catch { /* noop */ }
  }
  if (signed || pending) {
    await refreshFillStatus();
    [400, 1200, 2500].forEach((ms) => {
      setTimeout(() => { Promise.resolve(refreshFillStatus()).catch(() => {}); }, ms);
    });
    return;
  }
  if (again.ks_user) {
    setStatus("Passkey session needed — Sign in, then this tab fills.", "ok", 5000);
  }
}

async function saveSettings() {
  const apiBase      = (($("api") && $("api").value)  || "").trim() || DEFAULT_API_BASE;
  const dashboardUrl = (($("dash") && $("dash").value) || "").trim() || DEFAULT_DASHBOARD_URL;
  // If the user typed a non-production URL by hand, treat that as a pin so
  // we don't silently revert it to production on the next popup open.
  const isProd =
    apiBase      === DEFAULT_API_BASE &&
    dashboardUrl === DEFAULT_DASHBOARD_URL;
  await chrome.storage.local.set({
    ks_api_base:      apiBase,
    ks_dashboard_url: dashboardUrl,
    [PIN_PREF_KEY]:   !isProd,
  });
  setStatus("Saved");
}

function hostedSigninHref() {
  return "https://app.ks.aileena.xyz/?ext=1&demo=shop";
}

function localSigninHref() {
  return "http://127.0.0.1:5173/?local=1&ext=1&demo=shop";
}

async function probeLocalDashboard() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 400);
  try {
    await fetch("http://127.0.0.1:5173/", { method: "GET", cache: "no-store", signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function unpinDeadLocal() {
  await chrome.storage.local.set({
    ks_dashboard_url: DEFAULT_DASHBOARD_URL,
    [PIN_PREF_KEY]: false,
  });
}

async function openDashboardForSignin() {
  const stored = await chrome.storage.local.get([PIN_PREF_KEY, "ks_dashboard_url"]);
  const dash = String(stored.ks_dashboard_url || "");
  const pinnedLocal = !!stored[PIN_PREF_KEY] && /127\.0\.0\.1:5173|localhost:5173/.test(dash);
  let usedLocal = false;
  let url = hostedSigninHref();
  if (pinnedLocal) {
    usedLocal = await probeLocalDashboard();
    if (usedLocal) url = localSigninHref();
    else await unpinDeadLocal();
  } else {
    try { await chrome.storage.local.set({ ks_dashboard_url: "https://app.ks.aileena.xyz" }); } catch { /* noop */ }
  }
  try { await chrome.tabs.create({ url }); }
  catch (e) {
    setStatus(`Couldn't open tab: ${String(e)}`, "err", 3000);
    return;
  }
  const { ks_token } = await chrome.storage.local.get("ks_token");
  if (usedLocal) {
    setStatus("Opened local dashboard (5173 is live).", "ok", 4000);
  } else if (pinnedLocal) {
    setStatus("5173 refused — opened https://app.ks.aileena.xyz instead.", "ok", 5000);
  } else if (ks_token) {
    setStatus("Opened signed-in dashboard (shop + RPC).", "ok", 4000);
  } else {
    setStatus("Opened hosted Sign-in — wallet once, then shop + RPC.", "ok", 4000);
  }
  [800, 2000, 4000, 8000].forEach((ms) => setTimeout(loadSettings, ms));
}

async function fillActiveTab() {
  const started = Date.now();
  let resp;
  try {
    resp = await chrome.runtime.sendMessage({ type: "FILL_PAGE_NOW" });
  } catch (e) {
    paintFilledLine(0, Date.now() - started, "err");
    setStatus(`Fill failed: ${String(e)}`, "err", 3500);
    return;
  }
  const filled = resp && typeof resp.filled === "number" ? resp.filled : 0;
  const ms = Date.now() - started;
  try {
    await chrome.storage.local.set({ ks_last_fill: { filled, ms, at: Date.now() } });
  } catch { /* noop */ }
  paintFilledLine(filled, ms, resp && resp.ok ? "ok" : "err");
  if (resp && resp.ok) {
    setStatus(
      filled
        ? `Pasted ${filled} saved key${filled === 1 ? "" : "s"} into empty API boxes.`
        : "No empty API box on this tab.",
      "ok",
      5000,
    );
    return;
  }
  if (resp && resp.reason === "restricted-tab") {
    setStatus("This tab cannot be filled. Open a https page with an API box.", "err", 4000);
    return;
  }
  setStatus(`Fill skipped: ${resp?.reason || "no keys"}. Sign in, then try again.`, "err", 4000);
}

async function copyPreferredCursorKey() {
  // Leftover "Copy Cursor key" must paste into the tab, not the clipboard.
  return fillActiveTab();
}

async function allowDetectAndStore() {
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: ["<all_urls>"] });
  } catch (e) {
    setStatus(`Permission request failed: ${String(e)}`, "err", 3000);
    return;
  }
  if (!granted) {
    setStatus("Detect permission denied.", "err", 2500);
    return;
  }
  await chrome.storage.local.set({ ks_auto_store: true });
  let injected = 0;
  try {
    const resp = await chrome.runtime.sendMessage({ type: "INJECT_DETECT" });
    if (resp && typeof resp.injected === "number") injected = resp.injected;
  } catch { /* service worker cold */ }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id && /^https?:/.test(tab.url || "")) await chrome.tabs.reload(tab.id);
  } catch { /* noop */ }
  setStatus(
    injected
      ? `Detect + auto-save on. Wired ${injected} tab${injected === 1 ? "" : "s"}. A key on the page must toast.`
      : "Detect + auto-save on. Reload the page if the toast is missing.",
    "ok",
    5000,
  );
  await refreshDetectReady();
}

async function registerManualToken() {
  const manual = $("manual");
  const raw = ((manual && manual.value) || "").trim();
  if (!raw) {
    setStatus("Paste a token first.", "err", 2000);
    return;
  }
  // Token format check: <base64>.<sig>.<...>  — be lenient, just non-empty.
  await chrome.storage.local.set({ ks_token: raw, ks_user: null });
  if (manual) manual.value = "";
  setStatus("Token registered. Save flow now uses Authorization header.", "ok", 3000);
  loadSettings();
}

async function clearSession() {
  await chrome.storage.local.remove(["ks_token", "ks_user"]);
  try { await chrome.storage.session.remove("ks_vault_key"); } catch { /* noop */ }
  setStatus("Signed out — token and vault key cleared.", "ok", 2500);
  loadSettings();
}

// ── Cross-device sync proof ────────────────────────────────────────────────
// Fetch the SHA-256(vault_key)[:4] fingerprint from the background worker
// and render it. Because the vault key is HKDF-SHA256(walletSig), the same
// wallet produces the same fingerprint on every browser — visible proof
// that cross-device sync works.
async function refreshFingerprint() {
  const fp = $("fingerprint");
  if (!fp) return;
  try {
    const resp = await chrome.runtime.sendMessage({ type: "GET_VAULT_FINGERPRINT" });
    if (resp && resp.ok && typeof resp.fingerprint === "string") {
      fp.textContent = resp.fingerprint;
      fp.title = "First 4 bytes of SHA-256(vault key), hex. Same wallet → same value on any browser.";
    } else {
      fp.textContent = "—";
      fp.title = "No vault key yet. Sign in via the dashboard and sign the vault-unlock message.";
    }
  } catch (e) {
    fp.textContent = "—";
    fp.title = `Couldn't fetch fingerprint: ${String(e)}`;
  }
}

function _looksLikeHttpsUrl(u) {
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch { return false; }
}

async function pointAtRemote() {
  const raw = ($("remote").value || "").trim().replace(/\/+$/, "");
  if (!raw) {
    setStatus("Enter a remote URL first.", "err", 2500);
    return;
  }
  if (!_looksLikeHttpsUrl(raw) || !/^https:\/\//i.test(raw)) {
    setStatus("Remote URL must start with https://", "err", 2800);
    return;
  }
  await chrome.storage.local.set({ ks_api_base: raw });
  // Best-effort: if the host looks like api.<domain>, infer dashboard at <domain> or app.<domain>.
  let dashboardUrl = null;
  try {
    const u = new URL(raw);
    if (u.hostname.startsWith("api.")) {
      const dashHost = u.hostname.replace(/^api\./, "app.");
      dashboardUrl = `https://${dashHost}`;
      await chrome.storage.local.set({ ks_dashboard_url: dashboardUrl });
    }
  } catch { /* noop */ }
  // Pin only if the chosen target isn't the production default — otherwise
  // leave the marker untouched so future "production" upgrades still apply.
  const isProd =
    raw === DEFAULT_API_BASE &&
    (dashboardUrl === null || dashboardUrl === DEFAULT_DASHBOARD_URL);
  await chrome.storage.local.set({ [PIN_PREF_KEY]: !isProd });
  setStatus(`Pointed at ${raw}.`, "ok", 2500);
  loadSettings();
}

async function pointAtLocal() {
  const live = await probeLocalDashboard();
  if (!live) {
    await unpinDeadLocal();
    setStatus("5173 refused. Sign-in stays on app.ks.aileena.xyz. Start Vite only if you need a local dashboard.", "err", 5000);
    loadSettings();
    return;
  }
  await chrome.storage.local.set({
    ks_api_base:      LOCAL_API_BASE,
    ks_dashboard_url: LOCAL_DASHBOARD_URL,
    [PIN_PREF_KEY]:   true,    // user explicitly wants local — don't migrate
  });
  setStatus("Pointed at local Vite (5173 is live).", "ok", 2500);
  loadSettings();
}

async function pointAtProduction() {
  await chrome.storage.local.set({
    ks_api_base:      PROD_API_BASE,
    ks_dashboard_url: PROD_DASHBOARD_URL,
    [PIN_PREF_KEY]:   true,
  });
  setStatus("Pointed at production (app.ks.aileena.xyz).", "ok", 2500);
  loadSettings();
}

// ── Backup & restore ────────────────────────────────────────────────────────
// Export hits EXPORT_VAULT in background.js → returns stringified JSON we
// download as a file. Import reads the chosen file and posts each item back
// to /manage/store via IMPORT_VAULT. Status renders in the #backup-status
// banner inside the Backup & restore <details> block (just below the inputs).

function setBackupStatus(text, kind = "ok", ms = 0) {
  const s = $("backup-status");
  if (!s) return;
  s.textContent = text;
  s.className = `status ${kind}`;
  if (ms > 0) setTimeout(() => { s.className = "status"; }, ms);
}

function _ts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

async function exportVaultToFile() {
  setBackupStatus("Exporting…", "ok");
  let resp;
  try {
    resp = await chrome.runtime.sendMessage({ type: "EXPORT_VAULT" });
  } catch (e) {
    setBackupStatus(`Export failed: ${String(e)}`, "err");
    return;
  }
  if (!resp || !resp.ok) {
    setBackupStatus(`Export failed: ${resp?.reason || "unknown"}`, "err");
    return;
  }
  let n = 0;
  try { n = JSON.parse(resp.json).items.length; } catch { /* noop */ }

  const blob = new Blob([resp.json], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `keyshield-backup-${_ts()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  setBackupStatus(`Exported ${n} item${n === 1 ? "" : "s"}. Save this file somewhere safe.`, "ok");
}

async function importVaultFromFile() {
  const input = $("import-file");
  const file  = input && input.files && input.files[0];
  if (!file) {
    setBackupStatus("Choose a JSON file first.", "err", 3000);
    return;
  }
  setBackupStatus("Restoring…", "ok");

  const text = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsText(file);
  }).catch((e) => { setBackupStatus(`Couldn't read file: ${String(e)}`, "err"); return null; });
  if (text === null) return;

  let resp;
  try {
    resp = await chrome.runtime.sendMessage({ type: "IMPORT_VAULT", json: text });
  } catch (e) {
    setBackupStatus(`Restore failed: ${String(e)}`, "err");
    return;
  }
  if (!resp || !resp.ok) {
    setBackupStatus(`Restore failed: ${resp?.reason || "unknown"}`, "err");
    return;
  }

  const { imported, skipped, warnFingerprint } = resp;
  const tail = warnFingerprint
    ? " — fingerprint mismatch, decryption may fail."
    : skipped > 0
      ? ` (${skipped} skipped).`
      : ".";
  setBackupStatus(`Imported ${imported} item${imported === 1 ? "" : "s"}${tail}`, warnFingerprint ? "err" : "ok");
}

// Re-render whenever background storage changes (token push from dashboard,
// vault key registration, etc.) — gives the popup live status without polling.
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local"   && (changes.ks_token || changes.ks_user || changes.ks_dashboard_url || changes.ks_api_base)) {
      loadSettings();
      refreshSavedApis();
    }
    if (area === "session" && changes.ks_vault_key) {
      loadSettings();
      refreshFingerprint();
    }
  });
} catch { /* bootPopup still paints Sign-in / Fill */ }

function onClick(id, handler) {
  const el = $(id);
  if (!el) return;
  el.addEventListener("click", () => {
    Promise.resolve(handler()).catch((e) => setStatus(String(e), "err", 3500));
  });
}

function bootPopup() {
  if (bootPopup._done) return;
  bootPopup._done = true;
  hideLeftoverCopyButtons();
  paintLoadedBuild();
  Promise.resolve(refreshDetectReady()).catch(() => {});
  Promise.resolve(loadSettings())
    .then(() => autoDetectAndFill())
    .catch((e) => {
      setStatus(`Popup load failed: ${String(e)}`, "err", 4000);
    });
  Promise.resolve(refreshFingerprint()).catch(() => {});
  onClick("signin", openDashboardForSignin);
  onClick("allow-detect", allowDetectAndStore);
  onClick("fill-tab", fillActiveTab);
  onClick("fill-tab-signed", fillActiveTab);
  onClick("copy-cursor-key", copyPreferredCursorKey);
  onClick("copy-cursor-key-signed", copyPreferredCursorKey);
  [600, 1600, 3500].forEach((ms) => setTimeout(() => {
    Promise.resolve(loadSettings()).catch(() => {});
  }, ms));
  onClick("use-hosted-top", pointAtProduction);
  onClick("save", saveSettings);
  onClick("register", registerManualToken);
  onClick("clear", clearSession);
  onClick("clear-top", clearSession);
  onClick("point-remote", pointAtRemote);
  onClick("point-local", pointAtLocal);
  onClick("point-prod", pointAtProduction);
  onClick("export-vault", exportVaultToFile);
  onClick("import-vault", importVaultFromFile);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootPopup);
} else {
  bootPopup();
}
