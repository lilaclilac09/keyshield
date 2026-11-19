'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const brokerPortArg = process.argv.find((arg) => arg.startsWith('--ks-desktop-broker-port='));
const brokerBridge = brokerPortArg ? {
  broker: {
    port: Number(brokerPortArg.split('=')[1]),
    listAgents: () => ipcRenderer.invoke('ks-broker:listAgents'),
    registerAgent: (name) => ipcRenderer.invoke('ks-broker:registerAgent', name),
    revokeAgent: (agentId) => ipcRenderer.invoke('ks-broker:revokeAgent', agentId),
    listRequests: () => ipcRenderer.invoke('ks-broker:listRequests'),
    deny: (id) => ipcRenderer.invoke('ks-broker:deny', id),
    revokeRequest: (id) => ipcRenderer.invoke('ks-broker:revokeRequest', id),
    approve: (payload) => ipcRenderer.invoke('ks-broker:approve', payload),
    onChanged: (cb) => {
      const listener = () => cb();
      ipcRenderer.on('ks-broker:changed', listener);
      return () => ipcRenderer.removeListener('ks-broker:changed', listener);
    },
  },
} : {};

contextBridge.exposeInMainWorld('keyshieldDesktop', {
  ...brokerBridge,
  isDesktop: true,
  platform: process.platform,
  apiBase: String(process.env.KS_DESKTOP_API_URL || '').trim(),
  live: process.env.KS_DESKTOP_LIVE === '1',
  promptTouchID: (reason) => ipcRenderer.invoke('ks-touch-id', reason || 'Unlock KeyShield'),
  notify: (payload) => ipcRenderer.send('ks-feedback', payload || {}),
  focusMainWindow: () => ipcRenderer.send('ks-focus-main'),
  openExternal: (url) => ipcRenderer.send('ks-open-external', String(url || '')),
  writeText: (text) => ipcRenderer.invoke('ks-clipboard-write', String(text || '')),
});
