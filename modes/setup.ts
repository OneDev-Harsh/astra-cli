import chalk from "chalk";
import { intro, outro, text, confirm, isCancel, select, autocomplete } from "@clack/prompts";
import {
  getEnv,
  saveConfig,
} from "../ai/config-loader";
import {
  enableSandboxMode,
  disableSandboxMode,
  isSandboxEnabled,
  activateSandbox,
  SANDBOX_MODEL,
} from "../ai";
import { withSpinner } from "../tui/spinner";

// ── OpenRouter Model Interface ────────────────────────────────────────────
interface OpenRouterModel {
  id: string;
  name: string;
  architecture?: { modality?: string; output_modalities?: string[] };
  pricing?: { prompt: string; completion: string };
}

// ── Main Setup Flow ───────────────────────────────────────────────────────

export async function runSetup(): Promise<void> {
  intro(chalk.bold("astra setup"));

  const currentSandbox = isSandboxEnabled();

  console.log(
    chalk.dim(
      `Config: ~/.astra/.env\n` +
        `Sandbox mode: ${currentSandbox ? chalk.green("active") : chalk.dim("inactive")}\n`
    )
  );

  // ── Mode Selection ──────────────────────────────────────────────
  const modeChoice = await select({
    message: "Select configuration mode:",
    options: [
      {
        value: "standard",
        label: "Standard Mode",
        hint: currentSandbox ? "switch from sandbox" : "API key in config file",
      },
      {
        value: "sandbox",
        label: "Sandbox Mode",
        hint: currentSandbox ? "currently active" : "one-click secure setup",
      },
      {
        value: "keep",
        label: "Keep Current Settings",
        hint: "don't change anything",
      },
    ],
  });
  if (isCancel(modeChoice)) return outro(chalk.dim("Setup cancelled."));

  if (modeChoice === "keep") {
    outro(chalk.dim("No changes made."));
    return;
  }

  if (modeChoice === "sandbox") {
    await runSandboxSetup();
    return;
  }

  // Standard mode — disable sandbox if it was enabled
  if (currentSandbox) {
    await disableSandboxMode();
    console.log(chalk.dim("  Sandbox mode disabled. Credentials purged from secure storage."));
  }
  await runStandardSetup();
}

// ── Sandbox Mode Setup (One-Click) ────────────────────────────────────────

