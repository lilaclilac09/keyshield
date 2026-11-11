'use strict';

/**
 * KeyShield desktop shell — same src/web dashboard as
 * https://app.ks.aileena.xyz, in a Keychain-like Mac window.
 *
 * Does not reimplement vault / billing / MPP / agents / proxy.
 */

const {
  app,
  BrowserWindow,
  Menu,
  session,
  protocol,
  net,
  systemPreferences,
  ipcMain,
  shell,
  Notification,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DASHBOARD_HOST = 'app.ks.aileena.xyz';
const DASHBOARD_ORIGIN = `https://${DASHBOARD_HOST}`;
const PROD_API = 'https://keyshield-production.up.railway.app';
const SYNC_HOST = 'sync.ks.aileena.xyz';
const LOCAL_SYNC = 'http://127.0.0.1:8787';

const LIVE = process.env.KS_DESKTOP_LIVE === '1';
const SYNC_PROXY = process.env.KS_DESKTOP_SYNC_PROXY === '1';

function rendererDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'renderer');
  return path.join(__dirname, 'renderer');
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'https',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function hasRenderer() {
  try {
    return fs.existsSync(path.join(rendererDir(), 'index.html'));
  } catch {
    return false;
  }
}

function useBundle() {
  return !LIVE && hasRenderer();
}

function serveRenderer(requestUrl) {
  const root = rendererDir();
  const url = new URL(requestUrl);
  let rel = decodeURIComponent(url.pathname || '/');
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) {
    return new Response('forbidden', { status: 403 });
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return net.fetch(pathToFileURL(path.join(root, 'index.html')).toString());
  }
  return net.fetch(pathToFileURL(file).toString());
}

function installHttpsHandler(ses) {
  if (!useBundle() && !SYNC_PROXY) return;
  ses.protocol.handle('https', (request) => {
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return net.fetch(request, { bypassCustomProtocolHandlers: true });
    }
    if (useBundle() && url.hostname === DASHBOARD_HOST) {
      return serveRenderer(request.url);
    }
    if (SYNC_PROXY && url.hostname === SYNC_HOST) {
      const local = `${LOCAL_SYNC}${url.pathname}${url.search}`;
      return net.fetch(local, { bypassCustomProtocolHandlers: true });
    }
    return net.fetch(request, { bypassCustomProtocolHandlers: true });
  });
}

function startUrl() {
  if (useBundle()) return `${DASHBOARD_ORIGIN}/`;
  return `${DASHBOARD_ORIGIN}/`;
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
  const title = String(payload?.title || 'KeyShield');
  const detail = String(payload?.detail || payload?.body || '');
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

async function maybeTouchId() {
  if (process.platform !== 'darwin') return { skipped: true };
  if (typeof systemPreferences.promptTouchID !== 'function') return { skipped: true };
  try {
    await systemPreferences.promptTouchID('Unlock KeyShield');
    showShellFeedback({ kind: 'success', title: 'Unlocked with Touch ID', source: 'unlock' });
    return { ok: true };
  } catch (err) {
    // No biometrics, user cancelled, or unsigned app — do not lock her out.
    showShellFeedback({
      kind: 'info',
      title: 'Continuing without Touch ID',
      detail: err instanceof Error ? err.message : String(err),
      source: 'unlock',
    });
    return { skipped: true };
  }
}

ipcMain.handle('ks-touch-id', async (_event, reason) => {
  if (process.platform !== 'darwin' || typeof systemPreferences.promptTouchID !== 'function') {
    return { ok: true, skipped: true };
  }
  try {
    await systemPreferences.promptTouchID(String(reason || 'Unlock KeyShield'));
    showShellFeedback({ kind: 'success', title: 'Unlocked with Touch ID', source: 'unlock' });
    bringWindowToForeground(BrowserWindow.getAllWindows()[0]);
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    showShellFeedback({ kind: 'error', title: 'Touch ID cancelled', detail: error, source: 'unlock' });
    return { ok: false, error };
  }
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
        {
          label: 'Open live dashboard',
          click: () => { void shell.openExternal(DASHBOARD_ORIGIN); },
        },
        {
          label: 'API health (Railway)',
          click: () => { void shell.openExternal(`${PROD_API}/health`); },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  const ses = session.fromPartition('persist:keyshield');
  installHttpsHandler(ses);

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
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      session: ses,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(DASHBOARD_ORIGIN) || url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
      return { action: 'allow' };
    }
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('did-finish-load', () => {
    if (process.platform !== 'darwin') return;
    void win.webContents.insertCSS(`
      html.ks-desktop, html { --ks-desktop-drag: 38px; }
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
    showShellFeedback({
      kind: 'error',
      title: 'Dashboard failed to load',
      detail: errorDescription || String(errorCode),
      source: 'proxy',
    });
  });

  buildMenu(win);
  await win.loadURL(startUrl());
  win.show();
  flushPendingShellFeedback(win);
  return win;
}

app.setName('KeyShield');
app.commandLine.appendSwitch('enable-features', 'WebAuthentication,WebAuthenticationPasskeys');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    bringWindowToForeground(win);
  });

  app.whenReady().then(async () => {
    const unlock = await maybeTouchId();
    const win = await createWindow();
    if (unlock?.ok) bringWindowToForeground(win);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
