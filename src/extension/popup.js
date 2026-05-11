// KeyShield popup — standalone, no React.
// Lets the user override ks_api_base and ks_dashboard_url, and shows whether
// a token is currently registered.

const DEFAULT_API_BASE = "http://127.0.0.1:8001";
const DEFAULT_DASHBOARD_URL = "http://localhost:5173";

const $ = (id) => document.getElementById(id);

async function loadSettings() {
  const { ks_api_base, ks_dashboard_url, ks_token } =
    await chrome.storage.local.get([
      "ks_api_base",
      "ks_dashboard_url",
      "ks_token",
    ]);
  $("api").value = ks_api_base || DEFAULT_API_BASE;
  $("dash").value = ks_dashboard_url || DEFAULT_DASHBOARD_URL;
  $("conn").textContent = ks_token ? "signed in" : "no token";
}

async function saveSettings() {
  const apiBase = ($("api").value || "").trim() || DEFAULT_API_BASE;
  const dashboardUrl = ($("dash").value || "").trim() || DEFAULT_DASHBOARD_URL;
  await chrome.storage.local.set({
    ks_api_base: apiBase,
    ks_dashboard_url: dashboardUrl,
  });
  const status = $("status");
  status.textContent = "Saved";
  status.className = "status ok";
  setTimeout(() => {
    status.className = "status";
  }, 1500);
}

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  $("save").addEventListener("click", saveSettings);
});
