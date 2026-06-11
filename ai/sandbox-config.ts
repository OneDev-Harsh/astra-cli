/**
 * Sandbox Configuration Module — Secure Architecture
 *
 * Security model:
 * - NO secrets are ever stored in ~/.astra/.env (config file)
 * - API keys live only in OS keychain or encrypted fallback file
 * - Auth tokens for server communication are also in secure storage
 * - All authenticated requests use HMAC signing with timestamps (replay protection)
 * - Model is fixed to owl-alpha in sandbox mode
 *
 * Config file only stores:
 *   ASTRA_SANDBOX_ENABLED=true  (just a boolean flag)
 *
 * Everything else comes from secure storage at runtime.
 */

import { saveConfig, getEnv } from "./config-loader";
import {
  getStoredSandboxApiKey,
  getStoredSandboxAuthToken,
  getStoredSandboxSigningSecret,
  storeSandboxApiKey,
  storeSandboxAuthToken,
  storeSandboxSigningSecret,
  clearAllSandboxCredentials,
  deleteStoredSandboxApiKey,
} from "./secure-storage";
import { randomBytes, createHmac } from "crypto";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SandboxConfig {
  enabled: boolean;
  serverUrl: string;
  authToken: string;
  keyTtlMs: number;
  defaultModel: string;
  serverStartupTimeoutMs: number;
}

interface CachedKey {
  key: string;
  fetchedAt: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

export const SANDBOX_MODEL = "openrouter/owl-alpha" as const;
export const SANDBOX_SERVER_DEFAULT_PORT = 3000;
export const SANDBOX_KEY_TTL_MS = 5 * 60 * 1_000;

// ── In-memory state ────────────────────────────────────────────────────────

let _cachedKey: CachedKey | null = null;
let _signingSecret: string | null = null;

// ── Key Validation ────────────────────────────────────────────────────────

/**
 * Validate and sanitize an API key.
 * Strips whitespace, brackets, and quotes that are commonly introduced
 * by .env file parsing mistakes.
 *
 * OpenRouter API keys have the format: sk-or-v1-<hex>
 * They should be at least 20 chars long.
 *
 * @returns Sanitized key, or null if the key is invalid.
 */
function sanitizeApiKey(key: string | undefined | null): string | null {
  if (!key || typeof key !== "string") return null;

  // Trim whitespace
  let sanitized = key.trim();

  // Strip accidental brackets/quotes from .env parsing
  // e.g. "[sk-or-v1-...]" -> "sk-or-v1-..."
  // e.g. '"sk-or-v1-..."' -> "sk-or-v1-..."
  while (
    (sanitized.startsWith("[") && sanitized.endsWith("]")) ||
    (sanitized.startsWith('"') && sanitized.endsWith('"')) ||
    (sanitized.startsWith("'") && sanitized.endsWith("'"))
  ) {
    sanitized = sanitized.slice(1, -1).trim();
  }

  // Validate: OpenRouter keys start with "sk-or-" and are reasonably long
  if (!sanitized.startsWith("sk-or-") || sanitized.length < 20) {
    return null;
  }

  return sanitized;
}

// ── Config ─────────────────────────────────────────────────────────────────

/**
 * Check if sandbox mode is enabled (reads only the boolean flag from config).
 */
export function isSandboxEnabled(): boolean {
  return getEnv("ASTRA_SANDBOX_ENABLED") === "true";
}

/**
 * Enable sandbox mode — only stores the boolean flag in config.
 */
export function enableSandboxMode(): void {
  saveConfig({ ASTRA_SANDBOX_ENABLED: "true" });
  clearKeyCache();
}

/**
 * Load the signing secret from secure storage into memory.
 * Called automatically by getSandboxApiKey() when needed.
 */
export async function loadSigningSecret(): Promise<void> {
  if (!_signingSecret) {
    _signingSecret = await getStoredSandboxSigningSecret();
  }
}

/**
 * Disable sandbox mode — removes the flag and purges all credentials.
 */
export async function disableSandboxMode(): Promise<void> {
  saveConfig({ ASTRA_SANDBOX_ENABLED: "false" });
  await clearAllSandboxCredentials();
  clearKeyCache();
  _signingSecret = null;
}

/**
 * Build the runtime sandbox config from secure storage.
 */
export async function getSandboxConfig(): Promise<SandboxConfig> {
  const enabled = isSandboxEnabled();
  const authToken = enabled ? (await getStoredSandboxAuthToken()) || "" : "";

  return {
    enabled,
    serverUrl: `http://127.0.0.1:${SANDBOX_SERVER_DEFAULT_PORT}`,
    authToken,
    keyTtlMs: SANDBOX_KEY_TTL_MS,
    defaultModel: SANDBOX_MODEL,
    serverStartupTimeoutMs: 10_000,
  };
}

// ── Key Cache ──────────────────────────────────────────────────────────────

function isKeyCached(): boolean {
  if (!_cachedKey) return false;
  return (Date.now() - _cachedKey.fetchedAt) < SANDBOX_KEY_TTL_MS;
}

export function clearKeyCache(): void {
  _cachedKey = null;
}

// ── HMAC Helpers ───────────────────────────────────────────────────────────

function signRequest(token: string): { timestamp: string; signature: string } {
  const timestamp = String(Date.now());
  const payload = `${timestamp}:${token}`;
  const signature = createHmac("sha256", _signingSecret || "").update(payload).digest("hex");
  return { timestamp, signature };
}

// ── One-Click Activation ──────────────────────────────────────────────────

/**
 * Activate sandbox mode in one step.
 */
export async function activateSandbox(serverUrl?: string): Promise<{
  success: boolean;
  message: string;
}> {
  const url = serverUrl || `http://127.0.0.1:${SANDBOX_SERVER_DEFAULT_PORT}`;

  // Step 1: Health check
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) {
      return {
        success: false,
        message: `Server health check failed (${res.status}). Is the sandbox server running?`,
      };
    }
  } catch {
    return {
      success: false,
      message: `Cannot reach sandbox server at ${url}. Start it with: cd server && bun start`,
    };
  }

  // Step 2: Generate secure random auth token
  const authToken = randomBytes(32).toString("hex");

  // Step 3: Bootstrap with server
  try {
    const res = await fetch(`${url}/bootstrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authToken }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        success: false,
        message: `Bootstrap failed (${res.status}): ${body || res.statusText}`,
      };
    }

    const data = (await res.json()) as { key: string; signingSecret: string };

    // Validate the key from the server before storing it
    const sanitized = sanitizeApiKey(data.key);
    if (!sanitized) {
      return {
        success: false,
        message:
          "Server returned an invalid API key. Check the server's .env file — " +
          "the API_KEYS value must be a valid OpenRouter key (e.g. sk-or-v1-...) " +
          "without brackets or extra quotes.",
      };
    }

    // Step 4: Persist to secure storage
    await storeSandboxAuthToken(authToken);
    await storeSandboxApiKey(sanitized);
    await storeSandboxSigningSecret(data.signingSecret);
    _signingSecret = data.signingSecret;

    // Step 5: Enable sandbox (boolean flag only)
    enableSandboxMode();

    return {
      success: true,
      message: "Sandbox mode activated! API key stored securely on this device.",
    };
  } catch (err) {
    return {
      success: false,
      message: `Bootstrap request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Key Retrieval ─────────────────────────────────────────────────────────

/**
 * Get the API key — from secure storage, memory cache, or fetch from server.
 */
export async function getSandboxApiKey(): Promise<string | null> {
  if (!isSandboxEnabled()) return null;

  // 1. Check secure storage (persists across restarts)
  const stored = await getStoredSandboxApiKey();
  if (stored) {
    // Validate/sanitize the stored key — handles bracketed keys from old .env configs
    const sanitized = sanitizeApiKey(stored);
    if (sanitized) {
      _cachedKey = { key: sanitized, fetchedAt: Date.now() };
      // If the key was sanitized (different from stored), update secure storage
      if (sanitized !== stored.trim()) {
        await storeSandboxApiKey(sanitized);
      }
      return sanitized;
    }
    // Stored key is invalid — purge it so we don't keep using a bad key
    await deleteStoredSandboxApiKey();
    clearKeyCache();
  }

  // 2. Check memory cache
  if (isKeyCached()) {
    return _cachedKey!.key;
  }

  // 3. Fetch fresh from server with HMAC-signed request
  const cfg = await getSandboxConfig();
  if (!cfg.authToken) {
    throw new Error(
      "Sandbox mode is enabled but no auth token found. Re-run sandbox setup."
    );
  }

  // Load signing secret from secure storage (persists across CLI restarts)
  await loadSigningSecret();
  if (!_signingSecret) {
    throw new Error(
      "Sandbox mode is enabled but no signing secret found. Re-run sandbox setup."
    );
  }

  const url = new URL("/api/key", cfg.serverUrl);
  const { timestamp, signature } = signRequest(cfg.authToken);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.authToken}`,
        "X-Timestamp": timestamp,
        "X-Signature": signature,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Sandbox server returned ${res.status}: ${body || res.statusText}`);
    }

    const data = (await res.json()) as { key: string };

    // Validate the key before storing
    const sanitized = sanitizeApiKey(data.key);
    if (!sanitized) {
      throw new Error(
        "Sandbox server returned an invalid API key. Check the server's .env file — " +
        "the API_KEYS value must be a valid OpenRouter key (e.g. sk-or-v1-...) " +
        "without brackets or extra quotes."
      );
    }

    // Store in secure storage + memory
    await storeSandboxApiKey(sanitized);
    _cachedKey = { key: sanitized, fetchedAt: Date.now() };

    return sanitized;
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new Error(
        "Sandbox server request timed out. Is the server running? Start it with: cd server && bun start"
      );
    }
    throw err;
  }
}

