/**
 * Multi-Agent Mode Integration
 *
 * This file integrates the multi-agent orchestration system into the main
 * application alongside existing modes (agent, ask, plan).
 */

import { text, isCancel, select, confirm, multiselect } from "@clack/prompts";
import chalk from "chalk";
import { MultiAgentOrchestrator } from "./multi-agent-orchestrator";
import { WorkflowBuilder, WorkflowTemplates } from "./workflow-builder";
import type { MultiAgentWorkflow, OrchestratorEvent } from "./types";
import { composeBeforeAfter, formatPatch } from "../agent/diff-view";
import { renderTerminalMarkdown } from "../../tui/terminal-md";
import { withSpinner } from "../../tui/spinner";
import type { ActionLog } from "../agent/types";

/**
 * Group pending actions by path for review, same as single-agent approval
 */
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

// ─── Main Entry Point ──────────────────────────────────────────────────────

export async function runMultiAgentMode(): Promise<void> {
  console.log(chalk.bold("\n👥 Multi-Agent Orchestration\n"));

  const workflowType = await select({
    message: "What would you like to do?",
    options: [
      {
        value: "template",
        label: "Use a predefined workflow template",
      },
      {
        value: "custom",
        label: "Build a custom workflow",
      },
      {
        value: "advanced",
        label: "Advanced: DAG with dependencies",
      },
    ],
  });

  if (isCancel(workflowType)) return;

  let workflow;

  if (workflowType === "template") {
    workflow = await selectTemplateWorkflow();
  } else if (workflowType === "advanced") {
    workflow = await buildAdvancedDAGWorkflow();
  } else {
    workflow = await buildCustomWorkflow();
  }

  if (!workflow) return;

  // Validate
  const validation =
  WorkflowBuilder.validateWorkflow(workflow);
  if (!validation.isValid) {
    console.log(chalk.red("\n❌ Workflow validation failed:\n"));
    for (const error of validation.errors) {
      console.log(chalk.red(`  • ${error}`));
    }
    if (validation.warnings.length > 0) {
      console.log(chalk.yellow("\n⚠️  Warnings:\n"));
      for (const warning of validation.warnings) {
        console.log(chalk.yellow(`  • ${warning}`));
      }
    }
    return;
  }

  if (validation.warnings.length > 0) {
    console.log(chalk.yellow("\n⚠️  Warnings:\n"));
    for (const warning of validation.warnings) {
      console.log(chalk.yellow(`  • ${warning}`));
    }
  }

  // Review before execution
  displayWorkflowSummary(workflow);

  const shouldContinue = await confirm({
    message: "Execute this workflow?",
    initialValue: true,
  });
  if (isCancel(shouldContinue) || !shouldContinue) {
    console.log(chalk.dim("\nWorkflow cancelled.\n"));
    return;
  }

  // Execute
  const orchestrator = new MultiAgentOrchestrator(workflow);

  // Setup event listener for real-time progress
  const unsubscribe = orchestrator.onEvent((event: OrchestratorEvent) => {
    if (event.type === "agent:start") {
      orchestrationLogger.debug(`Agent ${event.agentId} starting...`);
    } else if (event.type === "agent:complete") {
      orchestrationLogger.debug(`Agent ${event.agentId} completed`);
    }
  });

  await withSpinner(
    {
      message: "Orchestrating workflow...",
      doneMessage: "workflow completed",
      failMessage: "workflow failed",
    },
    () => orchestrator.execute(),
  );

  unsubscribe();

  // Display results
  displayExecutionResults(orchestrator);

  // Approval flow
  await runMultiAgentApprovalFlow(orchestrator);
}

// ─── Workflow Selection ────────────────────────────────────────────────────

const TEMPLATE_CATALOG = [
  {
    id: "code_review",
    name: "Code Review",
    description: "Researcher → Implementer → Reviewer (sequential)",
    template: WorkflowTemplates.codeReviewWorkflow,
  },
  {
    id: "feature_dev",
    name: "Feature Development",
    description: "Coordinator plans, then backend & frontend develop in parallel, QA tests",
    template: WorkflowTemplates.featureDevelopmentWorkflow,
  },
  {
    id: "bug_fix",
    name: "Bug Fixing",
    description: "Debug → Fix → Test (sequential with retry)",
    template: WorkflowTemplates.bugFixingWorkflow,
  },
  {
    id: "research",
    name: "Collaborative Research",
    description: "Multiple researchers work in parallel, sharing insights",
    template: WorkflowTemplates.collaborativeResearchWorkflow,
  },
  {
    id: "security_audit",
    name: "Security Audit",
    description: "Parallel scanners → coordinator synthesis (DAG)",
    template: WorkflowTemplates.securityAuditWorkflow,
  },
  {
    id: "fullstack",
    name: "Full-Stack Feature",
    description: "Architect → parallel devs (DB, API, UI) → E2E tests (DAG)",
    template: WorkflowTemplates.fullStackFeatureWorkflow,
  },
];

