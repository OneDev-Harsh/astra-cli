/**
 * Secure Storage Module
 *
 * Provides encrypted on-device storage for sensitive values (API keys)
 * using the operating system's native credential manager:
 *   - macOS: Keychain
 *   - Windows: Credential Vault
 *   - Linux: Secret Service (libsecret)
 *
 * Falls back to a Bun-native encrypted file if keytar is not available.
 * The fallback encrypts with a device-bound key derived from machine-id.
 */

import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "crypto";
import fs from "fs";
import path from "path";
import { homedir } from "os";

// ── Constants ──────────────────────────────────────────────────────────────

const SERVICE_NAME = "astrabot";
const ACCOUNT_SANDBOX_KEY = "sandbox-api-key";
const ACCOUNT_AUTH_TOKEN = "sandbox-auth-token";
const ACCOUNT_SIGNING_SECRET = "sandbox-signing-secret";

const FALLBACK_DIR = path.join(homedir(), ".astra", ".secure");
const FALLBACK_FILE = path.join(FALLBACK_DIR, "sandbox.enc");
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;

// ── Keytar (OS Keychain) ───────────────────────────────────────────────────

interface Keytar {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

let keytarInstance: Keytar | null = null;
let keytarAvailable: boolean | null = null;

async function getKeytar(): Promise<Keytar | null> {
  if (keytarAvailable !== null) return keytarInstance;

  try {
    // Dynamic import — keytar is optional
    const mod = await import("keytar");
    keytarInstance = mod.default || mod;
    keytarAvailable = true;
    return keytarInstance;
  } catch {
    keytarAvailable = false;
    return null;
  }
}

// ── Fallback: AES-256-GCM encrypted file ──────────────────────────────────
// Used when keytar is not installed. The encryption key is derived from
// the machine-id, making it device-specific (non-portable).

function getMachineId(): string {
  // Try common machine-id locations
  const candidates = [
    "/etc/machine-id",                                    // Linux
    "/var/lib/dbus/machine-id",                           // Linux fallback
    path.join(homedir(), ".machine-id"),                  // Custom fallback
  ];

  for (const p of candidates) {
    try {
      const id = fs.readFileSync(p, "utf8").trim();
      if (id) return id;
    } catch { /* not found, try next */ }
  }

  // Last resort: generate a stable ID and store it
  const customIdPath = path.join(homedir(), ".astra", ".machine-id");
  try {
    if (fs.existsSync(customIdPath)) {
      return fs.readFileSync(customIdPath, "utf8").trim();
    }
  } catch { /* ignore */ }

  // Generate new stable ID
  const newId = randomBytes(16).toString("hex");
  try {
    fs.mkdirSync(path.dirname(customIdPath), { recursive: true });
    fs.writeFileSync(customIdPath, newId, "utf8");
    // Restrict permissions to owner-only
    try { fs.chmodSync(customIdPath, 0o600); } catch { /* Windows */ }
  } catch { /* ignore */ }

  return newId;
}

function deriveKey(salt: Buffer): Buffer {
  const machineId = getMachineId();
  // Mix in the service name so different apps get different keys
  return scryptSync(machineId + SERVICE_NAME, salt, KEY_LENGTH);
}

interface EncryptedBlob {
  salt: string;    // hex
  iv: string;      // hex
  tag: string;     // hex
  data: string;    // hex
}

function encryptValue(plaintext: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(salt);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const blob: EncryptedBlob = {
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: encrypted.toString("hex"),
  };

  return Buffer.from(JSON.stringify(blob)).toString("base64");
}

function decryptValue(encoded: string): string | null {
  try {
    const blob: EncryptedBlob = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));

    const salt = Buffer.from(blob.salt, "hex");
    const iv = Buffer.from(blob.iv, "hex");
    const tag = Buffer.from(blob.tag, "hex");
    const data = Buffer.from(blob.data, "hex");
    const key = deriveKey(salt);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);

    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

async function fallbackSet(key: string, value: string): Promise<void> {
  fs.mkdirSync(FALLBACK_DIR, { recursive: true });

  // Read existing store first to merge (don't overwrite other keys)
  let store: Record<string, string> = {};
  try {
    if (fs.existsSync(FALLBACK_FILE)) {
      const raw = fs.readFileSync(FALLBACK_FILE, "utf8");
      store = JSON.parse(raw);
    }
  } catch { /* corrupted or missing — start fresh */ }

  // Write atomically: write to temp, then rename
  const tmpFile = FALLBACK_FILE + ".tmp";
  const encrypted = encryptValue(value);
  store[key] = encrypted;
  fs.writeFileSync(tmpFile, JSON.stringify(store), "utf8");
  fs.renameSync(tmpFile, FALLBACK_FILE);

  // Restrict permissions
  try { fs.chmodSync(FALLBACK_FILE, 0o600); } catch { /* Windows */ }
}

