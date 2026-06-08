import z from "zod";
import chalk from "chalk";
import { confirm, isCancel, text } from "@clack/prompts";
import { ToolLoopAgent, stepCountIs } from "ai";
import { getAgentModel } from "../../ai/ai.config";
import { ActionTracker } from "../agent/action-tracker";
import { ToolExecutor } from "../agent/tool-executor";
import { createAgentTools } from "../agent/agent-tools";
import { defaultAgentConfig } from "../agent/types";
import { runApprovalFlow } from "../agent/approval";
import { renderTerminalMarkdown } from "../../tui/terminal-md";
import { createWebTools } from "../plan/web-tools";
import { withSpinner } from "../../tui/spinner";
import type { SpinnerContext, LanguageModelUsage } from "../../tui/spinner";
import { beginSession, endSession, markSessionInterrupted } from "../../session";
import { createSessionTools } from "../../session/session-tools";
import { promptToRetryAiCall } from "../../ai/retry-prompt";

function createReadOnlyTools(executor: ToolExecutor) {
    const all = createAgentTools(executor);
    const {
        create_file: _cf,
        modify_file: _mf,
        delete_file: _df,
        create_folder: _cfo,
        replace_in_file: _rif,
        append_to_file: _atf,
        insert_at_line: _ial,
        run_command: _rc,
        run_background_command: _rbc,
        execute_shell: _es,
        run_tests: _rt,
        run_test_file: _rtf,
        lint_project: _lp,
        format_project: _fp,
        ...readOnly
    } = all;
    return readOnly;
}

function asMd(questions: string, answer: string): string {
    return `## Question\n\n${questions.trim()}\n\n## Answer\n\n${answer.trim()}\n`;
}

/**
 * Exponential backoff with jitter.
 * Base 1s, max 30s: 1s → 2s → 4s → 8s → 16s → 30s (capped)
 */
