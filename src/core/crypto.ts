import type { EncryptedVaultEnvelope, VaultData } from '../types/finance';

const PBKDF2_ITERATIONS = 120_000;
const SALT_BYTE_LENGTH = 16;
const IV_BYTE_LENGTH = 12;
const KEY_BIT_LENGTH = 256;

function getSubtleCrypto(): SubtleCrypto {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error('Web Crypto API is not available in this environment.');
  }
  return cryptoObj.subtle;
}

function getRandomBytes(length: number): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(length);
  const bytes = new Uint8Array(buffer);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    let binary = '';
    for (let j = 0; j < chunk.length; j += 1) {
      binary += String.fromCharCode(chunk[j]);
    }
    parts.push(binary);
  }
  return btoa(parts.join(''));
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  try {
    const binary = atob(base64);
    const buffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    throw new Error('Invalid base64 encoding in encrypted payload.');
  }
}

function encodeUtf8(value: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(value);
  const buffer = new ArrayBuffer(encoded.byteLength);
  const copy = new Uint8Array(buffer);
  copy.set(encoded);
  return copy;
}

async function importPbkdf2Key(passphrase: string): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  return subtle.importKey('raw', encodeUtf8(passphrase), { name: 'PBKDF2' }, false, [
    'deriveKey',
    'deriveBits',
  ]);
}

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  const baseKey = await importPbkdf2Key(passphrase);
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_BIT_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
}

function isValidVaultData(value: unknown): value is VaultData {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.schemaVersion === 'number' &&
    Array.isArray(candidate.accounts) &&
    Array.isArray(candidate.categories) &&
    Array.isArray(candidate.transactions) &&
    Array.isArray(candidate.recurringBills) &&
    Array.isArray(candidate.savingsGoals) &&
    Array.isArray(candidate.rules) &&
    typeof candidate.settings === 'object' &&
    candidate.settings !== null
  );
}

export async function encryptVault(
  vault: VaultData,
  passphrase: string,
): Promise<EncryptedVaultEnvelope> {
  if (!passphrase || passphrase.length === 0) {
    throw new Error('A non-empty passphrase is required to encrypt the vault.');
  }

  const subtle = getSubtleCrypto();
  const salt = getRandomBytes(SALT_BYTE_LENGTH);
  const iv = getRandomBytes(IV_BYTE_LENGTH);
  const aesKey = await deriveAesKey(passphrase, salt, PBKDF2_ITERATIONS);
  const plaintext = encodeUtf8(JSON.stringify(vault));

  const encryptedBuffer = await subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext);
  const ciphertextBytes = new Uint8Array(encryptedBuffer);

  return {
    format: 'vaultledger-encrypted-v1',
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    cipher: 'AES-256-GCM',
    saltB64: bytesToBase64(salt),
    ivB64: bytesToBase64(iv),
    ciphertextB64: bytesToBase64(ciphertextBytes),
    createdAt: new Date().toISOString(),
  };
}

export async function decryptVault(
  envelope: EncryptedVaultEnvelope,
  passphrase: string,
): Promise<VaultData> {
  if (!passphrase || passphrase.length === 0) {
    throw new Error('Passphrase is required to decrypt the vault.');
  }

  if (
    !envelope ||
    typeof envelope !== 'object' ||
    envelope.format !== 'vaultledger-encrypted-v1' ||
    envelope.kdf !== 'PBKDF2-SHA256' ||
    envelope.cipher !== 'AES-256-GCM' ||
    typeof envelope.iterations !== 'number' ||
    envelope.iterations < 10_000 ||
    !envelope.saltB64 ||
    !envelope.ivB64 ||
    !envelope.ciphertextB64
  ) {
    throw new Error('Invalid encrypted vault envelope format.');
  }

  const salt = base64ToBytes(envelope.saltB64);
  const iv = base64ToBytes(envelope.ivB64);
  const ciphertext = base64ToBytes(envelope.ciphertextB64);

  const subtle = getSubtleCrypto();
  const aesKey = await deriveAesKey(passphrase, salt, envelope.iterations);

  let decryptedBuffer: ArrayBuffer;
  try {
    decryptedBuffer = await subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);
  } catch {
    throw new Error('Failed to decrypt vault: incorrect passphrase or corrupted data.');
  }

  let parsed: unknown;
  try {
    const json = new TextDecoder().decode(decryptedBuffer);
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Decrypted vault payload is not valid JSON.');
  }

  if (!isValidVaultData(parsed)) {
    throw new Error('Decrypted payload does not match VaultLedger schema.');
  }

  return parsed;
}

export async function hashPasscode(passcode: string): Promise<{ hash: string; salt: string }> {
  if (!passcode || passcode.length === 0) {
    throw new Error('Passcode must not be empty.');
  }
  const subtle = getSubtleCrypto();
  const salt = getRandomBytes(SALT_BYTE_LENGTH);
  const baseKey = await importPbkdf2Key(passcode);
  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    KEY_BIT_LENGTH,
  );

  return {
    hash: bytesToBase64(new Uint8Array(bits)),
    salt: bytesToBase64(salt),
  };
}

export async function verifyPasscode(
  passcode: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  if (!passcode || !hash || !salt) {
    return false;
  }
  try {
    const subtle = getSubtleCrypto();
    const saltBytes = base64ToBytes(salt);
    const expectedBytes = base64ToBytes(hash);
    const baseKey = await importPbkdf2Key(passcode);
    const bits = await subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      baseKey,
      expectedBytes.length * 8,
    );
    const actualBytes = new Uint8Array(bits);
    if (actualBytes.length !== expectedBytes.length) {
      return false;
    }
    let diff = 0;
    for (let i = 0; i < actualBytes.length; i += 1) {
      diff |= actualBytes[i] ^ expectedBytes[i];
    }
    return diff === 0;
  } catch {
    return false;
  }
}
