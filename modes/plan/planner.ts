import {
  Output,
  generateText,
  stepCountIs,
} from "ai";
import z from "zod";
import { getAgentModel } from "../../ai";
import { ActionTracker } from "../agent/action-tracker";
import { ToolExecutor } from "../agent/tool-executor";
import { createAgentTools } from "../agent/agent-tools";
import { defaultAgentConfig } from "../agent/types";
import type { Plan, PlanStep } from "./types";
import { createWebTools } from "./web-tools";
import { withSpinner } from "../../tui/spinner";
import { getEnv } from "../../ai/config-loader";

const planSchema = z.object({
  researchSummary: z.string().optional(),
  steps: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        hints: z.array(z.string()).optional(),
        complexity: z.enum(["low", "medium", "high"]).optional(),
      }),
    )
    .min(1)
    .max(20),
});

/**
 * Read-only subset of agent tools for the planner.
 * Strips all mutation, shell, staging, and executor web tools
 * (web is provided by createWebTools when FIRECRAWL_API_KEY is set).
 */
function createPlannerTools(executor: ToolExecutor) {
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
    discard_changes: _dc,
    show_pending_changes: _spc,
    run_tests: _rt,
    run_test_file: _rtf,
    lint_project: _lp,
    format_project: _fp,
    create_plan: _cp,
    get_plan: _gp,
    // strip executor's curl-based web tools — superseded by createWebTools (Firecrawl)
    web_search: _ws,
    fetch_url: _fu,
    ...readOnly
  } = all;
  return readOnly;
}

const PLAN_INSTRUCTIONS = (
  codebase: string,
  hasWeb: boolean,
): string => [
  "You are Astra, an AI-native development CLI companion tool built to help the user navigate, analyze, and build within their workspace codebase. If the user asks who you are, what your name is, or what model you are running on, you must always identify yourself exclusively as Astra. Do not mention your underlying model architecture or provider.",
  "You are a Plan-Mode planner. You DO NOT modify files.",
  `Workspace: ${codebase}`,
  "Use read-only tools for codebase/skills research.",
  hasWeb
    ? "Web tools are available (web_search/web_crawl/fetch_url). Use only when needed."
    : "Web tools are unavailable.",
  "Output must match the provided JSON schema.",
  "Keep it short: 1-20 steps.",
].join("\n");

export async function generatePlan(goal: string) {
  const config = defaultAgentConfig();
  const tracker = new ActionTracker();
  const executor = new ToolExecutor(tracker, config);

  const hasWeb = !!getEnv("FIRECRAWL_API_KEY");

  const tools = {
    ...createPlannerTools(executor),
    ...(hasWeb ? createWebTools(tracker) : {}),
  };

  const result = await withSpinner(
    {
      message: "Researching & drafting plan…",
      doneMessage: "plan ready",
      failMessage: "planning failed",
    },
    async () =>
      generateText({
        model: await getAgentModel(),
        tools,
        stopWhen: stepCountIs(30),
        system: PLAN_INSTRUCTIONS(config.codebasePath, hasWeb),
        prompt: `User goal: \n${goal}`,
        output: Output.object({ schema: planSchema }),
      }),
  );

  const validated = planSchema.parse(result.output);

  const steps: PlanStep[] = validated.steps.map((s, i) => ({
    id: `step-${i + 1}`,
    title: s.title,
    description: s.description,
    hints: s.hints,
    complexity: s.complexity,
  }));

  return { goal, researchSummary: validated.researchSummary, steps };
}