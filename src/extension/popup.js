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

// Production defaults — OSS fork ships with a public Railway API + keyshield.dev
// dashboard. Override via the Settings panel or set chrome.storage.
const DEFAULT_API_BASE      = "https://keyshield-production.up.railway.app";
const DEFAULT_DASHBOARD_URL = "https://keyshield.dev";

// Local dev URLs — exposed via the "Reset to local" button in the settings
// pane for users actually running the Vite + FastAPI stack on their machine.
const LOCAL_API_BASE      = "http://127.0.0.1:8001";
const LOCAL_DASHBOARD_URL = "http://127.0.0.1:5173";

// Old defaults we want to silently upgrade to production on next popup open
// so existing installs don't keep opening dead localhost tabs after the user
// shuts down their dev server. "Reset to local" still works — we only
// migrate URLs the user never explicitly chose.
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
const LEGACY_API_BASES = ["https://api.ks.aileena.xyz"];
const LEGACY_DASHBOARD_URLS = ["https://app.ks.aileena.xyz"];

// Marker we set when the user explicitly opts into a non-production target so
// the migration logic in loadSettings() doesn't fight them on every open.
const PIN_PREF_KEY = "ks_url_pref_pinned";

const $ = (id) => document.getElementById(id);

function setStatus(text, kind = "ok", ms = 1500) {
  const s = $("status");
  s.textContent = text;
  s.className = `status ${kind}`;
  if (ms > 0) setTimeout(() => { s.className = "status"; }, ms);
}

async function loadSettings() {
  const stored = await chrome.storage.local.get([
    "ks_api_base",
    "ks_dashboard_url",
    "ks_token",
    "ks_user",
    PIN_PREF_KEY,
  ]);
  const { ks_api_base, ks_dashboard_url, ks_token, ks_user } = stored;
  const pinned = !!stored[PIN_PREF_KEY];

  // Auto-correct stale defaults written by older versions:
  //   - dashboard URL pointing at a backend port (`:8001`/`:8000`) — always
  //     wrong, that's the API not the dashboard.
  //   - dashboard or API URL pointing at a localhost dev server when the
  //     user hasn't explicitly pinned a local target. We migrate to the
  //     production defaults so the Sign-in button actually opens a reachable
  //     page on a fresh install.
  let dash = ks_dashboard_url || DEFAULT_DASHBOARD_URL;
  const dashIsBackendPort = /:800[01](\/|$)/.test(dash);
  const dashIsStaleLocal  = !pinned && STALE_DASHBOARD_DEFAULTS.some((u) => dash === u || dash.startsWith(u + "/"));
  const dashIsLegacy      = !pinned && LEGACY_DASHBOARD_URLS.some((u) => dash === u || dash.startsWith(u + "/"));
  if (dashIsBackendPort || dashIsStaleLocal || dashIsLegacy) {
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

  $("api").value  = api;
  $("dash").value = dash;

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
  if (ks_token) {
    const short = ks_user ? `${ks_user.slice(0, 4)}…${ks_user.slice(-4)}` : "signed in";
    badge.textContent = hasVault ? `${short} · 🔒` : short;
    badge.title = hasVault
      ? "Token registered. Vault key registered — saves are encrypted client-side."
      : "Token registered, but no vault key yet. Saves go in plaintext until you sign the vault-unlock message in the dashboard.";
  } else {
    badge.textContent = "no token";
    badge.title = "Click Sign in to open the dashboard.";
  }
}

async function saveSettings() {
  const apiBase      = ($("api").value  || "").trim() || DEFAULT_API_BASE;
  const dashboardUrl = ($("dash").value || "").trim() || DEFAULT_DASHBOARD_URL;
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

async function openDashboardForSignin() {
  const stored = await chrome.storage.local.get(["ks_dashboard_url", PIN_PREF_KEY]);
  const pinned = !!stored[PIN_PREF_KEY];
  let url = stored.ks_dashboard_url || DEFAULT_DASHBOARD_URL;
  // Treat any stale local URL (old default that points at a dev server the
  // user might not be running) the same as a missing value, and silently
  // migrate it to the production default.
  const isBackendPort = /:800[01](\/|$)/.test(url);
  const isStaleLocal  = !pinned && STALE_DASHBOARD_DEFAULTS.some((u) => url === u || url.startsWith(u + "/"));
  const isLegacyDash  = !pinned && LEGACY_DASHBOARD_URLS.some((u) => url === u || url.startsWith(u + "/"));
  if (isBackendPort || isStaleLocal || isLegacyDash) {
    url = DEFAULT_DASHBOARD_URL;
    try { await chrome.storage.local.set({ ks_dashboard_url: url }); } catch { /* noop */ }
  }
  try { await chrome.tabs.create({ url }); }
  catch (e) {
    setStatus(`Couldn't open tab: ${String(e)}`, "err", 3000);
    return;
  }
  setStatus(`Opened ${url} — sign in there to register the token here.`, "ok", 4000);
  // Refresh state shortly after the user has had time to sign in.
  setTimeout(loadSettings, 1500);
}

async function registerManualToken() {
  const raw = ($("manual").value || "").trim();
  if (!raw) {
    setStatus("Paste a token first.", "err", 2000);
    return;
  }
  // Token format check: <base64>.<sig>.<...>  — be lenient, just non-empty.
  await chrome.storage.local.set({ ks_token: raw, ks_user: null });
  $("manual").value = "";
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
  await chrome.storage.local.set({
    ks_api_base:      LOCAL_API_BASE,
    ks_dashboard_url: LOCAL_DASHBOARD_URL,
    [PIN_PREF_KEY]:   true,    // user explicitly wants local — don't migrate
  });
  setStatus("Pointed at local dev (127.0.0.1).", "ok", 2500);
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
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local"   && (changes.ks_token || changes.ks_user || changes.ks_dashboard_url || changes.ks_api_base)) loadSettings();
  if (area === "session" && changes.ks_vault_key) {
    loadSettings();
    refreshFingerprint();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  refreshFingerprint();
  $("signin"      ).addEventListener("click", openDashboardForSignin);
  $("save"        ).addEventListener("click", saveSettings);
  $("register"    ).addEventListener("click", registerManualToken);
  $("clear"       ).addEventListener("click", clearSession);
  const ptRemote = $("point-remote");
  const ptLocal  = $("point-local");
  if (ptRemote) ptRemote.addEventListener("click", pointAtRemote);
  if (ptLocal)  ptLocal.addEventListener("click",  pointAtLocal);

  const expBtn = $("export-vault");
  const impBtn = $("import-vault");
  if (expBtn) expBtn.addEventListener("click", exportVaultToFile);
  if (impBtn) impBtn.addEventListener("click", importVaultFromFile);
});
