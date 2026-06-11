/**
 * AI Model Cache
 *
 * Caches the OpenRouter provider and model instances to avoid
 * re-creating them on every call to getAgentModel().
 *
 * The provider is created lazily on first use and reused for all
 * subsequent calls. This eliminates redundant object creation and
 * reduces GC pressure during multi-agent orchestration.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getEnv, getConfigPath } from "./config-loader";

// ── Cached State ───────────────────────────────────────────────────────────

interface CachedModel {
  apiKey: string;
  modelId: string;
  model: ReturnType<ReturnType<typeof createOpenRouter>>;
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
 * @returns The language model instance for agent operations.
 * @throws Error if OPENROUTER_API_KEY or OPENROUTER_DEFAULT_MODEL is not set.
 */
export function getAgentModel() {
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
  if (_cached && _cached.apiKey === apiKey && _cached.modelId === modelId) {
    return _cached.model;
  }

  // Create new provider and cache it
  const provider = createOpenRouter({ apiKey });
  const model = provider.chat(modelId);

  _cached = { apiKey, modelId, model };
  return model;
}

/**
 * Invalidate the cached model instance.
 * Useful for testing or when credentials change at runtime.
 */
export function invalidateModelCache(): void {
  _cached = null;
}
