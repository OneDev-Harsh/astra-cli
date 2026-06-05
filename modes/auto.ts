import { text } from "@clack/prompts";
import { generateText, stepCountIs } from "ai";
import chalk from "chalk";
import { getAgentModel } from "../ai";
import { runAgentMode } from "./agent/orchestrator";
import { runAskMode } from "./ask/orchestrator";
import { runPlanMode } from "./plan/orchestrator";
import { runMultiAgentMode } from "./multi/orchestrator";
import { withSpinner } from "../tui/spinner"; // Adjust path as necessary

export async function runAutoMode() {
    console.log(chalk.bold("\n  ✨ Auto-Routing Session\n"));

    const goal = await text({
        message: "What would you like to do?",
        placeholder: "Type anything (e.g., 'fix the bug in store.ts' or 'explain how this app works')...",
    });

    if (!goal || typeof goal !== "string" || !goal.trim()) return;

    let routedMode: "agent" | "ask" | "plan" | "multi" = "agent";

    try {
        routedMode = await withSpinner(
            {
                message: "Analysing request intent...",
                hideTime: true, // Emulates original behavior if you don't want duration shown here
            },
            async () => {
                const result = await generateText({
                    model: getAgentModel(),
                    stopWhen: stepCountIs(1),
                    prompt: [
                        "You are an intent classification router for a development workflow environment.",
                        "Classify the following user request into exactly one of these 4 options:",
                        "- 'ask': User is asking questions, needs code explanations, or conceptual help without needing file edits.",
                        "- 'plan': User wants structural architectural layout designs or step-by-step checklists before writing code.",
                        "- 'multi': User explicitly requests multi-agent swarms or concurrent pipeline workers.",
                        "- 'agent': User wants to write code, modify files, delete files, refactor items, or run workspace terminal tasks.",
                        "",
                        `Request: "${goal.trim()}"`,
                        "",
                        "Respond with exactly one word from the choices: ask, plan, multi, agent. Do not include markdown formatting or punctuation.",
                    ].join("\n"),
                });

                const word = result.text.trim().toLowerCase();
                if (["ask", "plan", "multi", "agent"].includes(word)) {
                    return word as "agent" | "ask" | "plan" | "multi";
                }
                return "agent"; // Safe fallback match inside the task
            }
        );
    } catch {
        // Safe fallback to agent mode if execution fails
        routedMode = "agent";
    }

    // Execute the target handler, forwarding the pre-captured prompt input string
    if (routedMode === "agent") {
        await runAgentMode(goal.trim());
    } else if (routedMode === "ask") {
        await runAskMode(goal.trim());
    } else if (routedMode === "plan") {
        await runPlanMode(goal.trim());
    } else if (routedMode === "multi") {
        await runMultiAgentMode(goal.trim());
    }
}