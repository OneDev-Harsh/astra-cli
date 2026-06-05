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
import { beginSession, endSession, markSessionInterrupted } from "../../session";
import { createSessionTools } from "../../session/session-tools";
import { promptToRetryAiCall } from "../../ai/retry-prompt";

function stepPrompt(goal: string, step: PlanStep): string {
    return [`Goal: ${goal}`, `Step: ${step.title}`, step.description].join("\n");
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
            model: getAgentModel(),
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
                    () =>
                        agent.generate({
                            prompt: stepPrompt(plan.goal, step),
                            onStepFinish: ({ toolCalls }) => {
                                for (const tc of toolCalls) {
                                    const preview = JSON.stringify(tc.input).slice(0, 160);
                                    console.log(
                                        chalk.green("  *"),
                                        chalk.bold(String(tc.toolName)),
                                        chalk.dim(
                                            preview + (preview.length > 160 ? "..." : ""),
                                        ),
                                    );
                                }
                            },
                        }),
                );

                if (r.text.trim()) {
                    console.log(renderTerminalMarkdown(r.text));
                    lastResponse = r.text.trim();
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
