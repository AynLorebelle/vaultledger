'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const MAX_BACKUPS = 15;
const DEV_SERVER_DEFAULT = 'http://localhost:5173';

let mainWindow = null;
let hasRunQuitBackup = false;

// ---------------------------------------------------------------------------
// Storage Paths & Atomic File Utilities
// ---------------------------------------------------------------------------

function getStorageDirs() {
  const dataDir = path.join(app.getPath('userData'), 'vaultledger-data');
  const vaultPath = path.join(dataDir, 'vault.json');
  const backupsDir = path.join(dataDir, 'backups');
  const receiptsDir = path.join(dataDir, 'receipts');

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(backupsDir, { recursive: true });
  fs.mkdirSync(receiptsDir, { recursive: true });

  return { dataDir, vaultPath, backupsDir, receiptsDir };
}

/**
 * Atomically writes data to disk using `<targetPath>.tmp` + fsync + rename
 * so power loss or unexpected termination never leaves a truncated file.
 */
function atomicWriteFileSync(targetPath, data, encoding) {
  const tmpPath = `${targetPath}.tmp`;
  const buffer = Buffer.isBuffer(data)
    ? data
    : Buffer.from(String(data), encoding || 'utf8');

  let fd = null;
  try {
    fd = fs.openSync(tmpPath, 'w', 0o600);
    fs.writeSync(fd, buffer, 0, buffer.length, 0);
    fs.fsyncSync(fd);
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }

  // Windows antivirus / indexer can briefly lock target files during rename
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      fs.renameSync(tmpPath, targetPath);
      return;
    } catch (err) {
      lastError = err;
      if (err && (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES')) {
        const waitUntil = Date.now() + 25 * (attempt + 1);
        while (Date.now() < waitUntil) {
          // Brief synchronous backoff before retrying atomic rename
        }
        continue;
      }
      break;
    }
  }

  // Clean up tmp file on unrecoverable error
  try {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  } catch {
    // ignore cleanup failure
  }
  throw lastError;
}

function formatDateKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatFileTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function listBackupFilesSorted(backupsDir) {
  if (!fs.existsSync(backupsDir)) return [];

  const entries = fs.readdirSync(backupsDir, { withFileTypes: true });
  const backups = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const fullPath = path.join(backupsDir, entry.name);
    try {
      const stat = fs.statSync(fullPath);
      backups.push({
        fileName: entry.name,
        fullPath,
        createdAt: stat.mtime.toISOString(),
        mtimeMs: stat.mtimeMs,
        sizeBytes: stat.size,
      });
    } catch {
      // Ignore files deleted concurrently
    }
  }

  backups.sort((a, b) => b.mtimeMs - a.mtimeMs || b.fileName.localeCompare(a.fileName));
  return backups;
}

function pruneBackups(backupsDir, maxKeep = MAX_BACKUPS) {
  const sorted = listBackupFilesSorted(backupsDir);
  if (sorted.length <= maxKeep) return;

  for (const stale of sorted.slice(maxKeep)) {
    try {
      fs.unlinkSync(stale.fullPath);
    } catch {
      // Ignore individual deletion failure
    }
  }
}

function parseVaultJson(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('Empty vault payload');
  }
  const parsed = JSON.parse(rawText);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Vault JSON root must be an object');
  }
  return parsed;
}

function recoverVaultFromBackups(vaultPath, backupsDir) {
  const backups = listBackupFilesSorted(backupsDir);
  for (const backup of backups) {
    try {
      const raw = fs.readFileSync(backup.fullPath, 'utf8');
      const parsed = parseVaultJson(raw);
      // Restore recovered vault atomically so next startup is clean
      atomicWriteFileSync(vaultPath, raw, 'utf8');
      return parsed;
    } catch {
      // Try next older backup
    }
  }
  return null;
}

function inferMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.bmp':
      return 'image/bmp';
    case '.svg':
      return 'image/svg+xml';
    case '.pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

function createQuitBackupIfNeeded() {
  if (hasRunQuitBackup) return;
  hasRunQuitBackup = true;

  try {
    const { vaultPath, backupsDir } = getStorageDirs();
    if (!fs.existsSync(vaultPath)) return;

    const currentRaw = fs.readFileSync(vaultPath, 'utf8');
    // Validate JSON before creating a quit snapshot
    parseVaultJson(currentRaw);

    const existing = listBackupFilesSorted(backupsDir);
    if (existing.length > 0) {
      try {
        const latestRaw = fs.readFileSync(existing[0].fullPath, 'utf8');
        if (latestRaw === currentRaw) {
          // Latest snapshot already matches vault.json byte-for-byte
          return;
        }
      } catch {
        // Proceed with creating quit snapshot
      }
    }

    const fileName = `vault-quit-${formatFileTimestamp()}.json`;
    const target = path.join(backupsDir, fileName);
    atomicWriteFileSync(target, currentRaw, 'utf8');
    pruneBackups(backupsDir, MAX_BACKUPS);
  } catch (err) {
    console.error('[VaultLedger] Quit auto-backup failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Dev Server Probe
// ---------------------------------------------------------------------------

function isHttpUrlReachable(targetUrl, timeoutMs = 800) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    try {
      const req = http.get(targetUrl, { timeout: timeoutMs }, (res) => {
        res.resume();
        finish(res.statusCode >= 200 && res.statusCode < 500);
      });
      req.on('timeout', () => {
        req.destroy();
        finish(false);
      });
      req.on('error', () => finish(false));
    } catch {
      finish(false);
    }
  });
}

