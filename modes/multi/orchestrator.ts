/**
 * Smart Multi-Agent Mode Integration
 *
 * This file integrates the multi-agent orchestration system into the main
 * application. It analyzes the goal text using an LLM to smartly choose
 * a template or dynamically craft a custom agent topology.
 */

import { text, isCancel, select, confirm, multiselect, spinner } from "@clack/prompts";
import chalk from "chalk";
import { generateText, stepCountIs } from "ai";
import { getAgentModel } from "../../ai";
import { MultiAgentOrchestrator } from "./multi-agent-orchestrator";
import { WorkflowBuilder, WorkflowTemplates } from "./workflow-builder";
import type { MultiAgentWorkflow, OrchestratorEvent } from "./types";
import { composeBeforeAfter, formatPatch } from "../agent/diff-view";
import { renderTerminalMarkdown } from "../../tui/terminal-md";
import { withSpinner } from "../../tui/spinner";
import type { ActionLog } from "../agent/types";

interface ReviewGroup {
  label: string;
  actionIds: string[];
  patch: string | null;
}

function groupPendingByAgent(agentId: string, pending: ActionLog[]): ReviewGroup[] {
  const byPath = new Map<string, ActionLog[]>();
  const shells: ActionLog[] = [];

  for (const a of pending) {
    if (a.type === "tool_execute") {
      shells.push(a);
      continue;
    }
    const key = a.path;
    if (!byPath.has(key)) byPath.set(key, []);
    byPath.get(key)!.push(a);
  }

  const groups: ReviewGroup[] = [];
  const pathEntries = [...byPath.entries()].sort(([a], [b]) => a.localeCompare(b));

  for (const [p, acts] of pathEntries) {
    const sorted = acts.sort((x, y) => x.timestamp.getTime() - y.timestamp.getTime());
    const ids = sorted.map((x) => x.id);

    if (sorted.every((x) => x.type === "folder_create")) {
      groups.push({
        label: `Create folder: ${p}`,
        actionIds: ids,
        patch: null,
      });
      continue;
    }

    const { before, after } = composeBeforeAfter(sorted);
    const patch = formatPatch(p, before, after);
    const kinds = [...new Set(sorted.map((x) => x.type))].join(", ");
    groups.push({ label: `${p} (${kinds})`, actionIds: ids, patch });
  }

  for (const s of shells) {
    groups.push({
      label: `Shell: ${s.details.command ?? "(no command)"}`,
      actionIds: [s.id],
      patch: null,
    });
  }

  return groups;
}

const TEMPLATE_CATALOG = [
  { id: "code_review", name: "Code Review", template: WorkflowTemplates.codeReviewWorkflow },
  { id: "feature_dev", name: "Feature Development", template: WorkflowTemplates.featureDevelopmentWorkflow },
  { id: "bug_fix", name: "Bug Fixing", template: WorkflowTemplates.bugFixingWorkflow },
  { id: "research", name: "Collaborative Research", template: WorkflowTemplates.collaborativeResearchWorkflow },
  { id: "security_audit", name: "Security Audit", template: WorkflowTemplates.securityAuditWorkflow },
  { id: "fullstack", name: "Full-Stack Feature", template: WorkflowTemplates.fullStackFeatureWorkflow },
];

// ─── Main Entry Point ──────────────────────────────────────────────────────

