'use strict';

/**
 * Preload — the only bridge between the sandboxed renderer and the main
 * process. Exposes a minimal, typed surface via `window.mockpulse`.
 */

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const KEYTAR_SERVICE = 'MockPulse AI';

contextBridge.exposeInMainWorld('mockpulse', {
  platform: process.platform,

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    reset: () => ipcRenderer.invoke('settings:reset'),
  },

  /** keytar-compatible secret API (service is bound here). */
  keytar: {
    getPassword: (account) => ipcRenderer.invoke('secrets:get', account),
    setPassword: (account, value) => ipcRenderer.invoke('secrets:set', account, value),
    deletePassword: (account) => ipcRenderer.invoke('secrets:delete', account),
    findCredentials: async () => {
      const accounts = await ipcRenderer.invoke('secrets:list');
      return accounts.map((account) => ({ account, password: '' }));
    },
    service: KEYTAR_SERVICE,
    backend: () => ipcRenderer.invoke('secrets:backend'),
  },

  reports: {
    list: () => ipcRenderer.invoke('reports:list'),
    save: (report) => ipcRenderer.invoke('reports:save', report),
    load: (file) => ipcRenderer.invoke('reports:load', file),
    export: (payload) => ipcRenderer.invoke('reports:export', payload),
  },

  app: {
    info: () => ipcRenderer.invoke('app:info'),
    openPath: (p) => ipcRenderer.invoke('app:openPath', p),
  },

  files: {
    /** Resolve an OS file path from a File object (Electron 32+). */
    getPathForFile: (file) => {
      try {
        return webUtils.getPathForFile(file);
      } catch {
        return null;
      }
    },
  },
});