async function selectTemplateWorkflow(): Promise<MultiAgentWorkflow | null> {
  const selected = await select({
    message: "Select a workflow template",
    options: TEMPLATE_CATALOG.map((t) => ({
      value: t.id,
      label: `${chalk.bold(t.name)} — ${chalk.dim(t.description)}`,
    })),
  });

  if (isCancel(selected)) return null;

  const catalog = TEMPLATE_CATALOG.find((t) => t.id === selected);
  if (!catalog) return null;

  const goal = await text({
    message: "Describe the goal for this workflow",
    placeholder: catalog.description,
  });

  if (isCancel(goal) || !goal.trim()) return null;

  const timestamp = Date.now();
  const workflowId = `workflow_${selected}_${timestamp}`;
  return catalog.template(workflowId, goal.trim());
}

// ─── Custom Workflow Builder ───────────────────────────────────────────────

async function buildCustomWorkflow(): Promise<MultiAgentWorkflow | null> {
  const goal = await text({
    message: "What is the goal of this workflow?",
  });

  if (isCancel(goal) || !goal.trim()) return null;

  const timestamp = Date.now();
  const builder = new WorkflowBuilder(`workflow_custom_${timestamp}`, goal.trim());

  // Add agents
  let agentCount = 0;
  let addingAgents = true;

  while (addingAgents && agentCount < 10) {
    const agentType = await select({
      message: `Agent #${agentCount + 1}?`,
      options: [
        { value: "researcher", label: "Researcher (read-only analysis)" },
        { value: "implementer", label: "Implementer (write code)" },
        { value: "reviewer", label: "Reviewer (validate and test)" },
        { value: "coordinator", label: "Coordinator (orchestrate)" },
        { value: "custom", label: "Custom agent" },
        { value: "done", label: "Done adding agents" },
      ],
    });

    if (isCancel(agentType)) return null;
    if (agentType === "done") break;

    const name = await text({
      message: "Agent name",
      initialValue: `${agentType}_${agentCount + 1}`,
    });

    if (isCancel(name)) return null;

    const description = await text({
      message: "What does this agent do?",
    });

    if (isCancel(description)) return null;

    const useCustomModel = await confirm({
      message: "Use a custom model for this agent?",
      initialValue: false,
    });

    let model: string | undefined;
    if (!isCancel(useCustomModel) && useCustomModel) {
      const modelInput = await text({
        message: "Model ID (e.g., anthropic/claude-opus-4)",
        initialValue: "anthropic/claude-opus-4",
      });
      if (isCancel(modelInput)) return null;
      model = modelInput.trim() || undefined;
    }

    const options = model ? { model } : undefined;

    switch (agentType) {
      case "researcher":
        builder.addResearcher(name, name, description, options);
        break;
      case "implementer":
        builder.addImplementer(name, name, description, options);
        break;
      case "reviewer":
        builder.addReviewer(name, name, description, options);
        break;
      case "coordinator":
        builder.addCoordinator(name, name, description, options);
        break;
      case "custom":
        const customTools = await selectCustomTools();
        if (!customTools) return null;
        builder.addCustomAgent(name, name, description, customTools, options);
        break;
    }

    agentCount++;
  }

  if (agentCount === 0) {
    console.log(chalk.yellow("No agents added."));
    return null;
  }

  // Strategy selection
  const strategy = await select({
    message: "Orchestration strategy?",
    options: [
      { value: "sequential", label: "Sequential (one after another)" },
      { value: "parallel", label: "Parallel (simultaneous with limits)" },
      { value: "hierarchical", label: "Hierarchical (coordinator delegates)" },
      { value: "collaborative", label: "Collaborative (agents communicate)" },
    ],
  });

  if (isCancel(strategy)) return null;

  switch (strategy) {
    case "sequential":
      builder.withSequentialStrategy();
      break;
    case "parallel":
      builder.withParallelStrategy(3, 30_000);
      break;
    case "hierarchical":
      builder.withHierarchicalStrategy();
      break;
    case "collaborative":
      builder.withCollaborativeStrategy(60_000);
      break;
  }

  // Retry option
  const enableRetry = await confirm({
    message: "Enable retry on failure?",
    initialValue: true,
  });

  if (!isCancel(enableRetry) && enableRetry) {
    builder.withRetryOnFailure(2);
  }

  return builder.build();
}

// ─── Advanced DAG Workflow Builder ──────────────────────────────────────────

