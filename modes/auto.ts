import { text } from "@clack/prompts";
import { generateText } from "ai";
import chalk from "chalk";
import { getAgentModel } from "../ai";
import { runAgentMode } from "./agent/orchestrator";
import { runAskMode } from "./ask/orchestrator";
import { runPlanMode } from "./plan/orchestrator";
import { runMultiAgentMode } from "./multi/orchestrator";
import { withSpinner } from "../tui/spinner";
import { beginSession, endSession } from "../session";
import { ActionTracker } from "./agent/action-tracker";

// Speed optimization: Local fast-path keyword evaluation rules
function getFastPathIntent(goal: string): "agent" | "ask" | "plan" | "multi" | null {
    const clean = goal.toLowerCase().trim();

    // Explicit ask indicators (questions, descriptions, explanations)
    if (/^(what|how|why|explain|tell me|who|where|is there|can you explain)/i.test(clean)) return "ask";
    if (clean.endsWith('?')) return "ask";

    // Explicit planning layout/checklist indicators
    if (/^(plan|checklist|architecture|design|layout|steps to|roadmap|structure for)/i.test(clean)) return "plan";

    // Explicit multi-agent swarm configurations
    if (/^(swarm|multi-agent|pipeline|concurrent|workers|agents|team of)/i.test(clean)) return "multi";

    // Explicit execution/file edits
    if (/^(fix|modify|delete|refactor|write|create|run|build|test|add to)/i.test(clean)) return "agent";

    return null; // Fallback to LLM if ambiguous
}

export async function runAutoMode(preCapturedGoal?: string) {
    if(!preCapturedGoal) console.log(chalk.bold("\n  ✨ Auto-Routing Session\n"));
    else console.log();

    const goal = preCapturedGoal ?? await text({
        message: "What would you like to do?",
        placeholder: "Type anything (e.g., 'fix the bug in store.ts' or 'explain how this app works')...",
    });

    if (!goal || typeof goal !== "string" || !goal.trim()) return;

    const trimmedGoal = goal.trim();

    // 1. Initialize and register the "auto" session in your database store
    const { entry: sessionEntry } = beginSession({
        workspacePath: process.cwd(),
        mode: "auto",
        goal: trimmedGoal,
    });

    const autoTracker = new ActionTracker();
    let routedMode: "agent" | "ask" | "plan" | "multi" = "agent";

    try {
        // Fast-path evaluation execution before displaying spin elements
        const fastIntent = getFastPathIntent(trimmedGoal);

        if (fastIntent) {
            routedMode = fastIntent;
        } else {
            // Only trigger spinner and network call if local regex fails
            routedMode = await withSpinner(
                {
                    message: "Analysing request intent...",
                    hideTime: false,
                },
                async () => {
                    const model = await getAgentModel();
                    const result = await generateText({
                        model,
                        // maxTokens is supported at runtime, but if the compiler blocks it,
                        // we use a tight prompt and temperature: 0 to ensure it stops immediately.
                        temperature: 0,
                        prompt: [
                            "Classify this developer workflow request into exactly one word: ask, plan, multi, agent.",
                            "- ask: Questions, code explanations, conceptual help (no file edits).",
                            "- plan: Architectural designs, checklists, step-by-step roadmaps.",
                            "- multi: Multi-agent swarms or concurrent pipeline configurations.",
                            "- agent: Modifying/writing files, refactoring code, or terminal actions.",
                            `Request: "${trimmedGoal}"`,
                            "Output single word choice only (no punctuation/markdown):"
                        ].join("\n"),
                    } as any); // Cast as any to bypass the overly strict CallSettings type definition

                    const word = result.text.trim().toLowerCase();
                    if (["ask", "plan", "multi", "agent"].includes(word)) {
                        return word as "agent" | "ask" | "plan" | "multi";
                    }
                    return "agent";
                }
            );
        }
    } catch {
        routedMode = "agent";
    }

    // 2. Finalize and log the router's decision phase into the store history trail
    await endSession(
        sessionEntry.id,
        autoTracker,
        `Auto-router successfully mapped intent to down-stream [${routedMode}] engine.`
    );

    // 3. Execute the target handler, forwarding the pre-captured prompt input string
    if (routedMode === "agent") {
        await runAgentMode(trimmedGoal);
    } else if (routedMode === "ask") {
        await runAskMode(trimmedGoal);
    } else if (routedMode === "plan") {
        await runPlanMode(trimmedGoal);
    } else if (routedMode === "multi") {
        await runMultiAgentMode(trimmedGoal);
    }
}
