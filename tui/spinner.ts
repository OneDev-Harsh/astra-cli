import { spinner as clackSpinner } from "@clack/prompts";
import chalk from "chalk";

export interface SpinnerOptions {
    /** Shown while the task is running */
    message: string;
    /** Shown briefly when the task completes (auto-appended as a dim suffix) */
    doneMessage?: string;
    /** Shown briefly when the task fails (auto-appended as a red ✘ suffix) */
    failMessage?: string;
}

/**
 * Run `task` while showing a clack spinner. Returns the task result.
 * On rejection the spinner is stopped with an error indicator and the
 * original error is re-thrown so the caller can still handle it.
 */
export async function withSpinner<T>(
    opts: SpinnerOptions,
    task: () => Promise<T>,
): Promise<T> {
    const s = clackSpinner();
    s.start(opts.message);

    try {
        const result = await task();
        const done = opts.doneMessage
            ? `${opts.message} ${chalk.dim(`— ${opts.doneMessage}`)}`
            : opts.message;
        s.stop(done);
        return result;
    } catch (e) {
        const fail = opts.failMessage
            ? `${opts.message} ${chalk.red(`✘ ${opts.failMessage}`)}`
            : `${opts.message} ${chalk.red("✘ failed")}`;
        s.stop(fail);
        throw e;
    }
}
