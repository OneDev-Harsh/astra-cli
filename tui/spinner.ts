import chalk from "chalk";

// ── Biological Neuro-States ───────────────────────────────────────────────
const METABOLIC_RATES = {
    HYPER: 45,   
    STEADY: 75,  
    STRESSED: 110, 
    HIBERNATE: 180 
};

const MOODS = {
    PULSE:   ["⬖", "⬘", "⬗", "⬙"],
    CRAWL:   ["•««««", "»•«««", "»»•««", "»»»•«", "»»»»•", "»»»•«", "»»•««", "»•«««"],
    TWITCH:  ["⤜•⤛  ", " ⤜•⤛ ", "  ⤜•⤛", " ⤜•⤛ "],
    SIGH:    ["⦾🪶   ", " ⦾🪶  ", "  ⦾🪶 ", "   ⦾🪶", "  ⦾🪶 ", " ⦾🪶  "]
};

const C = {
    vitality: (pct: number) => {
        if (pct < 0.4) return chalk.bold.hex("#a78bfa"); 
        if (pct < 0.7) return chalk.bold.hex("#38bdf8"); 
        if (pct < 0.9) return chalk.bold.hex("#fb7185"); 
        return chalk.bold.hex("#f43f5e");               
    },
    text: chalk.hex("#f3f4f6"),
    dim: chalk.hex("#4b5563"),
    success: chalk.bold.hex("#34d399"),
    error: chalk.bold.hex("#ef4444"),
    telemetry: chalk.hex("#60a5fa"),
    streamActive: chalk.bold.hex("#4ade80"),   
    streamBullet: chalk.hex("#22c55e"),        
};

function formatElapsed(ms: number): string {
    const s = Math.floor(ms / 1000);
    const dec = Math.floor((ms % 1000) / 100);
    return `${s}.${dec}s`;
}

export interface TokenState {
    inputConfirmed: number;
    outputConfirmed: number;
    liveChunks: number;
    streaming: boolean;
}

const INITIAL_TOKEN_STATE: TokenState = Object.freeze({
    inputConfirmed: 0,
    outputConfirmed: 0,
    liveChunks: 0,
    streaming: false,
});

export interface LanguageModelUsage {
    promptTokens?: number;
    completionTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
}

export interface SpinnerContext {
    updateMessage: (msg: string) => void;
    updateMetric: (metric: string) => void;
    incrementOutputChunk: () => void;
    writeStreamChunk: (chunk: string) => void; 
    updateTokens: (usage: LanguageModelUsage) => void;
    logStep: (text: string) => void;
}

export interface SpinnerOptions {
    message: string;
    doneMessage?: string;
    failMessage?: string;
    hideTime?: boolean;
}

class AutonomousLoader {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private currentInterval = METABOLIC_RATES.STEADY;
    private tickCount = 0;
    private startTime = 0;
    private message: string;
    private metric = "";
    private readonly showTime: boolean;
    private tokenState: TokenState = { ...INITIAL_TOKEN_STATE };

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

    public incrementOutputChunk() {
        this.tokenState.liveChunks++;
        this.tokenState.streaming = true;
    }

    public writeStreamChunk(chunk: string) {
        if (!chunk) return;
        
        if (!this.tokenState.streaming) {
            // First token packet has dropped! Clear active spinner row cleanly
            process.stdout.write("\r\u001B[K");
            this.tokenState.streaming = true;
        }
        
        // Clear the projected spinner row down below before writing the next raw text chunk
        process.stdout.write("\u001B[s\n\r\u001B[K\u001B[u");
        
        process.stdout.write(chunk);
        this.tokenState.liveChunks++;
        
        // Push an instant fluid render layout update
        this.render();
    }

    public logStep(text: string) {
        if (this.tokenState.streaming) {
            // Clear the projected spinner down below cleanly
            process.stdout.write("\u001B[s\n\r\u001B[K\u001B[u");
            // Push an intentional newline shift to cleanly separate from the text stream sequence block
            process.stdout.write("\n");
            this.tokenState.streaming = false;
            this.tokenState.liveChunks = 0;
        }
        process.stdout.write(`\r\u001B[K${text}\n`);
    }

    public updateTokens(usage: LanguageModelUsage) {
        const raw = usage as any;
        const inTokens  = raw.inputTokens   ?? raw.promptTokens     ?? 0;
        const outTokens = raw.outputTokens   ?? raw.completionTokens ?? 0;

        this.tokenState.inputConfirmed  += inTokens;
        this.tokenState.outputConfirmed += outTokens;

        this.tokenState.liveChunks = 0;
        // Adjusted: Do not force streaming to false here; leave state teardown to logStep transitions
    }

    public getTokenSnapshot(): Readonly<TokenState> {
        return { ...this.tokenState };
    }

    start(): void {
        this.startTime = Date.now();
        this.tickCount = 0;
        this.tokenState = { ...INITIAL_TOKEN_STATE };
        process.stdout.write("\u001B[?25l"); 
        this.loop();
    }

