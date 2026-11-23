/**
 * WECG browser-agnostic shim for KeyShield.
 *
 * Chrome / Edge / Brave / Arc expose chrome.*. Firefox / Safari (and any
 * host that follows the WebExtensions Community Group `browser` namespace)
 * expose browser.*. Alias both directions so the rest of this unpacked
 * folder can keep using chrome.* without a rewrite.
 *
 * Load this folder in a browser that supports WebExtensions.
 */
(function keyShieldBrowserApi(root) {
  if (!root) return;
  if (!root.browser && root.chrome) root.browser = root.chrome;
  if (!root.chrome && root.browser) root.chrome = root.browser;
  if (root.chrome && root.browser) {
    if (!root.chrome.action && root.browser.browserAction) {
      root.chrome.action = root.browser.browserAction;
    }
    if (!root.browser.action && root.chrome.action) {
      root.browser.action = root.chrome.action;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : self);
