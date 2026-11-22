'use strict';

/**
 * KeyShield desktop shell — same src/web dashboard as
 * https://app.ks.aileena.xyz, in a Keychain-like Mac window.
 *
 * Does not reimplement vault / billing / MPP / agents / proxy.
 *
 * Launch is deliberately defensive, because this shell has failed silently
 * three times in a row: a bundle with broken helper symlinks stayed
 * "Running in Background" with no window; a wrong preflight check quit a
 * valid app before any window; a hung intercept left the Dock icon with no
 * window. Each of those is now guarded in its own place, and every launch
 * writes a plain-text log (see diagnostics.cjs) so the next failure can be
 * read instead of guessed at.
 *
 * The one failure this file still cannot see from the outside is a
 * renderer that loads but never mounts React (a blank dark window). That
 * is why createWindow() probes the page after load: if #root is still
 * empty after ten seconds, the window shows the diagnostics screen
 * (boot.html) with the reason and the captured renderer errors, instead
 * of sitting blank forever.
 */

const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  session,
  net,
  systemPreferences,
  ipcMain,
  shell,
  Notification,
  clipboard,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { inspectMacBundle, fatalMissing } = require('./runtime-preflight.cjs');
const { hasRenderer, serveDashboardRequest } = require('./renderer-server.cjs');
const { createDiagnostics } = require('./diagnostics.cjs');
const { redact } = require('./redaction.js');
const { installRequestAudit } = require('./request-audit.cjs');
const { validateRenderer, startupFailure, authorizeTouchId, runtimePreflightDetail } = require('./startup-policy.cjs');
const { syntheticOnly, bundledRequest, createBetaBoundary } = require('./beta-policy.cjs');

const SYNTHETIC_ONLY = syntheticOnly();

const diagnostics = createDiagnostics();
diagnostics.log('KeyShield desktop starting');
const betaBoundary = SYNTHETIC_ONLY ? createBetaBoundary({ rendererRoot: rendererDir, log: diagnostics.log }) : null;
if (betaBoundary) {
  betaBoundary.installMainNetwork(net);
  app.on('session-created', (ses) => betaBoundary.installSession(ses));
  shell.openExternal = async (url) => { betaBoundary.blocked(url); };
}

const DASHBOARD_HOST = 'app.ks.aileena.xyz';
const DASHBOARD_ORIGIN = `https://${DASHBOARD_HOST}`;
const PROD_API = 'https://keyshield-production.up.railway.app';
const SYNC_HOST = 'sync.ks.aileena.xyz';
const LOCAL_SYNC = 'http://127.0.0.1:8787';

const LIVE = !SYNTHETIC_ONLY && process.env.KS_DESKTOP_LIVE === '1';
const SYNC_PROXY = !SYNTHETIC_ONLY && process.env.KS_DESKTOP_SYNC_PROXY === '1';
const PACKAGED = app.isPackaged || process.env.KS_DESKTOP_FORCE_PACKAGED === '1';

function rendererDir() {
  if (!SYNTHETIC_ONLY && process.env.KS_DESKTOP_RENDERER_DIR) return process.env.KS_DESKTOP_RENDERER_DIR;
  if (app.isPackaged) return path.join(process.resourcesPath, 'renderer');
  return path.join(__dirname, 'renderer');
}

function bootHtmlPath() {
  const packaged = path.join(process.resourcesPath, 'boot.html');
  if (app.isPackaged && fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, 'boot.html');
}

function hasRendererFiles() {
  return hasRenderer(rendererDir());
}

function useBundle() {
  return !LIVE && hasRendererFiles();
}

function packagedRuntimePreflight() {
  if (process.env.KS_DESKTOP_FORCE_PREFLIGHT_FAILURE === '1') return { ok: false, missing: ['forced preflight failure'] };
  if (process.platform !== 'darwin' || !app.isPackaged) return { ok: true, skipped: true };
  const contents = path.resolve(process.resourcesPath, '..');
  return inspectMacBundle(contents);
}

function blockStartup(report, reason) {
  const fatal = report ? fatalMissing(report) : [];
  const details = [
    reason ? `Reason: ${reason}` : null,
    report?.appBundle ? `App: ${report.appBundle}` : null,
    ...fatal.map((file) => `Missing: ${file}`),
    ...(report?.warnings || []).map((file) => `Warning: ${file}`),
    `Log: ${diagnostics.logPath}`,
  ].filter(Boolean).join('\n');
  const message = [
    'KeyShield hit a launch problem. A window should still open.',
    'This local synthetic test build is not Developer ID signed or notarized.',
    'macOS Gatekeeper protections are left intact.',
    '',
    details,
  ].join('\n');
  dialog.showErrorBox('KeyShield needs a moment', redact(message));
}

