/**
 * AI Model Cache
 *
 * Caches the OpenRouter provider and model instances to avoid
 * re-creating them on every call to getAgentModel().
 *
 * The provider is created lazily on first use and reused for all
 * subsequent calls. This eliminates redundant object creation and
 * reduces GC pressure during multi-agent orchestration.
 *
 * Supports two modes:
 * - Standard: API key from ~/.astra/.env config file
 * - Sandbox: API key fetched from secure storage (OS keychain / encrypted file)
 *            Model is always owl-alpha in sandbox mode
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getEnv, getConfigPath } from "./config-loader";
import { getSandboxApiKey, isSandboxEnabled, SANDBOX_MODEL } from "./sandbox-config";

// ── Cached State ───────────────────────────────────────────────────────────

interface CachedModel {
  apiKey: string;
  modelId: string;
  model: ReturnType<ReturnType<typeof createOpenRouter>>;
  source: "config" | "sandbox";
}

let _cached: CachedModel | null = null;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Get the cached agent model instance.
 *
 * On the first call, creates the OpenRouter provider and model.
 * On subsequent calls, returns the cached instance if the API key
 * and model ID haven't changed. If they have changed, recreates
 * the provider with the new credentials.
 *
 * In sandbox mode, the API key is fetched from secure storage.
 * In standard mode, the API key is read from the config file.
 *
 * @returns The language model instance for agent operations.
 * @throws Error if OPENROUTER_API_KEY or OPENROUTER_DEFAULT_MODEL is not set.
 */
export async function getAgentModel() {
  const sandboxEnabled = isSandboxEnabled();

  if (sandboxEnabled) {
    return getAgentModelSandbox();
  }

  return getAgentModelStandard();
}

/**
 * Get the agent model in standard (non-sandbox) mode.
 */
function getAgentModelStandard() {
  const apiKey = getEnv("OPENROUTER_API_KEY");
  const modelId = getEnv("OPENROUTER_DEFAULT_MODEL");

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set." +
        '\n  Run "astra setup" to configure your keys, or set the env var.' +
        `\n  Config file: ${getConfigPath()}`
    );
  }

  if (!modelId) {
    throw new Error(
      "OPENROUTER_DEFAULT_MODEL is not set." +
        '\n  Run "astra setup" to configure your keys, or set the env var.' +
        `\n  Config file: ${getConfigPath()}`
    );
  }

  // Return cached instance if credentials haven't changed
  if (
    _cached &&
    _cached.source === "config" &&
    _cached.apiKey === apiKey &&
    _cached.modelId === modelId
  ) {
    return _cached.model;
  }

  // Create new provider and cache it
  const provider = createOpenRouter({ apiKey });
  const model = provider.chat(modelId);

  _cached = { apiKey, modelId, model, source: "config" };
  return model;
}

/**
 * Get the agent model in sandbox mode.
 * Fetches the API key from secure storage (OS keychain / encrypted file).
 * Model is always owl-alpha.
 */
async function getAgentModelSandbox() {
  const apiKey = await getSandboxApiKey();
  const modelId = SANDBOX_MODEL;

  if (!apiKey) {
    throw new Error(
      "Sandbox mode is enabled but no API key found in secure storage." +
        '\n  Run "astra setup" to reconfigure sandbox mode, or use "astra sandbox" to activate.'
    );
  }

  // Return cached instance if credentials haven't changed
  if (
    _cached &&
    _cached.source === "sandbox" &&
    _cached.apiKey === apiKey &&
    _cached.modelId === modelId
  ) {
    return _cached.model;
  }

  // Create new provider and cache it
  const provider = createOpenRouter({ apiKey });
  const model = provider.chat(modelId);

  _cached = { apiKey, modelId, model, source: "sandbox" };
  return model;
}

/**
 * Check if sandbox mode is currently active.
 */
export function isSandboxMode(): boolean {
  return isSandboxEnabled();
}

/**
 * Get the current sandbox config (for display purposes).
 * Does NOT include any secrets.
 */
export function getSandboxConfigSafe(): {
  enabled: boolean;
  model: string;
} {
  return {
    enabled: isSandboxEnabled(),
    model: SANDBOX_MODEL,
  };
}

/**
 * Invalidate the cached model instance.
 * Useful for testing or when credentials change at runtime.
 */
export function invalidateModelCache(): void {
  _cached = null;
}