// ---------------------------------------------------------------------------
// IPC Handlers (VaultDesktopBridge)
// ---------------------------------------------------------------------------

function registerIpcHandlers() {
  ipcMain.handle('vault:getStorageInfo', async () => {
    const { vaultPath, backupsDir, receiptsDir } = getStorageDirs();
    return { vaultPath, backupsDir, receiptsDir };
  });

  ipcMain.handle('vault:load', async () => {
    const { dataDir, vaultPath, backupsDir } = getStorageDirs();

    if (!fs.existsSync(vaultPath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(vaultPath, 'utf8');
      return parseVaultJson(raw);
    } catch (err) {
      console.error('[VaultLedger] vault.json appears corrupt; attempting recovery:', err);

      // Preserve the corrupt file for forensic inspection before recovering
      try {
        const corruptCopy = path.join(dataDir, `vault.corrupt-${formatFileTimestamp()}.json`);
        fs.copyFileSync(vaultPath, corruptCopy);
      } catch {
        // Ignore quarantine error
      }

      return recoverVaultFromBackups(vaultPath, backupsDir);
    }
  });

  ipcMain.handle('vault:save', async (_event, data) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Invalid vault data payload');
    }

    const { vaultPath, backupsDir } = getStorageDirs();
    const savedAt = new Date().toISOString();
    const serialized = JSON.stringify(data, null, 2);

    atomicWriteFileSync(vaultPath, serialized, 'utf8');

    // Rolling daily backup (keep last 15 snapshots)
    try {
      const dailyFileName = `vault-daily-${formatDateKey()}.json`;
      const dailyPath = path.join(backupsDir, dailyFileName);
      if (!fs.existsSync(dailyPath)) {
        atomicWriteFileSync(dailyPath, serialized, 'utf8');
        pruneBackups(backupsDir, MAX_BACKUPS);
      }
    } catch (backupErr) {
      console.error('[VaultLedger] Daily backup warning:', backupErr);
    }

    return { ok: true, savedAt };
  });

  ipcMain.handle('vault:createBackup', async (_event, data) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Invalid backup data payload');
    }

    const { backupsDir } = getStorageDirs();
    const fileName = `vault-snapshot-${formatFileTimestamp()}.json`;
    const targetPath = path.join(backupsDir, fileName);
    const serialized = JSON.stringify(data, null, 2);

    atomicWriteFileSync(targetPath, serialized, 'utf8');
    pruneBackups(backupsDir, MAX_BACKUPS);

    return { ok: true, fileName };
  });

  ipcMain.handle('vault:listBackups', async () => {
    const { backupsDir } = getStorageDirs();
    return listBackupFilesSorted(backupsDir).map(({ fileName, createdAt, sizeBytes }) => ({
      fileName,
      createdAt,
      sizeBytes,
    }));
  });

  ipcMain.handle('vault:exportDialog', async (_event, opts) => {
    const options = opts && typeof opts === 'object' ? opts : {};
    const defaultName =
      typeof options.defaultName === 'string' && options.defaultName.trim()
        ? path.basename(options.defaultName.trim())
        : 'vaultledger-export.json';
    const filters = Array.isArray(options.filters) ? options.filters : [];

    const result = await dialog.showSaveDialog(mainWindow || undefined, {
      title: 'Export from VaultLedger',
      defaultPath: defaultName,
      filters,
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    atomicWriteFileSync(result.filePath, String(options.content ?? ''), 'utf8');
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle('vault:importDialog', async (_event, opts) => {
    const options = opts && typeof opts === 'object' ? opts : {};
    const filters = Array.isArray(options.filters) ? options.filters : [];

    const result = await dialog.showOpenDialog(mainWindow || undefined, {
      title: 'Import into VaultLedger',
      properties: ['openFile'],
      filters,
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const selectedPath = result.filePaths[0];
    const content = fs.readFileSync(selectedPath, 'utf8');
    return {
      canceled: false,
      fileName: path.basename(selectedPath),
      content,
    };
  });

  ipcMain.handle('vault:saveReceipt', async (_event, opts) => {
    const options = opts && typeof opts === 'object' ? opts : {};
    const rawName = typeof options.fileName === 'string' ? options.fileName : 'receipt.png';
    const rawBase64 = typeof options.base64Data === 'string' ? options.base64Data : '';

    if (!rawBase64) {
      throw new Error('Receipt base64 data is required');
    }

    const { receiptsDir } = getStorageDirs();

    // Support both raw base64 and full data URLs (data:image/png;base64,...)
    let base64Payload = rawBase64;
    let inferredExt = '';
    const dataUrlMatch = /^data:([^;]+);base64,(.+)$/s.exec(rawBase64.trim());
    if (dataUrlMatch) {
      const mime = dataUrlMatch[1].toLowerCase();
      base64Payload = dataUrlMatch[2];
      if (mime === 'image/png') inferredExt = '.png';
      else if (mime === 'image/jpeg') inferredExt = '.jpg';
      else if (mime === 'image/webp') inferredExt = '.webp';
      else if (mime === 'image/gif') inferredExt = '.gif';
      else if (mime === 'application/pdf') inferredExt = '.pdf';
    }

    const cleanBase = path
      .basename(rawName)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/^\.+/, '');

    let safeFileName = cleanBase || `receipt${inferredExt || '.png'}`;
    if (!path.extname(safeFileName) && inferredExt) {
      safeFileName += inferredExt;
    }
    if (safeFileName.length > 96) {
      const ext = path.extname(safeFileName);
      safeFileName = `${safeFileName.slice(0, 96 - ext.length)}${ext}`;
    }

    const uniquePrefix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const storageRef = `${uniquePrefix}-${safeFileName}`;
    const destPath = path.join(receiptsDir, storageRef);

    // Double-check boundary containment
    const resolvedReceiptsDir = path.resolve(receiptsDir);
    const resolvedDest = path.resolve(destPath);
    if (!resolvedDest.startsWith(resolvedReceiptsDir + path.sep)) {
      throw new Error('Invalid receipt storage path');
    }

    const binary = Buffer.from(base64Payload, 'base64');
    atomicWriteFileSync(resolvedDest, binary);

    return { ok: true, storageRef };
  });

  ipcMain.handle('vault:readReceipt', async (_event, storageRef) => {
    if (typeof storageRef !== 'string' || !storageRef.trim()) {
      return null;
    }

    // Strict path-traversal validation using path.basename + resolved containment check
    const safeName = path.basename(storageRef);
    if (
      !safeName ||
      safeName !== storageRef ||
      safeName === '.' ||
      safeName === '..' ||
      safeName.includes('..') ||
      safeName.includes('/') ||
      safeName.includes('\\')
    ) {
      throw new Error('Invalid receipt reference');
    }

    const { receiptsDir } = getStorageDirs();
    const resolvedReceiptsDir = path.resolve(receiptsDir);
    const resolvedTarget = path.resolve(receiptsDir, safeName);

    if (!resolvedTarget.startsWith(resolvedReceiptsDir + path.sep)) {
      throw new Error('Receipt path traversal blocked');
    }

    if (!fs.existsSync(resolvedTarget)) {
      return null;
    }

    const binary = fs.readFileSync(resolvedTarget);
    const mimeType = inferMimeType(safeName);
    return `data:${mimeType};base64,${binary.toString('base64')}`;
  });

  ipcMain.handle('vault:openDataFolder', async () => {
    const { dataDir } = getStorageDirs();
    await shell.openPath(dataDir);
  });
}

// ---------------------------------------------------------------------------
// Window Creation & Lifecycle
// ---------------------------------------------------------------------------

function openExternalIfSafe(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      shell.openExternal(parsed.toString());
      return true;
    }
  } catch {
    // Ignore malformed URLs
  }
  return false;
}

async function createMainWindow() {
  const iconCandidate = path.join(__dirname, '../build/icon.png');
  const windowIcon = fs.existsSync(iconCandidate) ? iconCandidate : undefined;

  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#020617',
    title: 'VaultLedger',
    autoHideMenuBar: true,
    show: false,
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  // Open external links in default OS browser; never spawn uncontrolled windows
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfSafe(url);
    return { action: 'deny' };
  });

  // Guard against accidental top-level navigation to external websites
  let allowedDevOrigin = null;
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol === 'file:') return;
      if (allowedDevOrigin && parsed.origin === allowedDevOrigin) return;

      event.preventDefault();
      openExternalIfSafe(targetUrl);
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Determine whether to load Vite dev server or packaged dist/index.html
  const explicitDevUrl = process.env.VITE_DEV_SERVER_URL;
  if (explicitDevUrl) {
    try {
      allowedDevOrigin = new URL(explicitDevUrl).origin;
    } catch {
      allowedDevOrigin = null;
    }
    await mainWindow.loadURL(explicitDevUrl);
    return;
  }

  if (!app.isPackaged) {
    const devReachable = await isHttpUrlReachable(DEV_SERVER_DEFAULT);
    if (devReachable) {
      allowedDevOrigin = new URL(DEV_SERVER_DEFAULT).origin;
      await mainWindow.loadURL(DEV_SERVER_DEFAULT);
      return;
    }
  }

  const distIndex = path.join(__dirname, '../dist/index.html');
  await mainWindow.loadFile(distIndex);
}

// Single-instance lock so two processes never race on vault.json
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // Ensure storage directories exist at startup
    getStorageDirs();
    registerIpcHandlers();
    await createMainWindow();

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createMainWindow();
      }
    });
  });

  app.on('before-quit', () => {
    createQuitBackupIfNeeded();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