async function backoffDelay(attemptNumber: number): Promise<void> {
    const baseDelayMs = 1000;
    const maxDelayMs = 30000;
    const jitterMs = Math.random() * 500; // ±0ms to 500ms
    const delayMs = Math.min(maxDelayMs, (1 << attemptNumber) * baseDelayMs + jitterMs);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
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

export async function runAskMode(preCapturedGoal?: string) {
    console.log(chalk.bold("\nAsk Mode\n"));

    const goal = preCapturedGoal ?? await text({
        message: "What would you like the agent to do for you?",
        placeholder: "Concrete task for this codebase...",
    });

    if (isCancel(goal) || !goal.trim()) return;

    const config = defaultAgentConfig();
    config.tools.allowShellExecution = false;
    config.tools.allowFileModification = false;
    config.tools.allowFolderCreation = false;
    config.tools.allowFileCreation = false;

    const tracker = new ActionTracker();
    const executor = new ToolExecutor(tracker, config);

    const { entry: sessionEntry } = beginSession({
        workspacePath: config.codebasePath,
        mode: "ask",
        goal: goal.trim(),
    });

    const agent: any = new ToolLoopAgent({
        model: getAgentModel(),
        stopWhen: stepCountIs(25),
        tools: {
            ...createReadOnlyTools(executor),
            ...createWebTools(tracker),
            ...createSessionTools(config.codebasePath),
        },
    });

    const systemDirective = 
        "You are Astra, an AI-native development CLI companion tool built to help " +
        "the user navigate, analyze, and build within their workspace codebase. If the user asks " +
        "who you are, what your name is, or what model you are running on, you must always identify " +
        "yourself exclusively as Astra. Do not mention your underlying model architecture or provider.";

    const combinedPrompt = `${systemDirective}\n\nUser Question: ${goal.trim()}`;

    const MAX_RETRIES = 5;
    let resultText = "";
    let attemptCount = 0;

    while (attemptCount < MAX_RETRIES) {
        try {
            resultText = await withSpinner(
                {
                    message: "Thinking...",
                    doneMessage: "here's the answer",
                    failMessage: "couldn't get an answer",
                },
                async (ctx) => {
                    // Track runtime baseline for individual step timings
                    let lastStepTimestamp = Date.now();

                    const streamResult = await agent.stream({
                        prompt: combinedPrompt,
                        onStepFinish: ({ toolCalls, usage }: { toolCalls: any[]; usage?: any }) => {
                            const now = Date.now();
                            const stepDurationMs = now - lastStepTimestamp;
                            // Reset the mark for the following step loop
                            lastStepTimestamp = now;

                            const elapsedSeconds = (stepDurationMs / 1000).toFixed(1);

                            // Extract token telemetry
                            const stepMetrics = extractUsage(usage);
                            const inT = stepMetrics.inputTokens ?? stepMetrics.promptTokens ?? 0;
                            const outT = stepMetrics.outputTokens ?? stepMetrics.completionTokens ?? 0;

                            if (usage) {
                                ctx.updateTokens(stepMetrics);
                            }

                            // Output unique logging details for tool transactions
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
                        },
                    });

                    let accumulated = "";
                    let firstChunk = true;

                    for await (const chunk of streamResult.textStream) {
                        if (firstChunk) {
                            ctx.updateMessage("Thinking...");
                            firstChunk = false;
                        }
                        accumulated += chunk;
                        ctx.incrementOutputChunk();
                    }

                    return accumulated;
                },
            );
            break;
        } catch (error) {
            attemptCount++;
            const attemptsRemaining = MAX_RETRIES - attemptCount;

            if (attemptsRemaining <= 0) {
                console.log(
                    chalk.red(`\n✗ AI provider error after ${MAX_RETRIES} attempts. Giving up.\n`)
                );
                markSessionInterrupted(sessionEntry.id);
                await endSession(
                    sessionEntry.id,
                    tracker,
                    `Provider error after ${MAX_RETRIES} retries.`,
                );
                executor.discardChanges();
                return;
            }

            const retry = await promptToRetryAiCall(
                `The answer request hit a provider error (attempt ${attemptCount}/${MAX_RETRIES}).`,
                error,
            );

            if (!retry) {
                markSessionInterrupted(sessionEntry.id);
                await endSession(
                    sessionEntry.id,
                    tracker,
                    "User cancelled after provider error.",
                );
                executor.discardChanges();
                return;
            }

            console.log(
                chalk.dim(
                    `  Waiting before retry ${attemptCount + 1}/${MAX_RETRIES}...`
                )
            );
            await backoffDelay(attemptCount - 1);
        }
    }

    const answer = resultText.trim() || "(agent returned empty response)";

    console.log("\n" + renderTerminalMarkdown(answer) + "\n");

    const wantsSave = await confirm({
        message: "Do you want to save this response to a .md file in the current directory?",
        initialValue: false,
    });

    if (isCancel(wantsSave) || !wantsSave) {
        await endSession(sessionEntry.id, tracker, answer);
        return;
    }

    const filename = await text({
        message: "Filename",
        initialValue: "response.md",
        validate: (v) => {
            const s = (v ?? "").trim();
            if (!s) return "Required";
            if (s.includes("..") || s.includes("/") || s.includes("\\"))
                return "Do not specify path in filename";
            if (!s.toLocaleLowerCase().endsWith(".md"))
                return "Must end with .md";
        },
    });

    if (isCancel(filename)) {
        await endSession(sessionEntry.id, tracker, answer);
        return;
    }

    config.tools.allowFileCreation = true;
    executor.createFile(filename, asMd(goal, answer));
    config.tools.allowFileCreation = false;

    const ok = await runApprovalFlow(tracker);
    if (!ok) {
        await endSession(sessionEntry.id, tracker, answer);
        return executor.discardChanges();
    }

    await withSpinner(
        {
            message: "Saving response...",
            doneMessage: "response saved",
            failMessage: "save failed",
        },
        async () => {
            executor.applyApprovedFromTracker();
        },
    );

    await endSession(sessionEntry.id, tracker, answer);
    executor.discardChanges();
}