    private loop(): void {
        this.render();
        this.tickCount++;

        const fatigue = Math.min(this.elapsed / 12000, 1.0);
        
        let targetInterval = METABOLIC_RATES.STEADY;
        if (fatigue < 0.15) targetInterval = METABOLIC_RATES.HYPER;
        else if (fatigue > 0.8) targetInterval = METABOLIC_RATES.HIBERNATE;
        else if (fatigue > 0.5) targetInterval = METABOLIC_RATES.STRESSED;

        this.currentInterval = Math.round(this.currentInterval * 0.7 + targetInterval * 0.3);
        this.timer = setTimeout(() => this.loop(), this.currentInterval);
    }

    private render(): void {
        const ms = this.elapsed;
        const fatigue = Math.min(ms / 12000, 1.0);
        let shape = "";
        
        if (fatigue > 0.8) {
            shape = MOODS.SIGH[Math.floor(this.tickCount / 2) % MOODS.SIGH.length] ?? "";
        } else if (fatigue > 0.5) {
            shape = MOODS.TWITCH[this.tickCount % MOODS.TWITCH.length] ?? "";
        } else if (fatigue > 0.15) {
            shape = MOODS.CRAWL[this.tickCount % MOODS.CRAWL.length] ?? "";
        } else {
            shape = MOODS.PULSE[this.tickCount % MOODS.PULSE.length] ?? "";
        }

        const ts = this.tokenState;
        const effectiveOutput = ts.outputConfirmed + ts.liveChunks;

        let tokenDisplay = "";
        if (ts.inputConfirmed > 0 || effectiveOutput > 0) {
            const inPart = C.dim(`↑${ts.inputConfirmed}`);
            let outPart: string;
            if (ts.streaming) {
                const bullet = this.tickCount % 2 === 0 ? C.streamBullet("●") : " ";
                outPart = C.streamActive(`↓${effectiveOutput}`) + " " + bullet;
            } else {
                outPart = C.dim(`↓${effectiveOutput}`);
            }
            tokenDisplay = ` ${C.dim("·")} ${inPart} ${outPart} ${C.dim("tokens")}`;
        }

        const telemetry = this.metric ? ` ${C.dim("➔")} ${C.telemetry(this.metric)}` : "";
        const ageIndicator = this.showTime ? ` ${C.dim(`[${formatElapsed(ms)}]`)}` : "";

        const coreNode = C.vitality(fatigue)(shape);
        const line = `  ${coreNode}  ${C.text(this.message)}${tokenDisplay}${telemetry}${ageIndicator}`;

        const cols = process.stdout.columns || 80;
        const truncatedLine = line.slice(0, cols - 1);

        if (this.tokenState.streaming) {
            // Project the live breathing spinner seamlessly exactly 1 line under the streaming output cursor position
            process.stdout.write(`\u001B[s\n\r\u001B[K${truncatedLine}\u001B[u`);
        } else {
            // Standard flush on the current active row line
            process.stdout.write(`\r\u001B[K${truncatedLine}`);
        }
    }

    stop(finalLine: string): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.tokenState.streaming) {
            process.stdout.write("\u001B[s\n\r\u001B[K\u001B[u");
            process.stdout.write("\n");
            this.tokenState.streaming = false;
        }
        process.stdout.write(`\r${"\u001B[K"}${finalLine}\n\u001B[?25h`);
    }
}

export async function withSpinner<T>(
    opts: SpinnerOptions,
    task: (ctx: SpinnerContext) => Promise<T>,
): Promise<T> {
    const loader = new AutonomousLoader(opts.message, !opts.hideTime);
    loader.start();

    const ctx: SpinnerContext = {
        updateMessage: (msg) => loader.updateMessage(msg),
        updateMetric: (metric) => loader.updateMetric(metric),
        incrementOutputChunk: () => loader.incrementOutputChunk(),
        writeStreamChunk: (chunk) => loader.writeStreamChunk(chunk), 
        updateTokens: (usage) => loader.updateTokens(usage),
        logStep: (text) => loader.logStep(text)
    };

    try {
        const result = await task(ctx);
        const totalTime = loader.elapsed;
        const elapsedStr = formatElapsed(totalTime);
        const tokens = loader.getTokenSnapshot();
        
        if (tokens.inputConfirmed > 0 || tokens.outputConfirmed > 0) {
            const totalInOut = tokens.inputConfirmed + tokens.outputConfirmed;
            const seconds = totalTime / 1000;
            const velocity = seconds > 0 ? Math.round(totalInOut / seconds) : 0;

            const summaryLine =
                `    ${C.dim("·")} ` +
                `${C.dim("↑")}${C.telemetry(String(tokens.inputConfirmed))} ` +
                `${C.dim("↓")}${C.telemetry(String(tokens.outputConfirmed))} ` +
                `${C.dim("tokens")}  ` +
                `${C.dim("·")} ` +
                `⚡${C.success(String(velocity))} ${C.dim("tok/s")}`;

            process.stdout.write(`\r${"\u001B[K"}${summaryLine}\n`);
        }

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