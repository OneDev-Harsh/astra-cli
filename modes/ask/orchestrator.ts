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
import { beginSession, endSession, markSessionInterrupted } from "../../session";
import { createSessionTools } from "../../session/session-tools";

/**
 * Read-only subset of agent tools safe for ask mode.
 * Excludes all mutation tools (create/modify/delete/shell/staging).
 */
function createReadOnlyTools(executor: ToolExecutor) {
    const all = createAgentTools(executor);
    const {
        // strip every mutating tool
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
        apply_changes: _ac,
        discard_changes: _dc,
        show_pending_changes: _spc,
        run_tests: _rt,
        run_test_file: _rtf,
        lint_project: _lp,
        format_project: _fp,
        create_plan: _cp,
        get_plan: _gp,
        // keep everything else
        ...readOnly
    } = all;
    return readOnly;
}

function asMd(questions: string, answer: string): string {
    return `## Question\n\n${questions.trim()}\n\n## Answer\n\n${answer.trim()}\n`;
}

export async function runAskMode() {
    console.log(chalk.bold("\n❔ Ask Mode\n"));

    const questions = await text({
        message: "What do you want to ask?",
    });
    if (isCancel(questions) || !questions.trim()) return;

    const config = defaultAgentConfig();
    // Agent runs fully read-only; file creation is only enabled for the save step below
    config.tools.allowShellExecution = false;
    config.tools.allowFileModification = false;
    config.tools.allowFolderCreation = false;
    config.tools.allowFileCreation = false;

    const tracker = new ActionTracker();
    const executor = new ToolExecutor(tracker, config);

    // ── Session management ──────────────────────────────────────────────
    const { entry: sessionEntry } = beginSession({
        workspacePath: config.codebasePath,
        mode: "ask",
        goal: questions.trim(),
    });

    const agent = new ToolLoopAgent({
        model: getAgentModel(),
        stopWhen: stepCountIs(25),
        tools: {
            ...createReadOnlyTools(executor),
            ...createWebTools(tracker),
            ...createSessionTools(config.codebasePath),
        },
    });

    let result;
    try {
        result = await withSpinner(
            {
                message: "Thinking...",
                doneMessage: "here's the answer",
                failMessage: "couldn't get an answer",
            },
            () =>
                agent.generate({
                    prompt: questions.trim(),
                    onStepFinish: ({ toolCalls }) => {
                        for (const tc of toolCalls) {
                            const preview = JSON.stringify(tc.input).slice(0, 160);
                            console.log(
                                chalk.cyan("  ·"),
                                chalk.bold(String(tc.toolName)),
                                chalk.dim(preview + (preview.length > 160 ? "..." : "")),
                            );
                        }
                    },
                }),
        );
    } catch (error) {
        markSessionInterrupted(sessionEntry.id);
        throw error;
    }

    const answer = result.text.trim() || "(agent returned empty response)";

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

    // Enable file creation only for the explicit save step
    config.tools.allowFileCreation = true;
    executor.createFile(filename, asMd(questions, answer));
    config.tools.allowFileCreation = false;

    const ok = await runApprovalFlow(tracker);
    if (!ok) {
        await endSession(sessionEntry.id, tracker, answer);
        return executor.discardChanges();
    }

    await withSpinner(
        {
            message: "Saving response…",
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
