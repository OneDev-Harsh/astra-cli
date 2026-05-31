import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getEnv,getConfigPath } from "./config-loader";

export function getAgentModel() {
  const apiKey = getEnv("OPENROUTER_API_KEY");
  const modelId = getEnv("OPENROUTER_DEFAULT_MODEL");

  if (!apiKey) {
    throw new Error(
      `OPENROUTER_API_KEY is not set.` +
        `\n  Run "astra setup" to configure your keys, or set the env var.` +
        `\n  Config file: ${getConfigPath()}`
    );
  }

  if (!modelId) {
    throw new Error(
      `OPENROUTER_DEFAULT_MODEL is not set.` +
        `\n  Run "astra setup" to configure your keys, or set the env var.` +
        `\n  Config file: ${getConfigPath()}`
    );
  }

  const provider = createOpenRouter({ apiKey });

  return provider(modelId);
}
