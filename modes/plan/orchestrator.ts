import { text, isCancel, confirm } from "@clack/prompts";
import chalk from "chalk";
import { generatePlan } from "./planner";
import { printPlan, selectSteps } from "./selection";
import { defaultAgentConfig } from "../agent/types";
import { ActionTracker } from "../agent/action-tracker";
import { ToolExecutor } from "../agent/tool-executor";
import { createAgentTools } from "../agent/agent-tools";
import { stepCountIs, ToolLoopAgent } from "ai";
import { getAgentModel } from "../../ai";
import type { PlanStep } from "./types";
import { renderTerminalMarkdown } from "../../tui/terminal-md";
import { runApprovalFlow } from "../agent/approval";
import { createWebTools } from "./web-tools";
import { withSpinner } from "../../tui/spinner";
import type { SpinnerContext, LanguageModelUsage } from "../../tui/spinner";
import { beginSession, endSession, markSessionInterrupted } from "../../session";
import { createSessionTools } from "../../session/session-tools";
import { promptToRetryAiCall } from "../../ai/retry-prompt";

function stepPrompt(goal: string, step: PlanStep): string {
    return [`Goal: ${goal}`, `Step: ${step.title}`, step.description].join("\n");
}

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
        state.lastStepTimestamp = now;

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
    const stepTimingState = { lastStepTimestamp: Date.now() };

    const streamResult = await agent.stream({
        prompt,
        onStepFinish: createStepFinishHandler(ctx, stepTimingState),
    });

    let accumulated = "";
    let firstChunk = true;

    for await (const chunk of streamResult.textStream) {
        if (firstChunk) {
            ctx.updateMessage("Planning...");
            firstChunk = false;
        }
        accumulated += chunk;
        ctx.incrementOutputChunk();
    }

    return accumulated;
}

export async function runPlanMode(preCapturedGoal?: string): Promise<void> {
    console.log(chalk.bold("\nPlan Mode\n"));

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

    const { entry: sessionEntry } = beginSession({
        workspacePath: config.codebasePath,
        mode: "plan",
        goal: goal.trim(),
    });

    let plan;
    while (true) {
        try {
            plan = await generatePlan(goal);
            break;
        } catch (error) {
            const retry = await promptToRetryAiCall(
                "Plan generation hit a provider error.",
                error,
            );
            if (retry) continue;
            markSessionInterrupted(sessionEntry.id);
            await endSession(sessionEntry.id, tracker, "Stopped while generating a plan.");
            executor.discardChanges();
            return;
        }
    }

    printPlan(plan);

    const selected = await selectSteps(plan);
    if (selected.length === 0) return;

    const proceed = await confirm({
        message: `Execute ${selected.length} step(s)`,
        initialValue: true,
    });

    if (isCancel(proceed) || !proceed) return;

    const tools = {
        ...createAgentTools(executor, {
            afterCreateFile: approveCreatedFile,
        }),
        ...createWebTools(tracker),
        ...createSessionTools(config.codebasePath),
    };

    let lastResponse = "";
    for (const step of selected) {
        console.log(chalk.bold(`\nStep: ${step.title}\n`));

        const agent = new ToolLoopAgent({
            model: await getAgentModel(),
            stopWhen: stepCountIs(50),
            tools,
        });

        while (true) {
            try {
                const r = await withSpinner(
                    {
                        message: `Executing: ${step.title}`,
                        doneMessage: "done",
                        failMessage: "failed",
                    },
                    (ctx) => streamAgentCall(agent, stepPrompt(plan.goal, step), ctx),
                );

                if (r.trim()) {
                    console.log(renderTerminalMarkdown(r));
                    lastResponse = r.trim();
                }
                break;
            } catch (error) {
                const retry = await promptToRetryAiCall(
                    `Step "${step.title}" hit a provider error.`,
                    error,
                );
                if (retry) continue;
                markSessionInterrupted(sessionEntry.id);
                await endSession(
                    sessionEntry.id,
                    tracker,
                    `Stopped during step: ${step.title}`,
                );
                executor.discardChanges();
                return;
            }
        }
    }

    const ok = await runApprovalFlow(tracker);

    if (!ok) {
        await endSession(
            sessionEntry.id,
            tracker,
            lastResponse || "Plan execution cancelled",
        );
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
                for (const e of errors) console.log(chalk.red(`  - ${e}`));
            } else {
                console.log(chalk.green("\nApplied.\n"));
            }
        },
    );

    await endSession(
        sessionEntry.id,
        tracker,
        lastResponse || "Plan executed with " + selected.length + " step(s).",
    );
    executor.discardChanges();
}