import chalk from "chalk";
import { intro, outro, text, confirm, isCancel } from "@clack/prompts";
import {
  getEnv,
  getConfigPath,
  getConfigDir,
  saveConfig,
} from "../ai/config-loader";

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

  // ── Default Model ───────────────────────────────────────────────
  const setModel = await confirm({
    message: "Set default OpenRouter model?",
    initialValue: !currentModel,
  });
  if (isCancel(setModel)) return outro(chalk.dim("Setup cancelled."));

  let modelId = currentModel;
  if (setModel) {
    const val = await text({
      message: "Default model ID",
      placeholder: "anthropic/claude-sonnet-4.5",
      initialValue: currentModel || "anthropic/claude-sonnet-4.5",
      validate: (v) =>
        (v ?? "").trim() ? undefined : "Model ID is required",
    });
    if (isCancel(val)) return outro(chalk.dim("Setup cancelled."));
    modelId = val.trim();
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
      validate: (_v) => undefined, // optional field, empty is fine
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
      validate: (_v) => undefined, // optional field, empty is fine
    });
    if (isCancel(val)) return outro(chalk.dim("Setup cancelled."));
    skillsDirs = (val ?? "").trim();
  }

  // ── Save ────────────────────────────────────────────────────────
  const entries: Record<string, string> = {};
  if (apiKey) entries.OPENROUTER_API_KEY = apiKey;
  if (modelId) entries.OPENROUTER_DEFAULT_MODEL = modelId;
  if (firecrawlKey) entries.FIRECRAWL_API_KEY = firecrawlKey;
  if (skillsDirs) entries.SKILLS_DIRS = skillsDirs;

  saveConfig(entries);

  outro(
    chalk.green(
      `\n✔ Configuration saved to ${getConfigPath()}\n` +
        `  You can now run "astra wakeup" to get started.\n`
    )
  );
}
