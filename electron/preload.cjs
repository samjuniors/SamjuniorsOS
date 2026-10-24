const { contextBridge, ipcRenderer } = require('electron');

/**
 * SamJuniorsOS Electron Preload Bridge
 * Invariants:
 * - contextIsolation: true
 * - nodeIntegration: false
 * - No Node.js globals or sensitive capabilities leaked to the renderer DOM.
 */
contextBridge.exposeInMainWorld('desktopAPI', {
  isDesktop: true,
  platform: process.platform,
  getAuthToken: () => ipcRenderer.invoke('desktop:get-token'),
  getConfig: () => ipcRenderer.invoke('desktop:get-config')
});
