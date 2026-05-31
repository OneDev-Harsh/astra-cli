import {select, isCancel, spinner} from "@clack/prompts"
import chalk from "chalk"
import figlet from "figlet"
import { runCliMode } from "../modes/cli"

const BANNER_FONT = "ANSI Shadow"
const FACE = chalk.hex('#ffd000')

function printBanner(ascii: string) {
    console.log();

    console.log(FACE(ascii));

    console.log(
        chalk.dim("AI-native development companion")
    );

    console.log(
        chalk.gray("v0.0.1")
    );

    console.log();
}

export async function runWakeup() {
    let ascii: string;

    const s = spinner();
    s.start("Rendering banner…");

    try {
        ascii = figlet.textSync("astra", { font: BANNER_FONT });
    } catch {
        ascii = figlet.textSync("astra", { font: "Standard" });
    }

    s.stop("Banner ready");

    while (true) {
        console.clear();
        printBanner(ascii);

        const mode = await select({
            message: "Which mode do you want to proceed with?",
            options: [
                { value: "cli", label: "CLI" },
                { value: "telegram", label: "Telegram" },
                { value: "exit", label: "Exit" }
            ]
        });

        if (isCancel(mode) || mode === "exit") {
            console.log(chalk.dim("\nSee you again.\n"));
            return;
        }

        if (mode === "cli") {
            console.log(chalk.dim("Starting CLI mode...."));
            await runCliMode();
            continue;
        }

        if (mode === "telegram") {
            console.log(chalk.dim("Starting Telegram mode...."));
        }
    }
}