async function fallbackGet(key: string): Promise<string | null> {
  try {
    const raw = fs.readFileSync(FALLBACK_FILE, "utf8");
    const store: Record<string, string> = JSON.parse(raw);
    const encrypted = store[key];
    if (!encrypted) return null;
    return decryptValue(encrypted);
  } catch {
    return null;
  }
}

async function fallbackDelete(key: string): Promise<boolean> {
  try {
    const raw = fs.readFileSync(FALLBACK_FILE, "utf8");
    const store: Record<string, string> = JSON.parse(raw);
    if (!(key in store)) return false;
    delete store[key];

    if (Object.keys(store).length === 0) {
      fs.unlinkSync(FALLBACK_FILE);
    } else {
      fs.writeFileSync(FALLBACK_FILE, JSON.stringify(store), "utf8");
    }
    return true;
  } catch {
    return false;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Store the sandbox API key in encrypted storage.
 * Prefers OS keychain, falls back to encrypted file.
 */
export async function storeSandboxApiKey(key: string): Promise<void> {
  const kt = await getKeytar();
  if (kt) {
    await kt.setPassword(SERVICE_NAME, ACCOUNT_SANDBOX_KEY, key);
  } else {
    await fallbackSet(ACCOUNT_SANDBOX_KEY, key);
  }
}

/**
 * Retrieve the sandbox API key from encrypted storage.
 * Returns null if not found.
 */
export async function getStoredSandboxApiKey(): Promise<string | null> {
  const kt = await getKeytar();
  if (kt) {
    return kt.getPassword(SERVICE_NAME, ACCOUNT_SANDBOX_KEY);
  } else {
    return fallbackGet(ACCOUNT_SANDBOX_KEY);
  }
}

/**
 * Delete the stored sandbox API key (e.g., on disable/reset).
 */
export async function deleteStoredSandboxApiKey(): Promise<boolean> {
  const kt = await getKeytar();
  if (kt) {
    return kt.deletePassword(SERVICE_NAME, ACCOUNT_SANDBOX_KEY);
  } else {
    return fallbackDelete(ACCOUNT_SANDBOX_KEY);
  }
}

/**
 * Store the sandbox auth token for server communication.
 */
export async function storeSandboxAuthToken(token: string): Promise<void> {
  const kt = await getKeytar();
  if (kt) {
    await kt.setPassword(SERVICE_NAME, ACCOUNT_AUTH_TOKEN, token);
  } else {
    await fallbackSet(ACCOUNT_AUTH_TOKEN, token);
  }
}

/**
 * Retrieve the sandbox auth token.
 */
export async function getStoredSandboxAuthToken(): Promise<string | null> {
  const kt = await getKeytar();
  if (kt) {
    return kt.getPassword(SERVICE_NAME, ACCOUNT_AUTH_TOKEN);
  } else {
    return fallbackGet(ACCOUNT_AUTH_TOKEN);
  }
}

/**
 * Delete the stored sandbox auth token.
 */
export async function deleteStoredSandboxAuthToken(): Promise<boolean> {
  const kt = await getKeytar();
  if (kt) {
    return kt.deletePassword(SERVICE_NAME, ACCOUNT_AUTH_TOKEN);
  } else {
    return fallbackDelete(ACCOUNT_AUTH_TOKEN);
  }
}

/**
 * Store the sandbox signing secret for HMAC request signing.
 */
export async function storeSandboxSigningSecret(secret: string): Promise<void> {
  const kt = await getKeytar();
  if (kt) {
    await kt.setPassword(SERVICE_NAME, ACCOUNT_SIGNING_SECRET, secret);
  } else {
    await fallbackSet(ACCOUNT_SIGNING_SECRET, secret);
  }
}

/**
 * Retrieve the sandbox signing secret.
 */
export async function getStoredSandboxSigningSecret(): Promise<string | null> {
  const kt = await getKeytar();
  if (kt) {
    return kt.getPassword(SERVICE_NAME, ACCOUNT_SIGNING_SECRET);
  } else {
    return fallbackGet(ACCOUNT_SIGNING_SECRET);
  }
}

/**
 * Delete the stored sandbox signing secret.
 */
export async function deleteStoredSandboxSigningSecret(): Promise<boolean> {
  const kt = await getKeytar();
  if (kt) {
    return kt.deletePassword(SERVICE_NAME, ACCOUNT_SIGNING_SECRET);
  } else {
    return fallbackDelete(ACCOUNT_SIGNING_SECRET);
  }
}

/**
 * Clear all sandbox credentials from secure storage.
 */
export async function clearAllSandboxCredentials(): Promise<void> {
  await deleteStoredSandboxApiKey();
  await deleteStoredSandboxAuthToken();
  await deleteStoredSandboxSigningSecret();
}

/**
 * Check whether OS keychain is available (vs fallback file).
 */
export async function isUsingOsKeychain(): Promise<boolean> {
  const kt = await getKeytar();
  return kt !== null;
}
