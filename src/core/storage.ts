import type { ReceiptAttachment, VaultData } from '../types/finance';

const IDB_NAME = 'vaultledger-db';
const IDB_VERSION = 1;
const IDB_STORE = 'vault';
const IDB_KEY = 'primary';
const LS_FALLBACK_KEY = 'vaultledger-vault-v1';
const IMAGE_COMPRESS_THRESHOLD_BYTES = 400 * 1024;
const MAX_RECEIPT_DIMENSION = 1600;

function isDesktopEnv(): boolean {
  return typeof window !== 'undefined' && Boolean(window.vaultDesktop?.isDesktop);
}

function openVaultDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

async function readFromIndexedDB(): Promise<VaultData | null> {
  const db = await openVaultDatabase();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as VaultData | undefined) ?? null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error ?? new Error('IndexedDB read failed'));
      };
    } catch (error) {
      db.close();
      reject(error);
    }
  });
}

async function writeToIndexedDB(data: VaultData): Promise<void> {
  const db = await openVaultDatabase();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(data, IDB_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('IndexedDB write failed'));
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error ?? new Error('IndexedDB write aborted'));
      };
    } catch (error) {
      db.close();
      reject(error);
    }
  });
}

function readFromLocalStorage(): VaultData | null {
  try {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as VaultData;
  } catch {
    return null;
  }
}

function writeToLocalStorage(data: VaultData): boolean {
  try {
    if (typeof localStorage === 'undefined') {
      return false;
    }
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export async function loadStoredVault(): Promise<VaultData | null> {
  if (isDesktopEnv()) {
    try {
      return await window.vaultDesktop!.loadVault();
    } catch {
      return null;
    }
  }

  try {
    const idbData = await readFromIndexedDB();
    if (idbData) {
      return idbData;
    }
  } catch {
    // Fall through to localStorage
  }

  return readFromLocalStorage();
}

export async function saveStoredVault(
  data: VaultData,
): Promise<{ ok: boolean; savedAt: string; mode: 'desktop' | 'web' }> {
  const savedAt = new Date().toISOString();

  if (isDesktopEnv()) {
    try {
      const res = await window.vaultDesktop!.saveVault(data);
      return { ok: res.ok, savedAt: res.savedAt || savedAt, mode: 'desktop' };
    } catch {
      return { ok: false, savedAt, mode: 'desktop' };
    }
  }

  let ok = false;
  try {
    await writeToIndexedDB(data);
    ok = true;
  } catch {
    ok = writeToLocalStorage(data);
  }

  if (ok) {
    // Best-effort secondary mirror to localStorage when small enough
    writeToLocalStorage(data);
  }

  return { ok, savedAt, mode: 'web' };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader !== 'undefined') {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read file as data URL'));
        }
      };
      reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
      reader.readAsDataURL(file);
      return;
    }

    file
      .arrayBuffer()
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 1) {
          binary += String.fromCharCode(bytes[i]);
        }
        const mime = file.type || 'application/octet-stream';
        resolve(`data:${mime};base64,${btoa(binary)}`);
      })
      .catch(reject);
  });
}

function compressImageDataUrl(dataUrl: string): Promise<{ dataUrl: string; mimeType: string }> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      resolve({ dataUrl, mimeType: 'image/jpeg' });
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;
        if (width <= 0 || height <= 0) {
          resolve({ dataUrl, mimeType: 'image/jpeg' });
          return;
        }

        if (width > MAX_RECEIPT_DIMENSION || height > MAX_RECEIPT_DIMENSION) {
          const scale = MAX_RECEIPT_DIMENSION / Math.max(width, height);
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl, mimeType: 'image/jpeg' });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.78);
        if (compressed.length < dataUrl.length) {
          resolve({ dataUrl: compressed, mimeType: 'image/jpeg' });
        } else {
          resolve({ dataUrl, mimeType: 'image/jpeg' });
        }
      } catch {
        resolve({ dataUrl, mimeType: 'image/jpeg' });
      }
    };
    img.onerror = () => resolve({ dataUrl, mimeType: 'image/jpeg' });
    img.src = dataUrl;
  });
}

function estimateDataUrlBytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  const payload = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  return Math.floor((payload.length * 3) / 4);
}

export async function saveReceiptAttachment(file: File): Promise<ReceiptAttachment> {
  const id = `rcpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const addedAt = new Date().toISOString();

  let dataUrl = await readFileAsDataUrl(file);
  let mimeType = file.type || 'application/octet-stream';

  if (mimeType.startsWith('image/') && file.size > IMAGE_COMPRESS_THRESHOLD_BYTES) {
    const compressed = await compressImageDataUrl(dataUrl);
    dataUrl = compressed.dataUrl;
    mimeType = compressed.mimeType;
  }

  const sizeBytes = estimateDataUrlBytes(dataUrl);

  if (isDesktopEnv()) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const commaIdx = dataUrl.indexOf(',');
    const base64Data = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
    const saved = await window.vaultDesktop!.saveReceiptFile({
      fileName: `${id}_${safeName}`,
      base64Data,
    });
    return {
      id,
      name: file.name,
      mimeType,
      sizeBytes,
      storageRef: saved.storageRef,
      addedAt,
    };
  }

  return {
    id,
    name: file.name,
    mimeType,
    sizeBytes,
    storageRef: dataUrl,
    addedAt,
  };
}

export async function loadReceiptDataUrl(receipt: ReceiptAttachment): Promise<string | null> {
  if (!receipt || !receipt.storageRef) {
    return null;
  }
  if (receipt.storageRef.startsWith('data:')) {
    return receipt.storageRef;
  }
  if (isDesktopEnv()) {
    try {
      const raw = await window.vaultDesktop!.readReceiptFile(receipt.storageRef);
      if (!raw) {
        return null;
      }
      if (raw.startsWith('data:')) {
        return raw;
      }
      return `data:${receipt.mimeType || 'image/jpeg'};base64,${raw}`;
    } catch {
      return null;
    }
  }
  return null;
}
