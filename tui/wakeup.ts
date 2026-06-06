import { select, isCancel, confirm } from "@clack/prompts";
import chalk from "chalk";
import figlet from "figlet";
import { runCliMode } from "../modes/cli";
import { getResumableSession, formatSessionLine } from "../session";
import { withSpinner } from "./spinner"; // Custom high-fidelity spinner

const BANNER_FONT = "ANSI Shadow";

// ── Clean & Minimal Color Palette ─────────────────────────────────────────
const C = {
    brand: chalk.bold.hex("#a78bfa"),    // Vibrant clean violet
    text: chalk.hex("#f3f4f6"),         // Off-white for high readability
    dim: chalk.hex("#6b7280"),          // Subtle gray for secondary metadata
    success: chalk.bold.hex("#34d399"),  // Emerald green accent
    warning: chalk.bold.hex("#fbbf24"),  // Amber yellow for attention items
};

/**
 * Prints a clean, high-contrast application header.
 */
function printBanner(ascii: string) {
    console.log();
    
    // Render the ASCII art safely with the brand color accent
    const lines = ascii.split("\n");
    lines.forEach((line) => {
        if (line.trim().length > 0) {
            console.log(`  ${C.brand(line)}`);
        }
    });

    // Sub-header layout
    console.log(
        `\n  ${C.success("●")} ${C.text("ASTRA")} ${C.dim("│")} ${C.dim("AI-native development companion")}`
    );
    console.log(`  ${C.dim("  Version 0.1.0 — Environment Ready")}\n`);
}

/**
 * Standard initialization workflow wrapped in the custom loader framework
 */
async function initializeSystem(): Promise<string> {
    return await withSpinner(
        {
            message: "Initializing Astra development workspace...",
            doneMessage: "Workspace initialized successfully.",
            failMessage: "Initialization failed. Falling back to default canvas.",
        },
        async (ctx) => {
            // Light natural pacing overhead to ensure the UI feels responsive
            await new Promise((resolve) => setTimeout(resolve, 400));
            ctx.updateMetric("Loading configuration");
            
            let ascii = "";
            try {
                ascii = figlet.textSync("astra", { font: BANNER_FONT });
            } catch {
                ascii = figlet.textSync("astra", { font: "Standard" });
            }
            
            await new Promise((resolve) => setTimeout(resolve, 300));
            ctx.updateMetric("Ready");
            return ascii;
        }
    );
}

export async function runWakeup() {
    console.clear();
    
    // Boot up sequence displaying your metric-enhanced loader
    const ascii = await initializeSystem();

    while (true) {
        console.clear();
        printBanner(ascii);

        // Check for resumable session states
        const recent = getResumableSession(process.cwd());
        if (recent && recent.status === "interrupted") {
            console.log(
                `  ${C.warning("⏸  Previous session was interrupted:")} ${C.text(recent.lastGoal.slice(0, 60))}...`
            );
            console.log(`     ${C.dim(formatSessionLine(recent))}\n`);
            
            const resume = await confirm({
                message: "Would you like to resume this session?",
                initialValue: true,
            });
            
            if (!isCancel(resume) && resume) {
                (globalThis as any).__ASTRA_RESUME_SESSION__ = recent.id;
                console.log(C.dim("  Re-attaching to pipeline context..."));
                await runCliMode();
                continue;
            }
        }

        // Clean, structured interactive select layout
        const mode = await select({
            message: "Select an execution mode to proceed:",
            options: [
                { value: "cli", label: "Interactive CLI Mode" },
                { value: "telegram", label: "Telegram Gateway Interface" },
                { value: "exit", label: "Exit Application" }
            ]
        });

        if (isCancel(mode) || mode === "exit") {
            console.log(C.dim("\n  Session closed. Goodbye.\n"));
            return;
        }

        if (mode === "cli") {
            console.log(C.dim("  Launching local environment CLI..."));
            await runCliMode();
            continue;
        }

        if (mode === "telegram") {
            console.log(C.dim("  Connecting to Telegram services..."));
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
}