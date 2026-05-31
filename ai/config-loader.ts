import fs from "fs";
import path from "path";
import { homedir } from "os";
import dotenv from "dotenv";

const CONFIG_DIR = path.join(homedir(), ".astra");
const CONFIG_FILE = path.join(CONFIG_DIR, ".env");

let loaded = false;

/**
 * Ensure the ~/.astra/.env file is loaded into process.env.
 * Only runs once; subsequent calls are a no-op.
 */
function ensureConfigLoaded(): void {
  if (loaded) return;

  if (fs.existsSync(CONFIG_FILE)) {
    dotenv.config({ path: CONFIG_FILE, override: false });
  }

  loaded = true;
}

/**
 * Resolve an environment variable, checking process.env first,
 * then the config file (which is already merged into process.env).
 */
export function getEnv(key: string): string | undefined {
  ensureConfigLoaded();
  return process.env[key];
}

/**
 * Return the path to the config file.
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * Return the path to the config directory.
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * Write a key=value pair into the config file, creating the directory
 * if it doesn't exist. Overwrites existing values for the same key.
 */
export function saveConfig(entries: Record<string, string>): void {
  // Read existing content so we can merge
  let existing = "";
  if (fs.existsSync(CONFIG_FILE)) {
    existing = fs.readFileSync(CONFIG_FILE, "utf8");
  }

  const lines = existing.split("\n");
  const keys = new Set(Object.keys(entries));

  // Update existing lines that match a key
  const updated: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      updated.push(line);
      continue;
    }
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) {
      updated.push(line);
      continue;
    }
    const key = trimmed.slice(0, eqIdx).trim();
    if (keys.has(key)) {
      updated.push(`${key}=${entries[key]}`);
      keys.delete(key);
    } else {
      updated.push(line);
    }
  }

  // Append any keys that weren't already present
  for (const [key, value] of Object.entries(entries)) {
    if (value) {
      updated.push(`${key}=${value}`);
    }
  }

  // Ensure directory exists
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  fs.writeFileSync(CONFIG_FILE, updated.join("\n") + "\n", "utf8");

  // Also inject into current process so the user doesn't have to restart
  ensureConfigLoaded();
}
