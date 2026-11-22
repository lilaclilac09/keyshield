'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { redact } = require('./redaction.js');

function safeRuntimeEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return [...new Set(entries.filter((entry) => typeof entry === 'string').map((entry) => path.basename(entry).replace(/ /g, '_'))
    .filter((entry) => /^[A-Za-z0-9._-]+$/.test(entry) && entry !== '.' && entry !== '..' && redact(entry) === entry))];
}

function runtimePreflightDetail(report) {
  return `missing: ${safeRuntimeEntries(report.missing).join(', ') || 'none reported'}; warnings: ${safeRuntimeEntries(report.warnings).join(', ') || 'none reported'}`;
}

function validateApiOverride(value) {
  if (!value) return;
  const url = new URL(value);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
    throw new Error('API override requires HTTPS, or HTTP on loopback, without credentials or query parameters');
  }
}

function validateRenderer(root, { requireStylesheet = true } = {}) {
  try {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const refs = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)=["']([^"']+)["']/gi)].map((match) => match[1]);
    const assets = refs.filter((ref) => !/^(?:https?:\/\/|data:)/i.test(ref));
    if (!html.includes('id="root"') || !assets.some((ref) => /\.js(?:\?|$)/.test(ref)) || (requireStylesheet && !assets.some((ref) => /\.css(?:\?|$)/.test(ref)))) return false;
    return assets.every((ref) => {
      const file = path.resolve(root, ref.replace(/^\//, '').split(/[?#]/)[0]);
      return file.startsWith(`${path.resolve(root)}${path.sep}`) && fs.statSync(file).isFile();
    });
  } catch { return false; }
}

function startupFailure({ packaged, preflight, rendererValid, interceptError, api }) {
  try { validateApiOverride(api); } catch { return 'Invalid API override: HTTPS is required except on loopback'; }
  if (!packaged) return null;
  if (!preflight.ok) return `Packaged runtime preflight failed (${runtimePreflightDetail(preflight)})`;
  if (!rendererValid) return 'Bundled renderer is missing or incomplete';
  if (interceptError) return 'Bundled HTTPS handler could not be installed';
  return null;
}

async function authorizeTouchId(preferences, platform, reason) {
  try {
    if (platform !== 'darwin' || typeof preferences.promptTouchID !== 'function' || (preferences.canPromptTouchID && !preferences.canPromptTouchID())) {
      return { ok: false, error: 'Touch ID is unavailable on this device' };
    }
    await preferences.promptTouchID(reason);
    return { ok: true };
  } catch { return { ok: false, error: 'Touch ID was canceled or could not verify authorization' }; }
}

module.exports = { validateApiOverride, validateRenderer, startupFailure, authorizeTouchId, safeRuntimeEntries, runtimePreflightDetail };
