import { isCancel, text } from "@clack/prompts";
import chalk from "chalk";
import { defaultAgentConfig } from "./types";
import { ActionTracker } from "./action-tracker";
import { ToolExecutor } from "./tool-executor";
import { createAgentTools } from "./agent-tools";
import { stepCountIs, ToolLoopAgent } from "ai";
import { getAgentModel, withAiRetry, getRetryConfig } from "../../ai";
import { renderTerminalMarkdown } from "../../tui/terminal-md";
import { runApprovalFlow } from "./approval";
import { withSpinner } from "../../tui/spinner";
import type { SpinnerContext, LanguageModelUsage } from "../../tui/spinner";
import {
    beginSession,
    endSession,
    markSessionInterrupted,
    formatSessionLine,
    readSessionActions,
} from "../../session";
import { createSessionTools } from "../../session/session-tools";
import { promptToRetryAiCall } from "../../ai/retry-prompt";

/**
 * Safely extract token counts from an AI SDK usage object.
 * Handles both v3 (`promptTokens`/`completionTokens`) and v4
 * (`inputTokens`/`outputTokens`) schema shapes.
 */
function extractUsage(usage: unknown): LanguageModelUsage {
    const raw = usage as any;
    return {
        promptTokens:     raw?.promptTokens     ?? undefined,
        completionTokens: raw?.completionTokens ?? undefined,
        inputTokens:      raw?.inputTokens      ?? undefined,
        outputTokens:     raw?.outputTokens     ?? undefined,
    };
}

/**
 * Helper to generate descriptive text depending on the tool executed and its parameters.
 */
function getToolDetailsString(toolName: string, input: any): string {
    if (!input || typeof input !== "object") return "";

    const targetPath = input.path ?? input.filePath ?? input.filename ?? input.dirPath ?? input.folderPath;
    
    switch (toolName) {
        case "read_file":
            return targetPath ? `reading ${chalk.yellow(targetPath)}` : "";
        case "create_file":
            return targetPath ? `creating ${chalk.green(targetPath)}` : "";
        case "modify_file":
        case "replace_in_file":
        case "append_to_file":
        case "insert_at_line":
            return targetPath ? `modifying ${chalk.yellow(targetPath)}` : "";
        case "delete_file":
            return targetPath ? `deleting ${chalk.red(targetPath)}` : "";
        case "create_folder":
            return targetPath ? `creating directory ${chalk.green(targetPath)}` : "";
        case "run_command":
        case "run_background_command":
        case "execute_shell":
            return input.command ? `running ${chalk.magenta(`"${input.command}"`)}` : "";
        case "run_test_file":
            return targetPath ? `testing ${chalk.cyan(targetPath)}` : "";
        case "session_search":
        case "web_search":
            return input.query ? `searching for ${chalk.italic(`"${input.query}"`)}` : "";
        case "fetch_url":
            return input.url ? `fetching ${chalk.underline.dim(input.url)}` : "";
        default:
            if (targetPath) return `target: ${targetPath}`;
            if (input.query) return `query: "${input.query}"`;
            if (input.command) return `cmd: "${input.command}"`;
            return "";
    }
}

/**
 * Build the onStepFinish callback that pipes token telemetry
 * into the spinner context and routes tool-call visibility
 * through ctx.updateMessage() instead of console.log().
 */
function createStepFinishHandler(ctx: SpinnerContext, state: { lastStepTimestamp: number }) {
    return ({ toolCalls, usage }: { toolCalls: any[]; usage?: any }) => {
        const now = Date.now();
        const stepDurationMs = now - state.lastStepTimestamp;
        state.lastStepTimestamp = now; // Shift mark for next step timing boundary

        const elapsedSeconds = (stepDurationMs / 1000).toFixed(1);

        // ── Token telemetry reconciliation ────────────────────────
        const stepMetrics = extractUsage(usage);
        const inT = stepMetrics.inputTokens ?? stepMetrics.promptTokens ?? 0;
        const outT = stepMetrics.outputTokens ?? stepMetrics.completionTokens ?? 0;

        if (usage) {
            ctx.updateTokens(stepMetrics);
        }

        // ── DETAILED STEP LOGGING ─────────────────────────────────
        if (toolCalls && toolCalls.length > 0) {
            for (const tool of toolCalls) {
                const detailedInfo = getToolDetailsString(tool.toolName, tool.input);
                const separator = detailedInfo ? " — " : "";

                ctx.logStep(
                    `  ${chalk.blue("➔")} ${chalk.dim("Executed:")} ` +
                    `${chalk.cyan.bold(tool.toolName)}` +
                    `${separator}${detailedInfo} ` +
                    `${chalk.gray(`(${elapsedSeconds}s · ↑${inT} ↓${outT} tokens)`)}`
                );
            }
        }
    };
}

/**
 * Execute a streaming agent call, consuming textStream and
 * piping live chunk telemetry into the spinner context.
 */
async function streamAgentCall(
    agent: any,
    prompt: string,
    ctx: SpinnerContext,
): Promise<string> {
    // Shared state reference object allows callback closure to monitor and shift baseline timers 
    const stepTimingState = { lastStepTimestamp: Date.now() };

    const streamResult = await agent.stream({
        prompt,
        onStepFinish: createStepFinishHandler(ctx, stepTimingState),
    });

    let accumulated = "";
    let firstChunk = true;

    for await (const chunk of streamResult.textStream) {
        if (firstChunk) {
            ctx.updateMessage("Working...");
            firstChunk = false;
        }
        accumulated += chunk;
        ctx.incrementOutputChunk();
    }

    return accumulated;
}