async function buildAdvancedDAGWorkflow(): Promise<MultiAgentWorkflow | null> {
  const goal = await text({
    message: "What is the goal of this complex workflow?",
  });

  if (isCancel(goal) || !goal.trim()) return null;

  const timestamp = Date.now();
  const builder = new WorkflowBuilder(`workflow_dag_${timestamp}`, goal.trim());

  const agents = new Map<string, string>();
  let agentCount = 0;

  // Build a pool of available agents first
  let addingAgents = true;
  while (addingAgents && agentCount < 15) {
    const agentType = await select({
      message: `Agent #${agentCount + 1}?`,
      options: [
        { value: "researcher", label: "Researcher" },
        { value: "implementer", label: "Implementer" },
        { value: "reviewer", label: "Reviewer" },
        { value: "coordinator", label: "Coordinator" },
        { value: "done", label: "Done adding agents" },
      ],
    });

    if (isCancel(agentType)) return null;
    if (agentType === "done") break;

    const name = await text({
      message: "Agent name",
      initialValue: `${agentType}_${agentCount + 1}`,
    });

    if (isCancel(name)) return null;

    agents.set(name, agentType);
    agentCount++;
  }

  if (agents.size === 0) return null;

  // Now let user specify dependencies
  for (const [agentName, agentType] of agents) {
    const dependsOnRaw = await multiselect({
      message: `${chalk.bold(agentName)}: depends on? (empty = root)`,
      options: Array.from(agents.keys())
        .filter((n) => n !== agentName)
        .map((n) => ({ label: n, value: n })),
    });

    if (isCancel(dependsOnRaw)) return null;

    const deps = dependsOnRaw as string[];
    const description = await text({
      message: `${agentName}: What does it do?`,
    });

    if (isCancel(description)) return null;

    const options = deps.length > 0 ? { dependsOn: deps } : undefined;

    switch (agentType) {
      case "researcher":
        builder.addResearcher(agentName, agentName, description, options);
        break;
      case "implementer":
        builder.addImplementer(agentName, agentName, description, options);
        break;
      case "reviewer":
        builder.addReviewer(agentName, agentName, description, options);
        break;
      case "coordinator":
        builder.addCoordinator(agentName, agentName, description, options);
        break;
    }
  }

  builder.withDagStrategy(3, 120_000).withRetryOnFailure(1);

  return builder.build();
}

// ─── Tools Selection ──────────────────────────────────────────────────────

async function selectCustomTools(): Promise<string[] | null> {
  const availableTools = [
    "read_file",
    "read_multiple_files",
    "list_files",
    "search_files",
    "analyze_codebase",
    "grep",
    "create_file",
    "modify_file",
    "replace_in_file",
    "append_to_file",
    "insert_at_line",
    "delete_file",
    "create_folder",
    "run_command",
    "run_tests",
    "run_test_file",
    "lint_project",
    "format_project",
    "git_status",
    "git_log",
    "git_diff",
    "detect_framework",
    "read_package_json",
    "web_search",
    "fetch_url",
    "create_plan",
    "get_plan",
    "show_pending_changes",
    "apply_changes",
    "discard_changes",
    "list_skills",
    "read_skill",
  ];

  const selected: string[] = ["read_file"];

  let addingTools = true;
  while (addingTools) {
    const remaining = availableTools.filter((t) => !selected.includes(t));
    if (remaining.length === 0) break;

    const tool = await select({
      message: `Tool #${selected.length}?`,
      options: [
        ...remaining.slice(0, 15).map((t) => ({ value: t, label: t })),
        { value: "done", label: "Done" },
      ],
    });

    if (isCancel(tool)) return null;
    if (tool === "done") break;

    selected.push(tool);
  }

  return selected;
}

// ─── Display & Approval ────────────────────────────────────────────────────

function displayWorkflowSummary(workflow: MultiAgentWorkflow): void {
  console.log(chalk.bold("\n📋 Workflow Configuration\n"));
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
              for (const a of t.getPendingMutations()) {
                t.updateStatus(a.id, "rejected", false);
              }
            }
            for (const [, executor] of executors) {
              executor.discardChanges();
            }
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
        for (const e of allErrors) {
          console.log(chalk.red(`  · ${e}`));
        }
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
  const statusIcon = summary.status === "completed" ? "✓" : "✗";
  console.log(`Status: ${statusColor(`${statusIcon} ${summary.status}`)}`);
  console.log(`Strategy: ${summary.strategy}`);
  console.log(`Duration: ${summary.duration ? `${summary.duration}ms` : "N/A"}`);

  console.log(chalk.bold("\n🤖 Pool Stats\n"));
  console.log(`Total: ${summary.poolStats.totalAgents}`);
  console.log(`Completed: ${chalk.green(String(summary.poolStats.completedAgents))}`);
  console.log(`Failed: ${chalk.red(String(summary.poolStats.failedAgents))}`);
  console.log(`Overall: ${chalk.cyan(`${summary.poolStats.completionPercentage}%`)}`);

  console.log(chalk.bold("\n🔍 Agent Results\n"));
  for (const result of summary.executionResults) {
    const icon = result.success ? chalk.green("✓") : chalk.red("✗");
    const role = chalk.dim(`(${result.role})`);
    console.log(`${icon} ${chalk.bold(result.agentId)} ${role}`);
    console.log(`   Steps: ${result.steps}, Duration: ${result.durationMs}ms, Attempt: ${result.attemptNumber}`);
    if (result.toolsUsed.length > 0) {
      console.log(`   Tools: ${result.toolsUsed.join(", ")}`);
    }
  }

  console.log(chalk.bold("\n✅ Tasks\n"));
  console.log(`Completed: ${chalk.green(String(summary.completedTasks))}`);
  console.log(`Failed: ${chalk.red(String(summary.failedTasks))}`);
}

// ─── Simple Logger ─────────────────────────────────────────────────────────

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