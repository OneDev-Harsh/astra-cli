import chalk from "chalk";
import { intro, outro, text, confirm, isCancel, autocomplete } from "@clack/prompts";
import {
  getEnv,
  getConfigPath,
  saveConfig,
} from "../ai/config-loader";
import { withSpinner } from "../tui/spinner"; // Adjust path as necessary

// 1. Updated interface to include OpenRouter's exact pricing object structure
interface OpenRouterModel {
  id: string;
  name: string;
  architecture?: {
    modality?: string;
    output_modalities?: string[];
  };
  pricing?: {
    prompt: string;      // Price per individual token
    completion: string;  // Price per individual token
  };
}

export async function runSetup(): Promise<void> {
  intro(chalk.bold("astra setup"));

  console.log(
    chalk.dim(
      `Config will be saved to ${getConfigPath()}\n` +
        `Existing values will be preserved when possible.\n`
    )
  );

  const currentKey = getEnv("OPENROUTER_API_KEY") ?? "";
  const currentModel = getEnv("OPENROUTER_DEFAULT_MODEL") ?? "";
  const currentFirecrawl = getEnv("FIRECRAWL_API_KEY") ?? "";
  const currentSkillsDirs = getEnv("SKILLS_DIRS") ?? "";

  // ── OpenRouter API Key ──────────────────────────────────────────
  const setKey = await confirm({
    message: "Set OpenRouter API key?",
    initialValue: !currentKey,
  });
  if (isCancel(setKey)) return outro(chalk.dim("Setup cancelled."));

  let apiKey = currentKey;
  if (setKey) {
    const val = await text({
      message: "OpenRouter API key",
      placeholder: "sk-or-...",
      initialValue: currentKey,
      validate: (v) =>
        (v ?? "").trim() ? undefined : "API key is required",
    });
    if (isCancel(val)) return outro(chalk.dim("Setup cancelled."));
    apiKey = val.trim();
  }

  // ── Fetching All OpenRouter Models Dynamically ───────────────────
  let modelOptions: Array<{ value: string; label: string; hint?: string }> = [];

  const setModel = await confirm({
    message: "Set default OpenRouter model?",
    initialValue: !currentModel,
  });
  if (isCancel(setModel)) return outro(chalk.dim("Setup cancelled."));

  if (setModel) {
    try {
      modelOptions = await withSpinner(
        {
          message: "Fetching all available OpenRouter models & pricing...",
          doneMessage: "Loaded models successfully.",
          failMessage: "Failed to fetch dynamic list. Dropping back to fallback entry.",
        },
        async () => {
          const response = await fetch("https://openrouter.ai/api/v1/models");
          if (!response.ok) throw new Error("Failed to communicate with OpenRouter registry");
          
          const json = (await response.json()) as { data: OpenRouterModel[] };
          
          return json.data
            .filter((model) => {
              const outModalities = model.architecture?.output_modalities;
              const modalityStr = model.architecture?.modality || "";
              
              if (outModalities) return outModalities.includes("text");
              if (modalityStr) return modalityStr.endsWith("->text");
              
              return true;
            })
            .map((model) => {
              const provider = model.id.split("/")[0];
              
              // Convert price-per-token strings to a clean price per 1 Million tokens
              const promptPriceNum = parseFloat(model.pricing?.prompt || "0") * 1_000_000;
              const completionPriceNum = parseFloat(model.pricing?.completion || "0") * 1_000_000;

              let pricingHint = "Free";
              if (promptPriceNum > 0 || completionPriceNum > 0) {
                pricingHint = `In: $${promptPriceNum.toFixed(2)}, Out: $${completionPriceNum.toFixed(2)} /1M`;
              }

              return {
                value: model.id,
                label: model.name || model.id,
                hint: `${provider} (${pricingHint})`,
              };
            });
        }
      );
    } catch (error) {
      modelOptions = []; 
    }

    let modelId = currentModel;

    if (modelOptions.length > 0) {
      const selectedModel = await autocomplete({
        message: "Select an OpenRouter text model (Type to search & compare pricing)",
        options: [
          ...modelOptions,
          { value: "custom", label: "Custom Entry...", hint: "Type manual ID" }
        ],
        placeholder: "Search e.g. 'claude', 'gpt', 'llama'...",
      });
      if (isCancel(selectedModel)) return outro(chalk.dim("Setup cancelled."));

      if (selectedModel === "custom") {
        const customVal = await text({
          message: "Enter custom OpenRouter Model ID",
          placeholder: "provider/model-name",
          initialValue: currentModel,
          validate: (v) => ((v ?? "").trim() ? undefined : "Model ID is required"),
        });
        if (isCancel(customVal)) return outro(chalk.dim("Setup cancelled."));
        modelId = customVal.trim();
      } else {
        modelId = selectedModel as string;
      }
    } else {
      const fallbackVal = await text({
        message: "Enter OpenRouter Model ID",
        placeholder: "anthropic/claude-3.5-sonnet",
        initialValue: currentModel || "anthropic/claude-3.5-sonnet",
        validate: (v) => ((v ?? "").trim() ? undefined : "Model ID is required"),
      });
      if (isCancel(fallbackVal)) return outro(chalk.dim("Setup cancelled."));
      modelId = fallbackVal.trim();
    }
    
    var finalModelId = modelId;
  } else {
    var finalModelId = currentModel;
  }

  // ── Firecrawl API Key (optional) ────────────────────────────────
  const setFirecrawl = await confirm({
    message: "Set Firecrawl API key? (optional — enables web search & crawl)",
    initialValue: false,
  });
  if (isCancel(setFirecrawl)) return outro(chalk.dim("Setup cancelled."));

  let firecrawlKey = currentFirecrawl;
  if (setFirecrawl) {
    const val = await text({
      message: "Firecrawl API key",
      placeholder: "fc-...",
      initialValue: currentFirecrawl,
      validate: (_v) => undefined,
    });
    if (isCancel(val)) return outro(chalk.dim("Setup cancelled."));
    firecrawlKey = (val ?? "").trim();
  }

  // ── Skills Directories (optional) ───────────────────────────────
  const setSkills = await confirm({
    message: "Set custom skills directories? (optional)",
    initialValue: false,
  });
  if (isCancel(setSkills)) return outro(chalk.dim("Setup cancelled."));

  let skillsDirs = currentSkillsDirs;
  if (setSkills) {
    const val = await text({
      message: "Skills directories (semicolon-separated)",
      placeholder: "/path/to/skills;/another/dir",
      initialValue: currentSkillsDirs,
      validate: (_v) => undefined,
    });
    if (isCancel(val)) return outro(chalk.dim("Setup cancelled."));
    skillsDirs = (val ?? "").trim();
  }

  // ── Save ────────────────────────────────────────────────────────
  const entries: Record<string, string> = {};
  if (apiKey) entries.OPENROUTER_API_KEY = apiKey;
  if (finalModelId) entries.OPENROUTER_DEFAULT_MODEL = finalModelId;
  if (firecrawlKey) entries.FIRECRAWL_API_KEY = firecrawlKey;
  if (skillsDirs) entries.SKILLS_DIRS = skillsDirs;

  saveConfig(entries);

  outro(
    chalk.green(
      `\n✔ Configuration saved to ${getConfigPath()}\n` +
        `    You can now run "astra wakeup" to get started.\n`
    )
  );
}