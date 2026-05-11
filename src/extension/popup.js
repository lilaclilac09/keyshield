// KeyShield popup — standalone, no React.
// Three entry points:
//   1. Primary "Sign in to KeyShield" button → opens the dashboard. The
//      dashboard pushes the session token back via externally_connectable
//      after wallet login. The popup auto-refreshes its status.
//   2. Settings + manual token (collapsed) → override API/dashboard URLs,
//      manually paste a token if the bridge isn't working, or sign out.
//   3. Background.js handles `OPEN_DASHBOARD_FOR_SIGNIN` and auto-corrects
//      stale `:8001` dashboard URLs to `:5173`.

const DEFAULT_API_BASE      = "http://127.0.0.1:8001";   // FastAPI control plane
const DEFAULT_DASHBOARD_URL = "http://127.0.0.1:5173";   // Vite frontend

const $ = (id) => document.getElementById(id);

function setStatus(text, kind = "ok", ms = 1500) {
  const s = $("status");
  s.textContent = text;
  s.className = `status ${kind}`;
  if (ms > 0) setTimeout(() => { s.className = "status"; }, ms);
}

async function loadSettings() {
  const { ks_api_base, ks_dashboard_url, ks_token, ks_user } =
    await chrome.storage.local.get([
      "ks_api_base",
      "ks_dashboard_url",
      "ks_token",
      "ks_user",
    ]);

  // Auto-correct a stale dashboard URL pointing at the backend port.
  let dash = ks_dashboard_url || DEFAULT_DASHBOARD_URL;
  if (/:800[01](\/|$)/.test(dash)) {
    dash = DEFAULT_DASHBOARD_URL;
    try { await chrome.storage.local.set({ ks_dashboard_url: dash }); } catch { /* noop */ }
  }

  $("api").value  = ks_api_base || DEFAULT_API_BASE;
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
  await chrome.storage.local.set({
    ks_api_base:      apiBase,
    ks_dashboard_url: dashboardUrl,
  });
  setStatus("Saved");
}

async function openDashboardForSignin() {
  const { ks_dashboard_url } = await chrome.storage.local.get(["ks_dashboard_url"]);
  let url = ks_dashboard_url || DEFAULT_DASHBOARD_URL;
  if (/:800[01](\/|$)/.test(url)) url = DEFAULT_DASHBOARD_URL;
  try { await chrome.tabs.create({ url }); }
  catch (e) {
    setStatus(`Couldn't open tab: ${String(e)}`, "err", 3000);
    return;
  }
  setStatus("Opened dashboard. Sign in there to register the token here.", "ok", 4000);
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
  try {
    const u = new URL(raw);
    if (u.hostname.startsWith("api.")) {
      const dashHost = u.hostname.replace(/^api\./, "app.");
      await chrome.storage.local.set({ ks_dashboard_url: `https://${dashHost}` });
    }
  } catch { /* noop */ }
  setStatus(`Pointed at ${raw}.`, "ok", 2500);
  loadSettings();
}

async function pointAtLocal() {
  await chrome.storage.local.set({
    ks_api_base:      DEFAULT_API_BASE,
    ks_dashboard_url: DEFAULT_DASHBOARD_URL,
  });
  setStatus("Reset to local backend.", "ok", 2500);
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
