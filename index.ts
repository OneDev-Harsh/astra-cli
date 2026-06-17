#!/usr/bin/env bun

import { Command } from "commander";
import { runWakeup, printBanner } from "./tui/wakeup";
import { runSetup } from "./modes/setup";
import pkg from "./package.json" with { type: "json" };
import fs from "fs";
import path from "path";
import os from "os";
import chalk from "chalk";
import figlet from "figlet";
import { confirm, isCancel, select } from "@clack/prompts";
import { exec } from "child_process";
import { runAutoMode } from "./modes/auto";
import {
  isSandboxMode,
  getSandboxConfigSafe,
  activateSandbox,
  disableSandboxMode,
  SANDBOX_MODEL,
} from "./ai";
import { withSpinner } from "./tui/spinner";
import { registerProcessErrorHandlers } from "./core/logger";
import { runAgentMode } from "./modes/agent/orchestrator";
registerProcessErrorHandlers();

const program = new Command();

program
  .name("astra")
  .description("Astra CLI — AI-native development companion")
  .version(pkg.version, "-v, --version", "Output the current version");

program
  .argument("[prompt...]", "Optional direct prompt goal to execute instantly in Agent Mode")
  .action(async (promptArray: string[]) => {
    if (promptArray && promptArray.length > 0) {
      const combinedGoal = promptArray.join(" ").trim();
      if (combinedGoal) {
        await runAgentMode(combinedGoal);
        return;
      }
    }
    await runWakeup();
  });

program
  .command("wakeup")
  .description("Show the banner and pick interaction mode")
  .action(async () => {
    await runWakeup();
  });

program
  .command("setup")
  .description("Configure API keys and settings")
  .action(async () => {
    let setupAscii = "";
    try {
      setupAscii = figlet.textSync("SETUP", {
        font: "ANSI Shadow",
        horizontalLayout: "fitted",
      });
    } catch {
      setupAscii = figlet.textSync("SETUP", { font: "Standard" });
    }
    await printBanner(setupAscii);
    await runSetup();
  });

program
  .command("sandbox")
  .description("Activate sandbox mode — one-click secure setup")
  .action(async () => {
    const cfg = getSandboxConfigSafe();
    if (cfg.enabled) {
      console.log(chalk.green(`\n  ✔ Sandbox mode is active (model: ${cfg.model})\n`));
      const reconfigure = await confirm({
        message: "Reconfigure sandbox mode?",
        initialValue: false,
      });
      if (isCancel(reconfigure) || !reconfigure) return;
    }

    console.log(chalk.bold.cyan("\n  🔒 Sandbox Mode Activation\n"));
    console.log(
      chalk.dim(
        "  Connects to the local sandbox server, fetches an API key,\n" +
          `  and stores it in your OS keychain (encrypted). Model: ${SANDBOX_MODEL}\n`
      )
    );

    const proceed = await confirm({
      message: "Activate sandbox mode?",
      initialValue: true,
    });
    if (isCancel(proceed) || !proceed) {
      console.log(chalk.dim("  Cancelled.\n"));
      return;
    }

    const result = await withSpinner(
      {
        message: "Activating sandbox mode...",
        doneMessage: "Sandbox activated!",
        failMessage: "Activation failed.",
      },
      async () => activateSandbox()
    );

    if (result.success) {
      console.log(chalk.green(`\n  ✔ ${result.message}`));
      console.log(chalk.dim(`  Run: `) + chalk.cyan(`astra wakeup`) + `\n`);
    } else {
      console.log(chalk.red(`\n  ✗ ${result.message}\n`));
    }
  });

program
  .command("play")
  .description("Launch an undocumented workspace arcade easter egg mini-game")
  .action(async () => {
    let arcadeAscii = "";
    try {
      arcadeAscii = figlet.textSync("ARCADE", {
        font: "ANSI Shadow",
        horizontalLayout: "fitted",
      });
    } catch {
      arcadeAscii = figlet.textSync("ARCADE", { font: "Standard" });
    }
    await printBanner(arcadeAscii);

    console.log(chalk.bold.magenta("  🎮 Astra Arcade Workspace Matrix\n"));

    const gameChoice = await select({
      message: "Choose an arcade game to launch:",
      options: [
        { value: "index.html", label: "Retro Snake Classic" },
        { value: "neon-breaker.html", label: "Neon Brick Breaker" },
        { value: "neon-pong.html", label: "Neon Pong" },
        { value: "exit", label: "Exit" },
      ],
    });

    if (isCancel(gameChoice) || gameChoice === "exit") {
      console.log(chalk.dim("  Arcade closed.\n"));
      return;
    }

    const gameFilePath = path.join(import.meta.dir, "game", gameChoice);

    if (!fs.existsSync(gameFilePath)) {
      console.log(chalk.red(`\n  ✗ Game asset not found at ${gameFilePath}\n`));
      return;
    }

    const PORT = 4321;
    const localUrl = `http://localhost:${PORT}`;

    try {
      Bun.serve({
        port: PORT,
        fetch(req) {
          return new Response(Bun.file(gameFilePath));
        },
      });

      console.log(chalk.green(`\n  ✓ Local arcade matrix listening live at ${localUrl}`));
      console.log(chalk.dim("  Press [Ctrl + C] to close.\n"));

      const startCmd =
        process.platform === "win32" ? "start" :
        process.platform === "darwin" ? "open" : "xdg-open";

      exec(`${startCmd} ${localUrl}`);
    } catch (err) {
      console.error(chalk.red(`\n  ✗ Port initialization blocked: ${(err as Error).message}\n`));
    }
  });

program
  .command("reset")
  .description("Completely remove all configurations, sessions, and credentials")
  .action(async () => {
    console.log(chalk.bold.yellow("\n  ⚠ Danger Zone"));

    const targetDir = path.join(os.homedir(), ".astra");

    if (!fs.existsSync(targetDir)) {
      console.log(chalk.dim("  No data found at ~/.astra.\n"));
      return;
    }

    const authorized = await confirm({
      message: "Purge all stored configurations, credentials, and session data?",
      initialValue: false,
    });

    if (isCancel(authorized) || !authorized) {
      console.log(chalk.dim("  Reset aborted.\n"));
      return;
    }

    try {
      fs.rmSync(targetDir, { recursive: true, force: true });
      console.log(chalk.green(`\n  ✓ Data wiped from ${targetDir}`));
      console.log(chalk.dim("  To remove the binary: ") + chalk.cyan("npm uninstall -g astra-dev-cli\n"));
    } catch (error) {
      console.error(chalk.red(`\n  ✗ Failed: ${(error as Error).message}\n`));
    }
  });

await program.parseAsync(process.argv);

export const ASTRA_VERSION = pkg.version;
