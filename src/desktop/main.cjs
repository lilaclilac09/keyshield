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

async function maybeTouchId() {
  if (process.platform !== 'darwin') return;
  if (typeof systemPreferences.promptTouchID !== 'function') return;
  try {
    await systemPreferences.promptTouchID('Unlock KeyShield');
  } catch {
    // No biometrics, user cancelled, or unsigned app — do not lock her out.
  }
}

ipcMain.handle('ks-touch-id', async (_event, reason) => {
  if (process.platform !== 'darwin' || typeof systemPreferences.promptTouchID !== 'function') {
    return { ok: true, skipped: true };
  }
  try {
    await systemPreferences.promptTouchID(String(reason || 'Unlock KeyShield'));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
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
              click: () => { if (win && !win.isDestroyed()) win.reload(); },
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

  buildMenu(win);
  await win.loadURL(startUrl());
  win.show();
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
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    await maybeTouchId();
    await createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
