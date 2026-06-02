import { confirm, isCancel } from "@clack/prompts";
import chalk from "chalk";

function extractMessage(error: unknown): string {
    if (error instanceof Error) {
        const firstLine = error.message.split("\n")[0]?.trim();
        if (firstLine) return firstLine;
    }

    if (typeof error === "string" && error.trim()) {
        return error.trim();
    }

    return "The AI provider returned an error.";
}

export async function promptToRetryAiCall(
    context: string,
    error: unknown,
): Promise<boolean> {
    console.log(chalk.red(`\n${context}`));
    console.log(chalk.dim(extractMessage(error)));

    const retry = await confirm({
        message: "Try again?",
        initialValue: true,
    });

    return !isCancel(retry) && !!retry;
}
