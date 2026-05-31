#!/usr/bin/env bun

import { Command } from "commander";
import { runWakeup } from "./tui/wakeup";
import { runSetup } from "./modes/setup";

const program = new Command();

program.name("astra").description("Astra CLI — AI-native development companion").version("0.1.0");

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
    await runSetup();
  });

await program.parseAsync(process.argv);
