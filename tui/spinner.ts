import chalk from "chalk";

// ── Beautiful spinner frames ──────────────────────────────────────────────
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_INTERVAL = 80; // ms between frames

// ── Colour palette ────────────────────────────────────────────────────────
const C = {
    primary: chalk.hex("#a78bfa"),    // soft violet
    dim: chalk.hex("#6b7280"),        // grey-500
    success: chalk.hex("#34d399"),    // emerald-400
    error: chalk.hex("#f87171"),      // red-400
    time: chalk.hex("#fbbf24"),       // amber-400
};

// ── Helpers ───────────────────────────────────────────────────────────────
function formatElapsed(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
    if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
    return `${s}s`;
}

// ── Types ─────────────────────────────────────────────────────────────────
export interface SpinnerOptions {
    /** Shown while the task is running */
    message: string;
    /** Shown briefly when the task completes */
    doneMessage?: string;
    /** Shown briefly when the task fails */
    failMessage?: string;
    /** Hide the elapsed time (default: false) */
    hideTime?: boolean;
}

// ── Core spinner ──────────────────────────────────────────────────────────
class Spinner {
    private timer: ReturnType<typeof setInterval> | null = null;
    private frameIndex = 0;
    private startTime = 0;
    private readonly message: string;
    private readonly showTime: boolean;

    constructor(message: string, showTime = true) {
        this.message = message;
        this.showTime = showTime;
    }

    /** Elapsed milliseconds since the spinner started */
    get elapsed(): number {
        return Date.now() - this.startTime;
    }

    start(): void {
        this.startTime = Date.now();
        this.frameIndex = 0;
        this.render();
        this.timer = setInterval(() => this.render(), FRAME_INTERVAL);
    }

    private render(): void {
        const frame = FRAMES[this.frameIndex % FRAMES.length];
        const elapsed = this.showTime
            ? ` ${C.dim("(")}${C.time(formatElapsed(this.elapsed))}${C.dim(")")}`
            : "";
        const line = `${C.primary(frame)} ${this.message}${elapsed}`;

        // Clear line and write
        process.stdout.write(`\r${" ".repeat(120)}\r${line}`);

        this.frameIndex++;
    }

    stop(finalLine: string): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        process.stdout.write(`\r${" ".repeat(120)}\r${finalLine}\n`);
    }
}

// ── Public API ────────────────────────────────────────────────────────────
/**
 * Run `task` while showing a beautiful animated spinner with elapsed time.
 * Returns the task result.
 * On rejection the spinner is stopped with an error indicator and the
 * original error is re-thrown so the caller can still handle it.
 */
export async function withSpinner<T>(
    opts: SpinnerOptions,
    task: () => Promise<T>,
): Promise<T> {
    const spinner = new Spinner(opts.message, !opts.hideTime);
    spinner.start();

    try {
        const result = await task();
        const elapsed = formatElapsed(spinner.elapsed);
        const done = opts.doneMessage
            ? `${C.success("✔")} ${opts.message} ${C.dim(`— ${opts.doneMessage}`)} ${C.dim(`(${elapsed})`)}`
            : `${C.success("✔")} ${opts.message} ${C.dim(`(${elapsed})`)}`;
        spinner.stop(done);
        return result;
    } catch (e) {
        const elapsed = formatElapsed(spinner.elapsed);
        const fail = opts.failMessage
            ? `${C.error("✘")} ${opts.message} ${C.dim(`— ${opts.failMessage}`)} ${C.dim(`(${elapsed})`)}`
            : `${C.error("✘")} ${opts.message} ${C.dim(`— failed (${elapsed})`)}`;
        spinner.stop(fail);
        throw e;
    }
}
