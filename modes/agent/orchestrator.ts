import { isCancel, text } from "@clack/prompts";
import chalk from "chalk";
import { defaultAgentConfig } from "./types";
import { ActionTracker } from "./action-tracker";
import { ToolExecutor } from "./tool-executor";
import { createAgentTools } from "./agent-tools";
import { stepCountIs, ToolLoopAgent } from "ai";
import { getAgentModel } from "../../ai";
import { renderTerminalMarkdown } from "../../tui/terminal-md";
import { runApprovalFlow } from "./approval";
import { withSpinner } from "../../tui/spinner";
import {
    beginSession,
    endSession,
    markSessionInterrupted,
    formatSessionLine,
} from "../../session";
import { createSessionTools } from "../../session/session-tools";
import { promptToRetryAiCall } from "../../ai/retry-prompt";

export async function runAgentMode() {
    console.log(chalk.bold("\n  Agent mode\n"));

    const goal = await text({
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

    if (contextSummary) {
        console.log(chalk.dim("\n  Resuming previous session context.\n"));
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
          ].join("\n")
        : [
              `Workspace root: ${config.codebasePath}`,
              "All mutations are staged until approval.",
          ].join("\n");

    const agent = new ToolLoopAgent({
        model: getAgentModel(),
        stopWhen: stepCountIs(50),
        instructions,
        tools,
    });

    let result;
    while (true) {
        try {
            result = await withSpinner(
                {
                    message: "Agent is working on your task...",
                    doneMessage: "done",
                    failMessage: "something went wrong",
                },
                () =>
                    agent.generate({
                        prompt: goal.trim(),
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
            break;
        } catch (error) {
            const retry = await promptToRetryAiCall(
                "The agent hit a provider error.",
                error,
            );
            if (retry) continue;
            markSessionInterrupted(sessionEntry.id);
            await endSession(
                sessionEntry.id,
                tracker,
                "Stopped after AI provider error.",
            );
            executor.discardChanges();
            return;
        }
    }

    if (result.text.trim()) console.log(renderTerminalMarkdown(result.text));

    const ok = await runApprovalFlow(tracker);
    if (!ok) {
        await endSession(sessionEntry.id, tracker, result.text || "(no response)");
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
                    console.log(chalk.red(`  - ${e}`));
                }
            } else {
                console.log(chalk.green("\nApplied.\n"));
            }
        },
    );

    await endSession(sessionEntry.id, tracker, result.text || "(no response)");
    executor.discardChanges();
}
