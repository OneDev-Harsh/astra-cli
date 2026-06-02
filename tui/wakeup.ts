import {select, isCancel, spinner, confirm} from "@clack/prompts"
import chalk from "chalk"
import figlet from "figlet"
import { runCliMode } from "../modes/cli"
import { getResumableSession, formatSessionLine } from "../session";

const BANNER_FONT = "ANSI Shadow"
const FACE = chalk.hex('#ffd000')

function printBanner(ascii: string) {
    console.log();

    console.log(FACE(ascii));

    console.log(
        chalk.dim("AI-native development companion")
    );

    console.log(
        chalk.gray("v0.1.0")
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

        // Check for resumable session
        const recent = getResumableSession(process.cwd());
        if (recent && recent.status === "interrupted") {
            console.log(
                chalk.yellow(`  ⏸ Previous session was interrupted: ${recent.lastGoal.slice(0, 60)}`)
            );
            console.log(chalk.dim(`     ${formatSessionLine(recent)}`));
            console.log();
            const resume = await confirm({
                message: "Resume previous session?",
                initialValue: true,
            });
            if (!isCancel(resume) && resume) {
                (globalThis as any).__ASTRA_RESUME_SESSION__ = recent.id;
                console.log(chalk.dim("Starting CLI mode...."));
                await runCliMode();
                continue;
            }
        }

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
