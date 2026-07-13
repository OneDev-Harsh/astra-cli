import { select, isCancel, confirm } from "@clack/prompts";
import chalk from "chalk";
import figlet from "figlet";
import { runCliMode } from "../modes/cli";
import { getResumableSession, formatSessionLine } from "../session";
import { withSpinner } from "./spinner"; // Custom high-fidelity spinner
import pkg from "../package.json" with { type: "json" };

const BANNER_FONT = "ANSI Shadow";

// ── Clean & Minimal Color Palette ─────────────────────────────────────────
const C = {
    brand: chalk.bold.hex("#a78bfa"),    // Vibrant clean violet
    text: chalk.hex("#f3f4f6"),         // Off-white for high readability
    dim: chalk.hex("#6b7280"),          // Subtle gray for secondary metadata
    success: chalk.bold.hex("#34d399"),  // Emerald green accent
    warning: chalk.bold.hex("#fbbf24"),  // Amber yellow for attention items
    border: chalk.hex("#374151"),       // Sleek border tone for Claude-like cards
};

/**
 * Interpolates between two hex colors by a factor t ∈ [0, 1].
 */
function lerpHex(from: string, to: string, t: number): string {
    const f = from.replace("#", "");
    const t2 = to.replace("#", "");
    const r = Math.round(parseInt(f.slice(0, 2), 16) + (parseInt(t2.slice(0, 2), 16) - parseInt(f.slice(0, 2), 16)) * t);
    const g = Math.round(parseInt(f.slice(2, 4), 16) + (parseInt(t2.slice(2, 4), 16) - parseInt(f.slice(2, 4), 16)) * t);
    const b = Math.round(parseInt(f.slice(4, 6), 16) + (parseInt(t2.slice(4, 6), 16) - parseInt(f.slice(4, 6), 16)) * t);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ── Star Field ──────────────────────────────────────────────────────────────
type Star = { col: number; row: number; phaseOffset: number; speed: number };

const STAR_GLYPHS = ["·", "·", "+", "✦", "✧", "✦", "★"];
const STAR_COLORS = ["#3b2f6e", "#4c3a8a", "#7c5cbf", "#a78bfa", "#c4b0fd", "#e0d4ff"];

function buildStarField(lineCount: number): Star[] {
    let seed = 0xdeadbeef;
    const rand = () => {
        seed ^= seed << 13;
        seed ^= seed >> 17;
        seed ^= seed << 5;
        return (seed >>> 0) / 0xffffffff;
    };

    const stars: Star[] = [];
    const density = 3; 
    for (let row = 0; row < lineCount; row++) {
        for (let i = 0; i < density; i++) {
            stars.push({
                row,
                col:         Math.floor(rand() * 38) + 2,
                phaseOffset: rand() * Math.PI * 2,
                speed:       0.6 + rand() * 1.2,
            });
        }
    }
    return stars;
}

function renderStar(star: Star, time: number): string {
    const brightness = 0.5 + 0.5 * Math.sin(time * star.speed + star.phaseOffset);
    const glyphIdx   = Math.floor(brightness * (STAR_GLYPHS.length - 1));
    const colorIdx   = Math.floor(brightness * (STAR_COLORS.length - 1));
    return chalk.hex(STAR_COLORS[colorIdx]!)(STAR_GLYPHS[glyphIdx]);
}

function buildStarSidebar(stars: Star[], lineCount: number, time: number): string[] {
    const WIDTH = 42;
    const rows: (string)[][] = Array.from({ length: lineCount }, () => Array(WIDTH).fill(" "));
    for (const star of stars) {
        if (star.row < lineCount && star.col < WIDTH) {
            rows[star.row]![star.col] = renderStar(star, time);
        }
    }
    return rows.map((cols) => cols.join(""));
}

let _starField: Star[] | null = null;

/**
 * Prints the banner with clean typographic metadata grids mirroring Claude's desktop layout.
 */
function drawBanner(ascii: string, phase: number, time: number): void {
    const color = lerpHex("#2e1f5e", "#a78bfa", phase);
    const lines = ascii.split("\n").filter((l) => l.trim().length > 0);

    if (!_starField) _starField = buildStarField(lines.length);
    const sidebar = buildStarSidebar(_starField, lines.length, time);

    console.clear();
    console.log(); // Generous top padding
    
    lines.forEach((line, i) => {
        console.log(`  ${chalk.bold.hex(color)(line)}  ${sidebar[i]}`);
    });

    // Claude UX refinement: Structured, framed sub-metadata block
    console.log(`\n  ${C.border("┌────────────────────────────────────────────────────────────┐")}`);
    console.log(`  ${C.border("│")}  ${C.brand("ASTRA")} ${C.dim("•")} ${C.text("AI-Native Development Environment")}                 ${C.border("│")}`);
    console.log(`  ${C.border("│")}  ${C.dim(`Version ${pkg.version}`)} ${C.dim("│")} ${C.success("● Online")} ${C.dim(" ")}                                ${C.border("│")}`);
    console.log(`  ${C.border("└────────────────────────────────────────────────────────────┘")}\n`);
}

export async function printBanner(ascii: string): Promise<void> {
    const DURATION_MS = 1400; // Slightly faster for a snappier interface response
    const FPS = 30;
    const INTERVAL = Math.round(1000 / FPS);
    const steps = Math.round(DURATION_MS / INTERVAL);
    const startTime = Date.now();

    await new Promise<void>((resolve) => {
        let step = 0;
        const timer = setInterval(() => {
            if (step > steps) {
                clearInterval(timer);
                drawBanner(ascii, 1, (Date.now() - startTime) / 1000);
                resolve();
                return;
            }
            const phase = 0.5 + 0.5 * Math.cos((step / steps) * 2 * Math.PI);
            const time  = (Date.now() - startTime) / 1000;
            drawBanner(ascii, phase, time);
            step++;
        }, INTERVAL);
    });
}

async function initializeSystem(): Promise<string> {
    return await withSpinner(
        {
            message: "Configuring development workspace...",
            doneMessage: "Workspace configured.",
            failMessage: "Initialization failed. Reverting to standard canvas.",
        },
        async (ctx) => {
            await new Promise((resolve) => setTimeout(resolve, 400));
            ctx.updateMetric("Indexing project architecture");
            
            let ascii = "";
            try {
                ascii = figlet.textSync("astra", { font: BANNER_FONT });
            } catch {
                ascii = figlet.textSync("astra", { font: "Standard" });
            }
            
            await new Promise((resolve) => setTimeout(resolve, 300));
            ctx.updateMetric("Environment ready");
            return ascii;
        }
    );
}

export async function runWakeup() {
    console.clear();
    const ascii = await initializeSystem();

    while (true) {
        console.clear();
        await printBanner(ascii);

        // Check for resumable session states
        const recent = getResumableSession(process.cwd());
        if (recent && recent.status === "interrupted") {
            // Claude UX refinement: Interrupted sessions structured as clean, boxed callout cards
            console.log(`  ${C.warning("┌── Interrupted Session Detected ────────────────────────────")}`);
            console.log(`  ${C.warning("│")}  ${C.text("Goal:")} ${C.text(recent.lastGoal.slice(0, 50))}...`);
            console.log(`  ${C.warning("│")}  ${C.dim(formatSessionLine(recent))}`);
            console.log(`  ${C.warning("└────────────────────────────────────────────────────────────")}\n`);
            
            const resume = await confirm({
                message: "Would you like to resume this pipeline?",
                initialValue: true,
            });
            
            if (!isCancel(resume) && resume) {
                (globalThis as any).__ASTRA_RESUME_SESSION__ = recent.id;
                console.log(`\n  ${C.dim("› Re-attaching to execution context...")}\n`);
                await runCliMode();
                continue;
            }
            console.log(); // Spacing if rejected
        }

        // Clean interactive execution select layout
        const mode = await select({
            message: "Select an execution mode to proceed:",
            options: [
                { value: "cli", label: "Interactive CLI Mode", hint: "Full workspace context" },
                { value: "exit", label: "Exit Application", hint: "Safely teardown session" }
            ]
        });

        if (isCancel(mode) || mode === "exit") {
            console.log(`\n  ${C.dim("✓ Session closed cleanly. Goodbye.")}\n`);
            return;
        }

        if (mode === "cli") {
            console.log(`\n  ${C.dim("› Booting runtime terminal...")}\n`);
            await runCliMode();
            continue;
        }
    }
}