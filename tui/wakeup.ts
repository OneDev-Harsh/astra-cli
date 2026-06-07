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
// Each star has a stable position and an independent phase offset so they
// twinkle asynchronously. Layout seeded deterministically — same every run.
type Star = { col: number; row: number; phaseOffset: number; speed: number };

const STAR_GLYPHS = ["·", "·", "+", "✦", "✧", "✦", "★"];
const STAR_COLORS = ["#3b2f6e", "#4c3a8a", "#7c5cbf", "#a78bfa", "#c4b0fd", "#e0d4ff"];

function buildStarField(lineCount: number): Star[] {
    // Seeded LCG — stable positions across every frame / run
    let seed = 0xdeadbeef;
    const rand = () => {
        seed ^= seed << 13;
        seed ^= seed >> 17;
        seed ^= seed << 5;
        return (seed >>> 0) / 0xffffffff;
    };

    const stars: Star[] = [];
    const density = 3; // stars per banner row
    for (let row = 0; row < lineCount; row++) {
        for (let i = 0; i < density; i++) {
            stars.push({
                row,
                col:         Math.floor(rand() * 38) + 2,  // spread across ~38 cols
                phaseOffset: rand() * Math.PI * 2,          // independent twinkle start
                speed:       0.6 + rand() * 1.2,            // each star at its own rate
            });
        }
    }
    return stars;
}

/**
 * Renders one star glyph at the current animation time.
 */
function renderStar(star: Star, time: number): string {
    const brightness = 0.5 + 0.5 * Math.sin(time * star.speed + star.phaseOffset);
    const glyphIdx   = Math.floor(brightness * (STAR_GLYPHS.length - 1));
    const colorIdx   = Math.floor(brightness * (STAR_COLORS.length - 1));
    return chalk.hex(STAR_COLORS[colorIdx]!)(STAR_GLYPHS[glyphIdx]);
}

/**
 * Returns one sidebar string per banner line — a fixed-width column of stars
 * placed at stable positions, each pulsing independently.
 */
function buildStarSidebar(stars: Star[], lineCount: number, time: number): string[] {
    const WIDTH = 42;
    // Build per-row character arrays; stars overwrite their slot with a chalk string
    const rows: (string)[][] = Array.from({ length: lineCount }, () => Array(WIDTH).fill(" "));
    for (const star of stars) {
        if (star.row < lineCount && star.col < WIDTH) {
            rows[star.row]![star.col] = renderStar(star, time);
        }
    }
    return rows.map((cols) => cols.join(""));
}

// Pre-built star field — initialised once, reused every frame
let _starField: Star[] | null = null;

/**
 * Prints the banner at a specific breath phase (0 = dim, 1 = full brightness),
 * with a twinkling star field to the right. Clears the screen each frame.
 */
function drawBanner(ascii: string, phase: number, time: number): void {
    const color = lerpHex("#2e1f5e", "#a78bfa", phase);
    const lines = ascii.split("\n").filter((l) => l.trim().length > 0);

    if (!_starField) _starField = buildStarField(lines.length);
    const sidebar = buildStarSidebar(_starField, lines.length, time);

    console.clear();
    console.log();
    lines.forEach((line, i) => {
        console.log(`  ${chalk.bold.hex(color)(line)}  ${sidebar[i]}`);
    });
    console.log(
        `\n  ${C.success("●")} ${C.text("ASTRA")} ${C.dim("│")} ${C.dim("AI-native development companion")}`
    );
    console.log(`  ${C.dim(`  Version ${pkg.version} — Environment Ready`)}\n`);
}

/**
 * Plays one full inhale→exhale breath cycle on the banner (with live star
 * twinkling throughout), then leaves it rendered at full brightness.
 */
export async function printBanner(ascii: string): Promise<void> {
    const DURATION_MS = 1600;
    const FPS = 28;
    const INTERVAL = Math.round(1000 / FPS);
    const steps = Math.round(DURATION_MS / INTERVAL);
    const startTime = Date.now();

    await new Promise<void>((resolve) => {
        let step = 0;
        const timer = setInterval(() => {
            if (step > steps) {
                clearInterval(timer);
                // Final frame: guaranteed full brightness
                drawBanner(ascii, 1, (Date.now() - startTime) / 1000);
                resolve();
                return;
            }
            // Cosine curve: 1 → 0 → 1 (bright → dim → bright)
            const phase = 0.5 + 0.5 * Math.cos((step / steps) * 2 * Math.PI);
            const time  = (Date.now() - startTime) / 1000;
            drawBanner(ascii, phase, time);
            step++;
        }, INTERVAL);
    });
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
        await printBanner(ascii);

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
                //{ value: "telegram", label: "Telegram Gateway Interface" },
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