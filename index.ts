#!/usr/bin/env bun

import { Command } from "commander";
import { runWakeup, printBanner } from "./tui/wakeup"; // Imported printBanner for the breathing effect
import { runSetup } from "./modes/setup";
import pkg from "./package.json" with { type: "json" };
import fs from "fs";
import path from "path";
import os from "os";
import chalk from "chalk";
import figlet from "figlet"; // Imported figlet for the arcade banner generation
import { confirm, isCancel, select } from "@clack/prompts";
import { exec } from "child_process";

const program = new Command();

program
  .name("astra")
  .description("Astra CLI — AI-native development companion")
  .version(pkg.version, "-v, --version", "Output the current version");

program
  .command("wakeup")
  .description("Show the banner and pick interaction mode")
  .action(async () => {
    await runWakeup();
  });

program
  .command("setup")
  .description("Configure API keys and settings (~/.astra/.env)")
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

    // Play the full breathing banner animation with the twinkling stars
    await printBanner(setupAscii);
    await runSetup();
  });

program
  .command("play")
  .description("Launch an undocumented workspace arcade easter egg mini-game")
  .action(async () => {
    // Generate the baseline ASCII asset for the arcade room
    let arcadeAscii = "";
    try {
      arcadeAscii = figlet.textSync("ARCADE", {
        font: "ANSI Shadow",
        horizontalLayout: "fitted",
      });
    } catch {
      arcadeAscii = figlet.textSync("ARCADE", { font: "Standard" });
    }

    // Play the full breathing banner animation with the twinkling stars
    await printBanner(arcadeAscii);

    console.log(chalk.bold.magenta("  🎮 Astra Arcade Workspace Matrix\n"));

    // 1. Interactive Game Selector Prompt
    const gameChoice = await select({
      message: "Choose an arcade game to launch:",
      options: [
        { value: "index.html", label: "Retro Snake Classic" },
        { value: "neon-breaker.html", label: "Neon Brick Breaker" },
        { value: "neon-pong.html", label: "Neon Pong"},
        { value: "cosmic-drifter", label: "Cosmic Drifter"},
        { value: "exit", label: "Exit"}
      ],
    });

    if (isCancel(gameChoice) || gameChoice==="exit") {
      console.log(chalk.dim("  Arcade closed.\n"));
      return;
    }

    // Resolve the internal path safely relative to the executing workspace binary bundle
    const gameFilePath = path.join(import.meta.dir, "game", gameChoice);

    if (!fs.existsSync(gameFilePath)) {
      console.log(chalk.red(`\n  ✗ Asset mismatch: Game asset not found at ${gameFilePath}\n`));
      return;
    }

    const PORT = 4321;
    const localUrl = `http://localhost:${PORT}`;

    // 2. Spawn a background static asset file server using Bun's fast native engine
    try {
      Bun.serve({
        port: PORT,
        fetch(req) {
          return new Response(Bun.file(gameFilePath));
        },
      });

      console.log(chalk.green(`\n  ✓ Local arcade matrix listening live at ${localUrl}`));
      console.log(chalk.dim("  Press [Ctrl + C] in this terminal session to close down server logs.\n"));

      // 3. Automatically spawn their default system web browser target
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
  .description("Completely remove all localized configurations, sessions, and credentials cached by Astra")
  .action(async () => {
    console.log(chalk.bold.yellow("\n  ⚠ Danger Zone"));
    
    const targetDir = path.join(os.homedir(), ".astra");
    
    if (!fs.existsSync(targetDir)) {
      console.log(chalk.dim("  No active data store or environment parameters discovered at ~/.astra.\n"));
      return;
    }

    const authorized = await confirm({
      message: "Are you absolutely sure you want to purge all stored configurations, environments, and historical run data?",
      initialValue: false,
    });

    if (isCancel(authorized) || !authorized) {
      console.log(chalk.dim("  Reset aborted.\n"));
      return;
    }

    try {
      fs.rmSync(targetDir, { recursive: true, force: true });
      console.log(chalk.green(`\n  ✓ Local cache wiped successfully from ${targetDir}`));
      console.log(chalk.dim("  To completely remove the companion binary, run: ") + chalk.cyan("npm uninstall -g astra-dev-cli\n"));
    } catch (error) {
      console.error(chalk.red(`\n  ✗ Failed to clear cache directory: ${(error as Error).message}\n`));
    }
  });

await program.parseAsync(process.argv);

// Export programmatic version for custom tool diagnostics or bug report attachments
export const ASTRA_VERSION = pkg.version;