function installHttpsHandler(ses) {
  if (betaBoundary) { betaBoundary.installSession(ses); return true; }
  if (process.env.KS_DESKTOP_FORCE_INTERCEPT_FAILURE === '1') throw new Error('forced HTTPS handler failure');
  if (!useBundle() && !SYNC_PROXY) return false;
  // Intercept https on this session only. Do not registerSchemesAsPrivileged('https')
  // — that replaces Chromium's standard https handler and can prevent the window
  // from ever loading.
  ses.protocol.handle('https', (request) => {
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return net.fetch(request, { bypassCustomProtocolHandlers: true });
    }
    if (useBundle() && url.hostname === DASHBOARD_HOST) {
      return serveDashboardRequest(rendererDir(), request);
    }
    if (SYNC_PROXY && url.hostname === SYNC_HOST) {
      const local = `${LOCAL_SYNC}${url.pathname}${url.search}`;
      return net.fetch(local, { bypassCustomProtocolHandlers: true });
    }
    return net.fetch(request, { bypassCustomProtocolHandlers: true });
  });
  return true;
}

function startUrl() {
  return `${DASHBOARD_ORIGIN}/`;
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label || `timeout ${ms}ms`)), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

let titleResetTimer = null;
let pendingShellFeedback = null;

function feedbackVisibilityMs(kind) {
  if (kind === 'error') return 9000;
  if (kind === 'success') return 6500;
  if (kind === 'busy') return 12000;
  return 5000;
}

function applyFeedbackToWindow(win, kind, title, visibleMs) {
  const suffix = kind === 'error' ? `Error — ${title}` : title;
  win.setTitle(`KeyShield — ${suffix}`);
  if (titleResetTimer) clearTimeout(titleResetTimer);
  if (visibleMs <= 0) return;
  titleResetTimer = setTimeout(() => {
    if (!win.isDestroyed()) win.setTitle('KeyShield');
  }, visibleMs);
}

function flushPendingShellFeedback(win) {
  if (!pendingShellFeedback || !win || win.isDestroyed()) return;
  const kind = pendingShellFeedback.kind;
  const title = pendingShellFeedback.title;
  const baseMs = feedbackVisibilityMs(kind);
  const ageMs = Date.now() - pendingShellFeedback.at;
  const remainingMs = baseMs > 0 ? Math.max(1000, baseMs - ageMs) : 0;
  applyFeedbackToWindow(win, kind, title, remainingMs);
  pendingShellFeedback = null;
}

