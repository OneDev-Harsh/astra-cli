#!/usr/bin/env bun

import {Command} from "commander";

const program = new Command();

program.name("astra-cli").description("Astra cli").version("0.0.1");

program.command("wakeup").description("Show the banner and pick interaction mode").action(async () => {
    console.log("Wakeup function....")
})

await program.parseAsync(process.argv)