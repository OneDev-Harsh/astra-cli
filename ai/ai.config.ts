/**
 * AI Model Cache
 *
 * Caches the OpenRouter provider and model instances to avoid
 * re-creating them on every call to getAgentModel().
 *
 * Supports two modes:
 * - Standard: API key from ~/.astra/.env config file
 * - Sandbox: API key fetched from secure storage (OS keychain / encrypted file)
 * Model is always owl-alpha in sandbox mode
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getEnv, getConfigPath } from "./config-loader";
import { getSandboxApiKey, isSandboxEnabled, SANDBOX_MODEL } from "./sandbox-config";

// ── Cached State ───────────────────────────────────────────────────────────

interface CachedModel {
  apiKey: string;
  modelId: string;
  sessionId: string | null;
  model: ReturnType<ReturnType<typeof createOpenRouter>>;
  source: "config" | "sandbox";
}

let _cached: CachedModel | null = null;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Get the cached agent model instance.
 * Accepts an optional sessionId to enable provider sticky routing for context prompt caching.
 */
export async function getAgentModel(sessionId?: string) {
  const sandboxEnabled = isSandboxEnabled();

  if (sandboxEnabled) {
    return getAgentModelSandbox(sessionId);
  }

  return getAgentModelStandard(sessionId);
}

/**
 * Get the agent model in standard (non-sandbox) mode.
 */
function getAgentModelStandard(sessionId?: string) {
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

  // Return cached instance if credentials and session configuration haven't changed
  if (
    _cached &&
    _cached.source === "config" &&
    _cached.apiKey === apiKey &&
    _cached.modelId === modelId &&
    _cached.sessionId === (sessionId ?? null)
  ) {
    return _cached.model;
  }

  // Option 1: Create a highly optimized OpenRouter provider with caching & sticky session mapping
  const provider = createOpenRouter({ 
    apiKey,
    headers: {
      // Instructs OpenRouter to instantly serve matching downstream completions from edge cache
      "X-OpenRouter-Cache": "true",
      // Pins subsequent prompt sequence modifications to the exact same hardware node
      // to maximize prefix/prompt caching performance hit rates (e.g., Claude 3.5 Sonnet / DeepSeek)
      ...(sessionId ? { "session_id": sessionId } : {})
    }
  });
  const model = provider.chat(modelId);

  _cached = { apiKey, modelId, sessionId: sessionId ?? null, model, source: "config" };
  return model;
}

/**
 * Get the agent model in sandbox mode.
 */
async function getAgentModelSandbox(sessionId?: string) {
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
    _cached.modelId === modelId &&
    _cached.sessionId === (sessionId ?? null)
  ) {
    return _cached.model;
  }

  const provider = createOpenRouter({ 
    apiKey,
    headers: {
      "X-OpenRouter-Cache": "true",
      ...(sessionId ? { "session_id": sessionId } : {})
    }
  });
  const model = provider.chat(modelId);

  _cached = { apiKey, modelId, sessionId: sessionId ?? null, model, source: "sandbox" };
  return model;
}

export function isSandboxMode(): boolean {
  return isSandboxEnabled();
}

export function getSandboxConfigSafe(): {
  enabled: boolean;
  model: string;
} {
  return {
    enabled: isSandboxEnabled(),
    model: SANDBOX_MODEL,
  };
}

export function invalidateModelCache(): void {
  _cached = null;
}