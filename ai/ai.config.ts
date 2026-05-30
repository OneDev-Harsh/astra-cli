import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export function getAgentModel() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const modelId = process.env.OPENROUTER_DEFAULT_MODEL;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  if (!modelId) {
    throw new Error("OPENROUTER_DEFAULT_MODEL is not set");
  }

  const provider = createOpenRouter({ apiKey });

  return provider(modelId);
}