export async function runMultiAgentMode(preCapturedGoal?: string): Promise<void> {
  console.log(chalk.bold("\n👥 Multi-Agent Orchestration\n"));

  const finalGoal = preCapturedGoal?.trim() ?? await text({
    message: "What complex operations workflow would you like to run?",
    placeholder: "e.g., 'Audit auth code security and patch the leaks'...",
  });

  if (!finalGoal || isCancel(finalGoal) || !finalGoal.trim()) return;

  let workflow: MultiAgentWorkflow | null = null;
  const decisionSpinner = spinner();
  decisionSpinner.start("AI analyzing requirements and building optimal agent team topology...");

  try {
    const analysisResponse = await generateText({
      model: await getAgentModel(),
      stopWhen: stepCountIs(1),
      prompt: [
        "You are an expert system architecture manager designing multi-agent software pipelines.",
        "Analyze the following user task goal, and decide the absolute best workflow setup.",
        "",
        `User Task Goal: "${finalGoal}"`,
        "",
        "Available Catalog Templates:",
        "- 'code_review': For reading existing code changes, analyzing style/vulnerabilities, and summarizing changes.",
        "- 'feature_dev': Core workflows needing planning, engineering implementation, and QA reviews.",
        "- 'bug_fix': Repair loops starting with debugging/diagnostics, code patch modifications, and testing cycles.",
        "- 'research': Broad reading, framework discoveries, or documentation analysis without writing active patches.",
        "- 'security_audit': Scanners running sweeps across directories feeding synthesis workflows.",
        "- 'fullstack': Complex tasks requiring layered architectures (Database models, APIs, and UI controls) executing in parallel blocks.",
        "",
        "Your task is to respond with a clean, unformatted JSON object containing instructions on how to structure the agent swarm.",
        "Format your response as a valid raw JSON matching EXACTLY one of these two configurations. Do not use markdown blocks.",
        "",
        "Option A: If a catalog template fits perfectly:",
        '{"decisionType": "template", "templateId": "feature_dev" | "bug_fix" | "code_review" | "research" | "security_audit" | "fullstack"}',
        "",
        "Option B: If the task is unique and requires a customized specialized agent group configuration:",
        '{',
        '  "decisionType": "custom",',
        '  "strategy": "sequential" | "parallel" | "hierarchical" | "collaborative",',
        '  "agents": [',
        '    { "name": "string", "role": "researcher"|"implementer"|"reviewer"|"coordinator", "description": "precise operational prompt instruction directive context for this agent" }',
        '  ]',
        '}'
      ].join("\n"),
    });

    let cleanJsonText = analysisResponse.text.trim();
    if (cleanJsonText.startsWith("```")) {
      cleanJsonText = cleanJsonText.replace(/^```json\s*/, "").replace(/```$/, "").trim();
    }

    const config = JSON.parse(cleanJsonText);
    const timestamp = Date.now();

    if (config.decisionType === "template" && config.templateId) {
      const match = TEMPLATE_CATALOG.find(t => t.id === config.templateId);
      if (match) {
        decisionSpinner.stop(`✨ AI designated standard pipeline template: [${match.name}]`);
        workflow = match.template(`wf_ai_${config.templateId}_${timestamp}`, finalGoal);
      }
    }

    if (!workflow && config.decisionType === "custom" && Array.isArray(config.agents)) {
      decisionSpinner.stop(`🛠️ AI created bespoke customized workspace swarm [Strategy: ${config.strategy.toUpperCase()}]`);
      const builder = new WorkflowBuilder(`wf_custom_ai_${timestamp}`, finalGoal);

      for (const a of config.agents) {
        if (a.role === "researcher") builder.addResearcher(a.name, a.name, a.description);
        else if (a.role === "implementer") builder.addImplementer(a.name, a.name, a.description);
        else if (a.role === "reviewer") builder.addReviewer(a.name, a.name, a.description);
        else builder.addCoordinator(a.name, a.name, a.description);
      }

      if (config.strategy === "parallel") builder.withParallelStrategy(3, 45000);
      else if (config.strategy === "hierarchical") builder.withHierarchicalStrategy();
      else if (config.strategy === "collaborative") builder.withCollaborativeStrategy(60000);
      else builder.withSequentialStrategy();

      builder.withRetryOnFailure(1);
      workflow = builder.build();
    }
  } catch (err) {
    decisionSpinner.stop("⚠️ Model parsing bottleneck; falling back to dynamic Feature Development group");
  }

  if (!workflow) {
    const timestamp = Date.now();
    workflow = WorkflowTemplates.featureDevelopmentWorkflow(`wf_fallback_${timestamp}`, finalGoal);
  }

  const validation = WorkflowBuilder.validateWorkflow(workflow);
  if (!validation.isValid) {
    console.log(chalk.red("\n❌ Generated Workflow validation failed:\n"));
    for (const error of validation.errors) console.log(chalk.red(`  • ${error}`));
    return;
  }

  displayWorkflowSummary(workflow);

  const shouldContinue = await confirm({
    message: "Execute this smart-built agent workflow?",
    initialValue: true,
  });
  if (isCancel(shouldContinue) || !shouldContinue) {
    console.log(chalk.dim("\nWorkflow cancelled.\n"));
    return;
  }

  // 5. Standard Core Operational Orchestrator Lifecycle Loop Execution
  const orchestrator = new MultiAgentOrchestrator(workflow);

  // Map orchestrator events back to the UI engine context dynamically
  await withSpinner(
    {
      message: "Orchestrating system agents pipeline execution...",
      doneMessage: "workflow steps completed successfully",
      failMessage: "workflow processing routine encountered a bottleneck",
    },
    async (ctx) => {
      // FIX: Added stream intercepts alongside tool execution events
      const unsubscribe = orchestrator.onEvent((event: any) => {
        if (event.type === "agent:start") {
          ctx.updateMessage(`Agent [${chalk.magenta(event.agentId || event.payload?.agentId)}] active...`);
        } else if (event.type === "agent:stream_start") {
          ctx.updateMessage(`Agent [${chalk.magenta(event.agentId)}] synthesizing...`);
        } else if (event.type === "agent:chunk") {
          ctx.incrementOutputChunk(); // Forces the pulsing 🟢 arrow to light up
        } else if (event.type === "tool_executed" && event.payload?.logLine) {
          ctx.logStep(event.payload.logLine);
        } else if (event.type === "usage_updated" && event.payload?.usage) {
          ctx.updateTokens(event.payload.usage);
        } else if (event.type === "agent:complete") {
          ctx.logStep(`  ${chalk.green("✔")} [${chalk.magenta(event.agentId)}] task resolved successfully.`);
        } else if (event.type === "agent:failed") {
          ctx.logStep(`  ${chalk.red("✘")} [${chalk.magenta(event.agentId)}] step faulted.`);
        }
      });

      const res = await orchestrator.execute();
      unsubscribe();
      return res;
    }
  );

  // 6. Print Summary Metric Sheets & Route Approval
  displayExecutionResults(orchestrator);
  await runMultiAgentApprovalFlow(orchestrator);
}