// ── Server Process Management ──────────────────────────────────────────────

export async function startSandboxServer(
  serverDir: string,
): Promise<{ success: boolean; pid?: number; message: string }> {
  const { spawn } = await import("child_process");
  const path = await import("path");

  const serverScript = path.join(serverDir, "server.js");
  const port = String(SANDBOX_SERVER_DEFAULT_PORT);
  const healthUrl = `http://127.0.0.1:${port}/health`;

  return new Promise((resolve) => {
    const child = spawn("node", [serverScript], {
      cwd: serverDir,
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PORT: port,
      },
    });

    let stderr = "";
    let resolved = false;

    const done = (success: boolean, message: string) => {
      if (resolved) return;
      resolved = true;
      resolve({ success, pid: child.pid, message });
    };

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      done(false, `Failed to start sandbox server: ${err.message}`);
    });

    child.on("exit", (code) => {
      if (!resolved) {
        done(false, `Sandbox server exited with code ${code}. stderr: ${stderr.slice(0, 200)}`);
      }
    });

    const startTime = Date.now();
    const checkHealth = async () => {
      if (Date.now() - startTime > 10_000) {
        done(false, "Sandbox server did not start within 10s");
        return;
      }

      try {
        const res = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          done(true, `Sandbox server started (PID: ${child.pid})`);
          return;
        }
      } catch { /* not ready */ }

      setTimeout(checkHealth, 500);
    };

    setTimeout(checkHealth, 1_000);
  });
}