export async function runAgentMode(preCapturedGoal?: string) {
    console.log(chalk.bold("\n   Agent mode\n"));

    const goal = preCapturedGoal ?? await text({
        message: "What would you like the agent to do for you?",
        placeholder: "Concrete task for this codebase...",
    });

    if (isCancel(goal) || !goal.trim()) return;

    const config = defaultAgentConfig();
    const tracker = new ActionTracker();
    const executor = new ToolExecutor(tracker, config);

    const approveCreatedFile = async (filePath: string): Promise<string> => {
        const ok = await runApprovalFlow(tracker, {
            paths: [filePath],
            skipBatchPrompt: true,
        });

        if (!ok) {
            executor.discardStagedPath(filePath);
            return `User rejected creating ${filePath}. Do not modify or rely on this file unless you recreate it later.`;
        }

        const { errors } = executor.applyApprovedFromTracker();
        if (errors.length) {
            executor.discardStagedPath(filePath);
            throw new Error(
                `Failed to apply approved file ${filePath}: ${errors.join("; ")}`,
            );
        }

        return `Created and applied ${filePath} after user approval.`;
    };

    const resumeId = (globalThis as any).__ASTRA_RESUME_SESSION__ as
        | string
        | undefined;
    if (resumeId) delete (globalThis as any).__ASTRA_RESUME_SESSION__;

    const { entry: sessionEntry, contextSummary } = beginSession({
        workspacePath: config.codebasePath,
        mode: "agent",
        goal: goal.trim(),
        resumeSessionId: resumeId,
    });

    if (resumeId) {
        console.log(chalk.dim("\n   Resuming previous session transaction history...\n"));
        const historicActions = readSessionActions(resumeId);
        if (historicActions.length > 0) {
            executor.hydrateFromActions(historicActions);
        }
    }

    const tools = {
        ...createAgentTools(executor, {
            afterCreateFile: approveCreatedFile,
        }),
        ...createSessionTools(config.codebasePath),
    };

    const instructions = contextSummary
        ? [
              contextSummary,
              `Workspace root: ${config.codebasePath}`,
              "All mutations are staged until approval.",
              "You have access to historical state updates loaded in the overlay loop.",
          ].join("\n")
        : [
              `Workspace root: ${config.codebasePath}`,
              "All mutations are staged until approval.",
          ].join("\n");

    const agent = new ToolLoopAgent({
        model: await getAgentModel(),
        stopWhen: stepCountIs(50),
        instructions,
        tools,
    });

    let resultText = "";
    const retryConfig = getRetryConfig();

    try {
        resultText = await withAiRetry(
            () =>
                withSpinner(
                    {
                        message: "Agent is working on your task...",
                        doneMessage: "done",
                        failMessage: "something went wrong",
                    },
                    (ctx) => streamAgentCall(agent, goal.trim(), ctx),
                ),
            "The agent hit a provider error.",
            {
                enabled: retryConfig.enabled,
                retryConfig: {
                    maxRetries: retryConfig.maxRetries,
                    baseDelayMs: 1000,
                    maxDelayMs: 30000,
                    backoffMultiplier: 2,
                    jitter: true,
                    maxJitterMs: 1000,
                    version: 1,
                } as any,
                showProgress: retryConfig.showProgress,
                askBeforeRetry: false,
            },
        );
    } catch (error) {
        const manualRetry = await promptToRetryAiCall(
            "Automatic retries exhausted. Would you like to try once more?",
            error,
        );

        if (manualRetry) {
            try {
                resultText = await withSpinner(
                    {
                        message: "Agent is working on your task...",
                        doneMessage: "done",
                        failMessage: "something went wrong",
                    },
                    (ctx) => streamAgentCall(agent, goal.trim(), ctx),
                );
            } catch (finalError) {
                markSessionInterrupted(sessionEntry.id);
                await endSession(
                    sessionEntry.id,
                    tracker,
                    "Stopped after final manual retry failed.",
                );
                executor.discardChanges();
                return;
            }
        } else {
            markSessionInterrupted(sessionEntry.id);
            await endSession(
                sessionEntry.id,
                tracker,
                "Stopped after AI provider error (all retries exhausted).",
            );
            executor.discardChanges();
            return;
        }
    }

    if (resultText.trim()) console.log(renderTerminalMarkdown(resultText));

    const ok = await runApprovalFlow(tracker);
    if (!ok) {
        await endSession(sessionEntry.id, tracker, resultText || "(no response)");
        executor.discardChanges();
        return;
    }

    await withSpinner(
        {
            message: "Applying approved changes...",
            doneMessage: "all changes applied",
            failMessage: "some operations failed",
        },
        async () => {
            const { errors } = executor.applyApprovedFromTracker();
            if (errors.length) {
                console.log(chalk.red("\nSome operations reported errors:\n"));
                for (const e of errors) {
                    console.log(chalk.red(`   - ${e}`));
                }
            } else {
                console.log(chalk.green("\nApplied.\n"));
            }
        },
    );

    await endSession(sessionEntry.id, tracker, resultText || "(no response)");
    executor.discardChanges();
}