// ─── Native Selector Methods (Preserved for standard fallback uses) ────────

async function selectTemplateWorkflow(): Promise<MultiAgentWorkflow | null> {
  const selected = await select({
    message: "Select a workflow template",
    options: TEMPLATE_CATALOG.map((t) => ({
      value: t.id,
      label: chalk.bold(t.name),
    })),
  });
  if (isCancel(selected)) return null;
  const catalog = TEMPLATE_CATALOG.find((t) => t.id === selected);
  if (!catalog) return null;
  const goal = await text({ message: "Describe the goal for this workflow" });
  if (isCancel(goal) || !goal.trim()) return null;
  return catalog.template(`workflow_${selected}_${Date.now()}`, goal.trim());
}

async function buildCustomWorkflow(): Promise<MultiAgentWorkflow | null> {
  return null; // Interface is bypassed dynamically by the structural smart engine
}

async function buildAdvancedDAGWorkflow(): Promise<MultiAgentWorkflow | null> {
  return null; // Interface is bypassed dynamically by the structural smart engine
}

// ─── Display & Approval ────────────────────────────────────────────────────

function displayWorkflowSummary(workflow: MultiAgentWorkflow): void {
  console.log(chalk.bold("\n📋 Smart Workflow Configuration\n"));
  console.log(`Goal: ${workflow.goal}`);
  console.log(`Strategy: ${chalk.cyan(workflow.strategy.type)}`);
  console.log(`Agents: ${workflow.agents.length}`);
  console.log(
    `${workflow.agents
      .map(
        (a) =>
          `  • ${chalk.bold(a.name)} (${a.role})${a.model ? ` [${chalk.dim(a.model)}]` : ""}${
            a.dependsOn?.length ? ` → depends: ${a.dependsOn.join(", ")}` : ""
          }`,
      )
      .join("\n")}`,
  );
  console.log();
}

