import chalk from "chalk";

// ── Biological Neuro-States ───────────────────────────────────────────────
const METABOLIC_RATES = {
    HYPER: 45,   // Rapid heart rate for immediate tasks
    STEADY: 75,  // Cruising breath rhythm
    STRESSED: 110, // Fast, irregular twitching
    HIBERNATE: 180 // Deep, slow dynamic sighing
};

// Shifting structural shapes based on kinetic mood
const MOODS = {
    PULSE:   ["⬖", "⬘", "⬗", "⬙"],
    CRAWL:   ["•««««", "»•«««", "»»•««", "»»»•«", "»»»»•", "»»»•«", "»»•««", "»•«««"],
    TWITCH:  ["⤜•⤛  ", " ⤜•⤛ ", "  ⤜•⤛", " ⤜•⤛ "],
    SIGH:    ["⦾🪶   ", " ⦾🪶  ", "  ⦾🪶 ", "   ⦾🪶", "  ⦾🪶 ", " ⦾🪶  "]
};

const C = {
    // Dynamic color gradient engine mappings
    vitality: (pct: number) => {
        // Blends from energetic Violet/Cyan to a stressed Crimson Magenta as fatigue mounts
        if (pct < 0.4) return chalk.bold.hex("#a78bfa"); // Calm Lavender
        if (pct < 0.7) return chalk.bold.hex("#38bdf8"); // Processing Cyan
        if (pct < 0.9) return chalk.bold.hex("#fb7185"); // Agitated Rose
        return chalk.bold.hex("#f43f5e");               // High-Panic Crimson
    },
    text: chalk.hex("#f3f4f6"),
    dim: chalk.hex("#4b5563"),
    success: chalk.bold.hex("#34d399"),
    error: chalk.bold.hex("#ef4444"),
    telemetry: chalk.hex("#60a5fa")
};

function formatElapsed(ms: number): string {
    const s = Math.floor(ms / 1000);
    const dec = Math.floor((ms % 1000) / 100);
    return `${s}.${dec}s`;
}

export interface SpinnerContext {
    updateMessage: (msg: string) => void;
    updateMetric: (metric: string) => void;
}

export interface SpinnerOptions {
    message: string;
    doneMessage?: string;
    failMessage?: string;
    hideTime?: boolean;
}

// ── The Autonomous Organism Engine ────────────────────────────────────────
class AutonomousLoader {
    private timer: ReturnType<typeof setInterval> | null = null;
    private currentInterval = METABOLIC_RATES.STEADY;
    private tickCount = 0;
    private startTime = 0;
    private message: string;
    private metric = "";
    private readonly showTime: boolean;

    constructor(message: string, showTime = true) {
        this.message = message;
        this.showTime = showTime;
    }

    get elapsed(): number {
        return Date.now() - this.startTime;
    }

    public updateMessage(msg: string) {
        this.message = msg;
    }

    public updateMetric(metric: string) {
        this.metric = metric;
    }

    start(): void {
        this.startTime = Date.now();
        this.tickCount = 0;
        process.stdout.write("\u001B[?25l"); // Clean interface focus mode
        this.loop();
    }

    private loop(): void {
        this.render();
        this.tickCount++;

        // Calculate a physiological "fatigue index" from 0.0 to 1.0 (Caps at 12 seconds)
        const fatigue = Math.min(this.elapsed / 12000, 1.0);
        
        // The heart rate dynamically mutates based on the current system load
        let targetInterval = METABOLIC_RATES.STEADY;
        if (fatigue < 0.15) targetInterval = METABOLIC_RATES.HYPER;
        else if (fatigue > 0.8) targetInterval = METABOLIC_RATES.HIBERNATE;
        else if (fatigue > 0.5) targetInterval = METABOLIC_RATES.STRESSED;

        // Smooth metabolic shifting to avoid jagged frame skips
        this.currentInterval = Math.round(this.currentInterval * 0.7 + targetInterval * 0.3);
        
        this.timer = setTimeout(() => this.loop(), this.currentInterval);
    }

    private render(): void {
        const ms = this.elapsed;
        const fatigue = Math.min(ms / 12000, 1.0);

        let shape = "";
        
        // Morph structural behavior profiles cleanly
        if (fatigue > 0.8) {
            shape = MOODS.SIGH[Math.floor(this.tickCount / 2) % MOODS.SIGH.length] ?? "";
        } else if (fatigue > 0.5) {
            shape = MOODS.TWITCH[this.tickCount % MOODS.TWITCH.length] ?? "";
        } else if (fatigue > 0.15) {
            shape = MOODS.CRAWL[this.tickCount % MOODS.CRAWL.length] ?? "";
        } else {
            // Heartbeat ambient pulse for immediate executions
            shape = MOODS.PULSE[this.tickCount % MOODS.PULSE.length] ?? "";
        }

        const telemetry = this.metric ? ` ${C.dim("➔")} ${C.telemetry(this.metric)}` : "";
        const ageIndicator = this.showTime ? ` ${C.dim(`[${formatElapsed(ms)}]`)}` : "";

        // Build composite biological visual output
        const coreNode = C.vitality(fatigue)(shape);
        const line = `  ${coreNode}  ${C.text(this.message)}${telemetry}${ageIndicator}`;

        const cols = process.stdout.columns || 80;
        process.stdout.write(`\r${"\u001B[K"}${line.slice(0, cols - 1)}`);
    }

    stop(finalLine: string): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        process.stdout.write(`\r${"\u001B[K"}${finalLine}\n\u001B[?25h`);
    }
}

// ── Public API Orchestration ────────────────────────────────────────────
export async function withSpinner<T>(
    opts: SpinnerOptions,
    task: (ctx: SpinnerContext) => Promise<T>,
): Promise<T> {
    const loader = new AutonomousLoader(opts.message, !opts.hideTime);
    loader.start();

    const ctx: SpinnerContext = {
        updateMessage: (msg) => loader.updateMessage(msg),
        updateMetric: (metric) => loader.updateMetric(metric),
    };

    try {
        const result = await task(ctx);
        const totalTime = loader.elapsed;
        const elapsedStr = formatElapsed(totalTime);
        
        // Celebratory reactive state: entity expresses joy/relief depending on runtime friction
        let endingIcon = "🌱";
        if (totalTime < 800) endingIcon = "⚡"; 
        else if (totalTime > 6000) endingIcon = "🧘";

        const done = opts.doneMessage
            ? ` ${endingIcon} ${C.success("●")} ${C.text(opts.message)} ${C.dim(`— ${opts.doneMessage}`)} ${C.dim(`(${elapsedStr})`)}`
            : ` ${endingIcon} ${C.success("●")} ${C.text(opts.message)} ${C.dim(`(${elapsedStr})`)}`;
            
        loader.stop(done);
        return result;
    } catch (e) {
        const elapsedStr = formatElapsed(loader.elapsed);
        const fail = opts.failMessage
            ? ` 🌋 ${C.error("✘")} ${C.text(opts.message)} ${C.dim(`— ${opts.failMessage}`)} ${C.dim(`(${elapsedStr})`)}`
            : ` 🌋 ${C.error("✘")} ${C.text(opts.message)} ${C.dim(`— system rupture (${elapsedStr})`)}`;
            
        loader.stop(fail);
        throw e;
    }
}