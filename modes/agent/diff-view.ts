import { createTwoFilesPatch } from "diff";
import chalk from "chalk";
import type { ActionLog } from "./types";

const MAX_DIFF_DISPLAY_LINES = 120;

export function formatPatch(filePath: string, before: string, after: string): string {
    const rawPatch = createTwoFilesPatch(filePath, filePath, before, after, "", "", { context: 3 });
    const lines = rawPatch.split("\n");
    
    if (lines.length > MAX_DIFF_DISPLAY_LINES) {
        const truncated = lines.slice(0, MAX_DIFF_DISPLAY_LINES);
        truncated.push(
            chalk.yellow(
                `\n[... Diff truncated for readability: total ${lines.length} lines. Use 'Review one by one' option to step through safely ...]`
            )
        );
        return truncated.join("\n");
    }
    
    return rawPatch;
}

export function composeBeforeAfter(sorted: ActionLog[]): {
    before: string;
    after: string;
} {
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    if (last.type === "file_delete") return { before: last.details.before ?? "", after: "" };
    const before = first.type === "file_create" ? "" : (first.details.before ?? "");
    const after = last.details.after ?? "";
    return { before, after };
}