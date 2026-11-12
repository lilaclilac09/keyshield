'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('keyshieldDesktop', {
  isDesktop: true,
  platform: process.platform,
  apiBase: String(process.env.KS_DESKTOP_API_URL || '').trim(),
  live: process.env.KS_DESKTOP_LIVE === '1',
  promptTouchID: (reason) => ipcRenderer.invoke('ks-touch-id', reason || 'Unlock KeyShield'),
  notify: (payload) => ipcRenderer.send('ks-feedback', payload || {}),
  focusMainWindow: () => ipcRenderer.send('ks-focus-main'),
  openExternal: (url) => ipcRenderer.send('ks-open-external', String(url || '')),
});