function bringWindowToForeground(win) {
  if (!win || win.isDestroyed()) return;
  const focusNow = () => {
    if (win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    try {
      if (process.platform === 'darwin' && app.dock && typeof app.dock.show === 'function') app.dock.show();
      if (typeof app.setActivationPolicy === 'function') app.setActivationPolicy('regular');
      app.focus({ steal: true });
    } catch {
      try {
        app.focus();
      } catch {
        /* best effort */
      }
    }
    win.moveTop();
    win.focus();
  };
  focusNow();
  for (const delayMs of [140, 360, 720]) {
    setTimeout(focusNow, delayMs);
  }
}

function showShellFeedback(payload) {
  const title = redact(payload?.title || 'KeyShield');
  const detail = redact(payload?.detail || payload?.body || '');
  const kind = String(payload?.kind || 'info');
  const win = BrowserWindow.getAllWindows()[0];
  const visibleMs = feedbackVisibilityMs(kind);
  if (win && !win.isDestroyed()) {
    applyFeedbackToWindow(win, kind, title, visibleMs);
    pendingShellFeedback = null;
  } else {
    pendingShellFeedback = {
      at: Date.now(),
      kind,
      title,
    };
  }
  const focused = Boolean(win && !win.isDestroyed() && win.isFocused());
  if (kind !== 'busy' && (!focused || kind === 'error')) {
    try {
      new Notification({ title, body: detail, silent: kind !== 'error' }).show();
    } catch {
      /* notifications optional */
    }
  }
  if (kind === 'error' && process.platform === 'darwin' && app.dock) {
    app.dock.bounce('informational');
  }
}

ipcMain.on('ks-feedback', (_event, payload) => {
  showShellFeedback(payload || {});
});

ipcMain.on('ks-focus-main', () => {
  bringWindowToForeground(BrowserWindow.getAllWindows()[0]);
});

ipcMain.on('ks-open-external', (_event, url) => {
  const href = String(url || '');
  if (/^https?:\/\//i.test(href)) {
    void shell.openExternal(href);
  }
});

ipcMain.handle('ks-clipboard-write', (_event, text) => {
  clipboard.writeText(String(text || ''));
  return { ok: true };
});

ipcMain.handle('ks-reveal-log', () => {
  try {
    shell.showItemInFolder(diagnostics.logPath);
    return { ok: true, logPath: redact(diagnostics.logPath) };
  } catch (err) {
    return { ok: false, error: redact(err instanceof Error ? err.message : String(err)) };
  }
});

ipcMain.handle('ks-diagnostics', () => ({
  ok: true,
  logPath: redact(diagnostics.logPath),
  summary: diagnostics.summary(),
}));

ipcMain.handle('ks-touch-id', async (_event, reason) => {
  const result = await authorizeTouchId(systemPreferences, process.platform, redact(reason || 'Unlock KeyShield'));
  if (result.ok) {
    showShellFeedback({ kind: 'success', title: 'Unlocked with Touch ID', source: 'unlock' });
    bringWindowToForeground(BrowserWindow.getAllWindows()[0]);
  } else {
    const feedback = {
      kind: 'error',
      title: 'Touch ID authorization failed',
      detail: result.error,
      source: 'unlock',
    };
    showShellFeedback(feedback);
    try {
      await _event.sender.executeJavaScript(`window.dispatchEvent(new CustomEvent('ks-app-feedback', { detail: ${JSON.stringify(feedback)} }));`);
    } catch { /* The requesting window may have closed. */ }
  }
  return result;
});

ipcMain.on('ks-quit', () => app.quit());
ipcMain.on('ks-retry', () => {
  for (const win of BrowserWindow.getAllWindows()) win.destroy();
  void createWindow();
});

function buildMenu(win) {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            {
              label: 'Lock',
              accelerator: 'Cmd+L',
              click: () => {
                showShellFeedback({ kind: 'info', title: 'Locked', detail: 'Reloading KeyShield', source: 'unlock' });
                if (win && !win.isDestroyed()) win.reload();
              },
            },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }]
      : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        ...(!SYNTHETIC_ONLY ? [{
          label: 'Open live dashboard',
          click: () => { void shell.openExternal(DASHBOARD_ORIGIN); },
        },
        {
          label: 'API health (Railway)',
          click: () => { void shell.openExternal(`${PROD_API}/health`); },
        }] : []),
        {
          label: 'Reveal launch log',
          click: () => { shell.showItemInFolder(diagnostics.logPath); },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * Show the diagnostics screen (boot.html) with the reason for the failure
 * and the renderer errors captured so far. The screen itself offers Retry
 * (restart local startup checks), Quit, Copy diagnostics and Reveal log.
 * If boot.html itself is missing, fall back to an error box — a bundle
 * that broken still has to say so out loud.
 */
async function showDiagnosticsScreen(win, reason, detail) {
  if (!win || win.isDestroyed()) return;
  const boot = bootHtmlPath();
  diagnostics.log(`diagnostics screen: ${reason} — ${detail || ''}`);
  if (!fs.existsSync(boot)) {
    dialog.showErrorBox(
      'KeyShield could not open',
      [
        `KeyShield could not load the dashboard (${reason}).`,
        detail ? `Detail: ${redact(detail)}` : null,
        '',
        'The fallback screen is missing from this install, so there is nothing to show.',
        `Launch details were written to:\n${diagnostics.logPath}`,
      ].filter(Boolean).map(redact).join('\n'),
    );
    return;
  }
  const query = {
    reason: redact(reason || 'launch-failed'),
    detail: redact(detail).slice(0, 500),
    log: redact(diagnostics.logPath),
    errors: redact(diagnostics.recentErrors().slice(-3).map((entry) => entry.message).join(' | ')).slice(0, 500),
  };
  try {
    await win.loadFile(boot, { query });
  } catch (err) {
    diagnostics.log(`diagnostics screen failed to load: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * The page loaded, but did React mount? Poll #root for up to ten seconds.
 * Returns true once the app has rendered anything, false when the page
 * stayed empty — the blank-window failure that used to be silent.
 */
async function probeMounted(win) {
  if (!win || win.isDestroyed()) return false;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (win.isDestroyed()) return false;
    try {
      const current = win.webContents.getURL();
      if (current.includes('boot.html')) return true;
      const count = await win.webContents.executeJavaScript(
        "(() => { const root = document.getElementById('root'); return root ? root.children.length : -1; })()",
      );
      if (typeof count === 'number' && count > 0) return true;
    } catch {
      // The page may still be loading; keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function loadDashboard(win) {
  try {
    await withTimeout(win.loadFile(path.join(app.isPackaged ? process.resourcesPath : __dirname, 'loading.html')), 12000, 'loading-screen-timeout');
    await withTimeout(win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'), 2000, 'loading-paint-timeout');
    diagnostics.log('local loading screen shown');
    await withTimeout(win.loadURL(startUrl()), 12000, 'dashboard-load-timeout');
    diagnostics.log('dashboard loaded');
    return 'dashboard';
  } catch (first) {
    const detail = first instanceof Error ? first.message : String(first);
    diagnostics.log(`dashboard load failed: ${detail}`);
    if (PACKAGED) {
      await showDiagnosticsScreen(win, 'dashboard-load-failed', detail);
      return 'diagnostics';
    }
    showShellFeedback({
      kind: 'error',
      title: 'Dashboard failed to load',
      detail,
      source: 'proxy',
    });
    try {
      await withTimeout(win.loadURL(`${DASHBOARD_ORIGIN}/?desktop=1`), 10000, 'live-dashboard-timeout');
      diagnostics.log('dashboard loaded on retry');
      return 'dashboard';
    } catch {
      await showDiagnosticsScreen(win, 'dashboard-load-failed', detail);
      return 'diagnostics';
    }
  }
}

async function createWindow() {
  const ses = session.fromPartition('persist:keyshield');
  installRequestAudit(ses, SYNTHETIC_ONLY ? undefined : process.env.KS_DESKTOP_REQUEST_AUDIT);
  let failure = startupFailure({
    packaged: PACKAGED,
    preflight: packagedRuntimePreflight(),
    rendererValid: validateRenderer(rendererDir(), { requireStylesheet: !SYNTHETIC_ONLY }),
    api: process.env.KS_DESKTOP_API_URL,
  });
  if (!failure) {
    try {
      if (!SYNTHETIC_ONLY && ses.protocol.isProtocolHandled && await ses.protocol.isProtocolHandled('https')) ses.protocol.unhandle('https');
      installHttpsHandler(ses);
    } catch (err) {
      diagnostics.log(`https handler skipped: ${err instanceof Error ? err.message : String(err)}`);
      if (PACKAGED) failure = 'Bundled HTTPS handler could not be installed';
    }
  }

  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    const allow = new Set([
      'clipboard-read',
      'clipboard-sanitized-write',
      'notifications',
      'media',
      'pointerLock',
      'openExternal',
    ]);
    callback(allow.has(permission));
  });

  if (typeof ses.setDevicePermissionHandler === 'function') {
    ses.setDevicePermissionHandler((details) => {
      return details.deviceType === 'hid'
        || details.deviceType === 'serial'
        || details.deviceType === 'usb';
    });
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'KeyShield',
    backgroundColor: '#0b1226',
    show: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: SYNTHETIC_ONLY ? ['--ks-synthetic-only'] : [],
      session: ses,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  });

  win.once('ready-to-show', () => bringWindowToForeground(win));
  bringWindowToForeground(win);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (betaBoundary) { betaBoundary.blocked(url); return { action: 'deny' }; }
    if (url.startsWith(DASHBOARD_ORIGIN) || url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
      return { action: 'allow' };
    }
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (betaBoundary) {
    win.webContents.on('will-navigate', (event, url) => {
      if (!bundledRequest(url)) { event.preventDefault(); betaBoundary.blocked(url); }
    });
    win.webContents.on('will-redirect', (event, url) => {
      if (!bundledRequest(url)) { event.preventDefault(); betaBoundary.blocked(url); }
    });
  }

  win.webContents.on('did-finish-load', () => {
    if (process.platform !== 'darwin') return;
    void win.webContents.insertCSS(`
      html.ks-desktop, html { --ks-desktop-drag: 38px; overflow-y: auto !important; }
      body { overflow-y: auto !important; }
      #root > .min-h-screen { height: auto !important; min-height: 100vh; padding-top: 48px !important; padding-bottom: 32px !important; }
      #root > .min-h-screen > * { flex-shrink: 0; }
      body::before {
        content: '';
        position: fixed;
        top: 0; left: 0; right: 0;
        height: 38px;
        z-index: 9999;
        -webkit-app-region: drag;
        pointer-events: none;
      }
    `);
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    diagnostics.log(`did-fail-load ${errorCode} ${_url || ''}: ${errorDescription || ''}`);
    showShellFeedback({
      kind: 'error',
      title: 'Dashboard failed to load',
      detail: errorDescription || String(errorCode),
      source: 'proxy',
    });
    const boot = bootHtmlPath();
    if (fs.existsSync(boot) && !String(_url || '').includes('boot.html')) {
      void showDiagnosticsScreen(win, 'dashboard-load-failed', errorDescription || String(errorCode));
    }
  });

  // A renderer that loads but never mounts React used to leave a blank
  // dark window with no error anywhere. Capture console errors and a
  // crashed renderer process so the diagnostics screen can name the cause.
  win.webContents.on('console-message', (_event, level, message, _line, sourceId) => {
    const isError = level === 'error' || level === 3;
    if (isError) diagnostics.recordRendererError(message, sourceId);
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    const detail = `renderer process gone (${details.reason || 'unknown'}${details.exitCode ? `, exit ${details.exitCode}` : ''})`;
    diagnostics.log(detail);
    showShellFeedback({
      kind: 'error',
      title: 'KeyShield renderer crashed',
      detail,
      source: 'proxy',
    });
    void showDiagnosticsScreen(win, 'renderer-crashed', detail);
  });

  buildMenu(win);
  if (failure) {
    await showDiagnosticsScreen(win, 'startup-blocked', failure);
    bringWindowToForeground(win);
    return win;
  }
  const loaded = await loadDashboard(win);
  if (loaded === 'dashboard') {
    const mounted = await probeMounted(win);
    if (!mounted && !win.isDestroyed()) {
      const errors = diagnostics.recentErrors();
      await showDiagnosticsScreen(
        win,
        'blank-renderer',
        errors.length > 0
          ? errors[errors.length - 1].message
          : 'The dashboard page loaded but nothing rendered. The bundled renderer may be incomplete, or the live site failed to mount.',
      );
    }
  }
  bringWindowToForeground(win);
  flushPendingShellFeedback(win);
  return win;
}

app.setName('KeyShield');
app.commandLine.appendSwitch('enable-features', 'WebAuthentication,WebAuthenticationPasskeys');
if (process.platform === 'darwin' && typeof app.setActivationPolicy === 'function') {
  try { app.setActivationPolicy('regular'); } catch { /* older Electron */ }
}

function reportFatalError(err) {
  const message = err instanceof Error ? (err.stack || err.message) : String(err);
  diagnostics.log(`uncaught exception: ${message}`);
  dialog.showErrorBox(
    'KeyShield hit a problem',
    [
      'KeyShield hit an unexpected problem and will close.',
      redact(err instanceof Error ? err.message : String(err)),
      '',
      `Details were written to:\n${redact(diagnostics.logPath)}`,
    ].join('\n'),
  );
  app.quit();
}

process.on('uncaughtException', reportFatalError);
process.on('unhandledRejection', reportFatalError);

const gotLock = process.mas || app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      bringWindowToForeground(win);
      return;
    }
    void createWindow().then((created) => {
      bringWindowToForeground(created);
      showShellFeedback({ kind: 'info', title: 'KeyShield window restored', source: 'unlock' });
    }).catch((err) => {
      showShellFeedback({
        kind: 'error',
        title: 'Unable to restore window',
        detail: err instanceof Error ? err.message : String(err),
        source: 'unlock',
      });
    });
  });

  app.whenReady().then(async () => {
    if (betaBoundary) betaBoundary.installSession(session.defaultSession);
    const preflight = packagedRuntimePreflight();
    if (!preflight.skipped) {
      diagnostics.log(`preflight ok=${preflight.ok} ${runtimePreflightDetail(preflight)}`);
    }
    const win = await createWindow();
    bringWindowToForeground(win);
    app.on('activate', () => {
      const existing = BrowserWindow.getAllWindows()[0];
      if (existing) {
        bringWindowToForeground(existing);
        return;
      }
      void createWindow();
    });
  }).catch((err) => {
    diagnostics.log(`startup failed: ${err instanceof Error ? (err.stack || err.message) : String(err)}`);
    blockStartup(null, err instanceof Error ? err.message : String(err));
    app.quit();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
