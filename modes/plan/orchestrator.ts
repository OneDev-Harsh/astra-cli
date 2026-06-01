import { text, isCancel, confirm } from "@clack/prompts";
import chalk from "chalk";
import { generatePlan } from "./planner";
import { printPlan, selectSteps } from "./selection";
import { defaultAgentConfig } from "../agent/types";
import { ActionTracker } from "../agent/action-tracker";
import { ToolExecutor } from "../agent/tool-executor";
import { createAgentTools } from "../agent/agent-tools";
import {stepCountIs, ToolLoopAgent} from 'ai'
import { getAgentModel } from "../../ai";
import type { PlanStep } from "./types";
import { renderTerminalMarkdown } from "../../tui/terminal-md";
import { runApprovalFlow } from "../agent/approval";
import { createWebTools } from "./web-tools";
import { withSpinner } from "../../tui/spinner";

function stepPrompt(goal: string, step: PlanStep): string {
  return [`Goal: ${goal}`, `Step: ${step.title}`, step.description].join('\n');
}

export async function runPlanMode():Promise<void>{
    console.log(chalk.bold("\n⏰ Plan Mode\n"))

    const goal = await text({
        message: "What is your goal?"
    })
    if(isCancel(goal) || !goal.trim()) return

    const plan = await generatePlan(goal)

    printPlan(plan)

    const selected = await selectSteps(plan)
    if(selected.length === 0) return

    const proceed = await confirm({
        message: `Execute ${selected.length} step(s)`,
        initialValue: true,
    })

    if (isCancel(proceed) || !proceed) return

    const config = defaultAgentConfig()
    const tracker = new ActionTracker()
    const executor = new ToolExecutor(tracker, config)

    const tools = {
        ...createAgentTools(executor),
        ...createWebTools(tracker)
    }

    for(const step of selected){
        console.log(chalk.bold(`\n🔧 ${step.title}\n`))

        const agent = new ToolLoopAgent({
            model: getAgentModel(),
            stopWhen: stepCountIs(50),
            tools,
        })

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
                                chalk.green("  ✔"),
                                chalk.bold(String(tc.toolName)),
                                chalk.dim(
                                    preview + (preview.length > 160 ? "..." : ""),
                                ),
                            );
                        }
                    },
                }),
        );

        if(r.text) console.log(renderTerminalMarkdown(r.text))
    }

    const ok = await runApprovalFlow(tracker)

    if(!ok) { executor.discardChanges(); return; }

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
                for (const e of errors) console.log(chalk.red(`  • ${e}`));
            } else {
                console.log(chalk.green("\n✓ Applied.\n"));
            }
        },
    );

    executor.discardChanges();
}
