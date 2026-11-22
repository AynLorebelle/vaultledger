'use strict';

const { contextBridge, ipcRenderer } = require('electron');

let appVersion = '1.1.0';
try {
  const pkg = require('../package.json');
  if (pkg && typeof pkg.version === 'string') {
    appVersion = pkg.version;
  }
} catch {
  // Fallback to default version string if package.json is unavailable
}

/**
 * Sandboxed preload bridge matching the `VaultDesktopBridge` TypeScript interface.
 */
const vaultDesktopBridge = Object.freeze({
  isDesktop: true,
  platform: process.platform,
  appVersion,
  getStorageInfo: () => ipcRenderer.invoke('vault:getStorageInfo'),
  loadVault: () => ipcRenderer.invoke('vault:load'),
  saveVault: (data) => ipcRenderer.invoke('vault:save', data),
  createBackupSnapshot: (data) => ipcRenderer.invoke('vault:createBackup', data),
  listBackups: () => ipcRenderer.invoke('vault:listBackups'),
  exportFileDialog: (opts) => ipcRenderer.invoke('vault:exportDialog', opts),
  importFileDialog: (opts) => ipcRenderer.invoke('vault:importDialog', opts),
  saveReceiptFile: (opts) => ipcRenderer.invoke('vault:saveReceipt', opts),
  readReceiptFile: (storageRef) => ipcRenderer.invoke('vault:readReceipt', storageRef),
  openDataFolder: () => ipcRenderer.invoke('vault:openDataFolder'),
});

contextBridge.exposeInMainWorld('vaultDesktop', vaultDesktopBridge);