async function runMultiAgentApprovalFlow(orchestrator: MultiAgentOrchestrator): Promise<void> {
  const trackers = orchestrator.getAllTrackers();
  const executors = orchestrator.getAllExecutors();

  let totalPending = 0;
  for (const [, tracker] of trackers) {
    totalPending += tracker.getPendingMutations().length;
  }

  if (totalPending === 0) {
    console.log(chalk.dim("\nNo staged changes to review.\n"));
    return;
  }

  console.log(chalk.bold(`\n📝 ${totalPending} staged change(s) from ${trackers.size} agent(s)\n`));

  const choice = await select({
    message: "Apply staged changes?",
    options: [
      { value: "all", label: "Approve all" },
      { value: "select", label: "Review one by one" },
      { value: "cancel", label: "Discard all" },
    ],
  });

  if (isCancel(choice) || choice === "cancel") {
    for (const [, tracker] of trackers) {
      for (const action of tracker.getPendingMutations()) {
        tracker.updateStatus(action.id, "rejected", false);
      }
    }
    for (const [, executor] of executors) {
      executor.discardChanges();
    }
    console.log(chalk.yellow("\nAll changes discarded.\n"));
    return;
  }

  if (choice === "all") {
    for (const [, tracker] of trackers) {
      for (const action of tracker.getPendingMutations()) {
        tracker.updateStatus(action.id, "approved", true);
      }
    }
  } else if (choice === "select") {
    for (const [agentId, tracker] of trackers) {
      const pending = tracker.getPendingMutations();
      if (pending.length === 0) continue;

      console.log(chalk.bold(`\n🤖 Agent: ${agentId} (${pending.length} change(s))`));
      const groups = groupPendingByAgent(agentId, pending);

      for (const g of groups) {
        while (true) {
          const opt = await select({
            message: chalk.bold(g.label),
            options: [
              { value: "accept", label: "Accept" },
              { value: "diff", label: "Show diff", hint: g.patch ? "" : "N/A" },
              { value: "reject", label: "Reject" },
            ],
          });

          if (isCancel(opt)) {
            for (const [, t] of trackers) {
              for (const a of t.getPendingMutations()) t.updateStatus(a.id, "rejected", false);
            }
            for (const [, executor] of executors) executor.discardChanges();
            console.log(chalk.yellow("\nAll changes discarded.\n"));
            return;
          }

          if (opt === "diff") {
            if (g.patch) {
              console.log("\n" + renderTerminalMarkdown("```diff\n" + g.patch + "\n```\n") + "\n");
            }
            continue;
          }

          for (const id of g.actionIds) {
            tracker.updateStatus(id, opt === "accept" ? "approved" : "rejected", opt === "accept");
          }
          break;
        }
      }
    }
  }

  await withSpinner(
    {
      message: "Applying approved changes…",
      doneMessage: "all changes applied",
      failMessage: "some operations failed",
    },
    async () => {
      const allErrors: string[] = [];
      for (const [agentId, executor] of executors) {
        const { errors } = executor.applyApprovedFromTracker();
        allErrors.push(...errors.map((e) => `[${agentId}] ${e}`));
      }
      if (allErrors.length > 0) {
        console.log(chalk.red("\nErrors:\n"));
        for (const e of allErrors) console.log(chalk.red(`  · ${e}`));
      } else {
        console.log(chalk.green("\n✔ All changes applied.\n"));
      }
    },
  );
}

function displayExecutionResults(orchestrator: MultiAgentOrchestrator): void {
  const summary = orchestrator.getSummary();
  console.log(chalk.bold("\n📊 Execution Summary\n"));
  const statusColor = summary.status === "completed" ? chalk.green : chalk.red;
  console.log(`Status: ${statusColor(`● ${summary.status}`)}`);
  console.log(`Strategy: ${summary.strategy}`);
  console.log(`Duration: ${summary.duration ? `${summary.duration}ms` : "N/A"}`);

  console.log(chalk.bold("\n🤖 Pool Stats\n"));
  console.log(`Total Agents Assigned: ${summary.poolStats.totalAgents}`);
  console.log(`Completed Steps: ${chalk.green(String(summary.poolStats.completedAgents))}`);
  console.log(`Completion Accuracy: ${chalk.cyan(`${summary.poolStats.completionPercentage}%`)}`);
}

const orchestrationLogger = {
  debug: (msg: string) => {
    if (process.env.DEBUG) console.log(chalk.dim(`[DEBUG] ${msg}`));
  },
};

export default {
  runMultiAgentMode,
  selectTemplateWorkflow,
  buildCustomWorkflow,
  buildAdvancedDAGWorkflow,
  displayExecutionResults,
};