async function runSandboxSetup(): Promise<void> {
  console.log();
  console.log(chalk.bold.cyan("  🔒 Sandbox Mode"));
  console.log(
    chalk.dim(
      "  One-click setup: the API key will be fetched from your\n" +
        "  sandbox server and stored in your OS keychain (encrypted).\n" +
        `  Model is set to ${chalk.white(SANDBOX_MODEL)}.\n`
    )
  );

  const SERVER_URL = "https://astra-server-oh6s.onrender.com";
  const MAX_RETRIES = 12;
  const RETRY_INTERVAL_MS = 5000;
  let serverReady = false;

  // ── Server Connectivity Polling Loop ─────────────────────────────────────
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${SERVER_URL}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        serverReady = true;
        break;
      }
    } catch {
      // Suppress network exceptions to seamlessly fall back to retrying
    }

    if (attempt < MAX_RETRIES) {
      // Dynamic live frame updating without flooding the terminal buffer
      process.stdout.write(
        chalk.dim(
          `  \r› Server unreachable. Retrying connection (${attempt}/${MAX_RETRIES}) in ${RETRY_INTERVAL_MS / 1000}s...`
        )
      );
      await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
    }
  }
  // Clear the active continuous loop text row cleanly
  process.stdout.write("\r\x1b[K");

  if (!serverReady) {
    console.log(
      chalk.yellow(
        "\n  ⚠ Sandbox server is not reachable.\n" +
          "  The sandbox server is a separate service that must be\n" +
          "  running before setup can complete.\n"
      )
    );

    outro(
      chalk.yellow(
        `\n⚠ Sandbox setup incomplete after ${MAX_RETRIES} attempts.\n` +
          `  Ensure the sandbox server is running, then run "astra setup" again.\n`
      )
    );
    return;
  }

  // ── One-Click Activation ─────────────────────────────────────────
  console.log();

  let activationResult: { success: boolean; message: string };
  try {
    activationResult = await withSpinner(
      {
        message: "Activating sandbox mode...",
        doneMessage: "Sandbox activated!",
        failMessage: "Activation failed.",
      },
      async () => {
        return activateSandbox(SERVER_URL);
      }
    );
  } catch (err) {
    activationResult = {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  if (!activationResult.success) {
    outro(chalk.red(`\n✗ ${activationResult.message}`));
    return;
  }

  console.log(chalk.dim(`  ${activationResult.message}`));

  // ── Optional: Firecrawl ─────────────────────────────────────────
  const currentFirecrawl = getEnv("FIRECRAWL_API_KEY") ?? "";
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

  // ── Optional: Skills Directories ────────────────────────────────
  const currentSkillsDirs = getEnv("SKILLS_DIRS") ?? "";
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

  // ── Save optional entries ───────────────────────────────────────
  const entries: Record<string, string> = {};
  if (firecrawlKey) entries.FIRECRAWL_API_KEY = firecrawlKey;
  if (skillsDirs) entries.SKILLS_DIRS = skillsDirs;
  if (Object.keys(entries).length > 0) {
    saveConfig(entries);
  }

  // ── Done ────────────────────────────────────────────────────────
  outro(
    chalk.green(
      `\n✔ Sandbox mode configured!\n` +
        `    Model: ${SANDBOX_MODEL}\n` +
        `    Key storage: OS keychain (encrypted)\n` +
        `\n` +
        chalk.dim(`    Run: `) +
        chalk.cyan(`astra wakeup`) +
        `\n`
    )
  );
}

// ── Standard Mode Setup ───────────────────────────────────────────────────

async function runStandardSetup(): Promise<void> {
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
      validate: (v) => ((v ?? "").trim() ? undefined : "API key is required"),
    });
    if (isCancel(val)) return outro(chalk.dim("Setup cancelled."));
    apiKey = (val ?? "").trim();
  }

  // ── Model Selection ─────────────────────────────────────────────
  const setModel = await confirm({
    message: "Set default OpenRouter model?",
    initialValue: !currentModel,
  });
  if (isCancel(setModel)) return outro(chalk.dim("Setup cancelled."));

  let finalModelId = currentModel;

  if (setModel) {
    let modelOptions: Array<{ value: string; label: string; hint?: string }> = [];

    try {
      modelOptions = await withSpinner(
        {
          message: "Fetching available OpenRouter models...",
          doneMessage: "Models loaded.",
          failMessage: "Using manual entry.",
        },
        async () => {
          const response = await fetch("https://openrouter.ai/api/v1/models");
          if (!response.ok) throw new Error("Failed");
          const json = (await response.json()) as { data: OpenRouterModel[] };
          return json.data
            .filter((m) => {
              const out = m.architecture?.output_modalities;
              const mod = m.architecture?.modality || "";
              if (out) return out.includes("text");
              if (mod) return mod.endsWith("->text");
              return true;
            })
            .map((m) => {
              const provider = m.id.split("/")[0];
              const pp = parseFloat(m.pricing?.prompt || "0") * 1_000_000;
              const cp = parseFloat(m.pricing?.completion || "0") * 1_000_000;
              const pricing = pp > 0 || cp > 0
                ? `In: $${pp.toFixed(2)}, Out: $${cp.toFixed(2)} /1M`
                : "Free";
              return { value: m.id, label: m.name || m.id, hint: `${provider} (${pricing})` };
            });
        }
      );
    } catch { /* fallback to manual */ }

    if (modelOptions.length > 0) {
      const { isCancel: isCancel2 } = await import("@clack/prompts");
      const selected = await autocomplete({
        message: "Select a model (type to search/filter):",
        options: [...modelOptions, { value: "custom", label: "Custom Entry...", hint: "manual" }],
        placeholder: "Type to search models...",
      });
      if (isCancel2(selected)) return outro(chalk.dim("Setup cancelled."));

      if (selected === "custom") {
        const { text: text2, isCancel: isCancel3 } = await import("@clack/prompts");
        const custom = await text2({
          message: "Enter model ID",
          placeholder: "provider/model-name",
          initialValue: currentModel,
          validate: (v) => ((v ?? "").trim() ? undefined : "Required"),
        });
        if (isCancel3(custom)) return outro(chalk.dim("Setup cancelled."));
        finalModelId = (custom as string).trim();
      } else {
        finalModelId = selected as string;
      }
    } else {
      const { text: text3, isCancel: isCancel4 } = await import("@clack/prompts");
      const manual = await text3({
        message: "Enter OpenRouter Model ID",
        placeholder: "anthropic/claude-3.5-sonnet",
        initialValue: currentModel || "anthropic/claude-3.5-sonnet",
        validate: (v) => ((v ?? "").trim() ? undefined : "Required"),
      });
      if (isCancel4(manual)) return outro(chalk.dim("Setup cancelled."));
      finalModelId = (manual as string).trim();
    }
  }

  // ── Firecrawl (optional) ────────────────────────────────────────
  const setFirecrawl = await confirm({
    message: "Set Firecrawl API key? (optional)",
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
      placeholder: "/path/to/skills;/another/path",
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
      `\n✔ Configuration saved to ~/.astra/.env\n` +
        `    Run "astra wakeup" to get started.\n`
    )
  );
}