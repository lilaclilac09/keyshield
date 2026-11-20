'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const syntheticOnly = process.mas || process.argv.includes('--ks-synthetic-only');

contextBridge.exposeInMainWorld('keyshieldDesktop', {
  isDesktop: true,
  platform: process.platform,
  syntheticOnly: Boolean(syntheticOnly),
  apiBase: syntheticOnly ? '' : String(process.env.KS_DESKTOP_API_URL || '').trim(),
  live: !syntheticOnly && process.env.KS_DESKTOP_LIVE === '1',
  promptTouchID: (reason) => ipcRenderer.invoke('ks-touch-id', reason || 'Unlock KeyShield'),
  notify: (payload) => ipcRenderer.send('ks-feedback', payload || {}),
  focusMainWindow: () => ipcRenderer.send('ks-focus-main'),
  openExternal: (url) => ipcRenderer.send('ks-open-external', String(url || '')),
  writeText: (text) => ipcRenderer.invoke('ks-clipboard-write', String(text || '')),
  revealLog: () => ipcRenderer.invoke('ks-reveal-log'),
  getDiagnostics: () => ipcRenderer.invoke('ks-diagnostics'),
  retry: () => ipcRenderer.send('ks-retry'),
  quit: () => ipcRenderer.send('ks-quit'),
});
