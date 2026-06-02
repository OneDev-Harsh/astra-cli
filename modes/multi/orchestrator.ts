/**
 * Multi-Agent Mode Integration
 *
 * This file integrates the multi-agent orchestration system into the main
 * application alongside existing modes (agent, ask, plan).
 */

import { text, isCancel, select, confirm } from "@clack/prompts";
import chalk from "chalk";
import { MultiAgentOrchestrator } from "./multi-agent-orchestrator";
import { WorkflowBuilder, WorkflowTemplates } from "./workflow-builder";
import type { MultiAgentWorkflow } from "./types";
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

function groupPendingByAgent(
  agentId: string,
  pending: ActionLog[],
): ReviewGroup[] {
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

  const pathEntries = [...byPath.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [p, acts] of pathEntries) {
    const sorted = acts.sort(
      (x, y) => x.timestamp.getTime() - y.timestamp.getTime(),
    );
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

/**
 * Main multi-agent mode entry point
 */
export async function runMultiAgentMode(): Promise<void> {
  console.log(chalk.bold("\n👥 Multi-Agent Mode\n"));

  // Step 1: Choose workflow type
  const workflowType = await select({
    message: "Select workflow type",
    options: [
      {
        value: "template",
        label: "Use predefined template",
      },
      {
        value: "custom",
        label: "Create custom workflow",
      },
    ],
  });

  if (isCancel(workflowType)) return;

  let workflow;

  if (workflowType === "template") {
    workflow = await selectTemplate();
  } else {
    workflow = await buildCustomWorkflow();
  }

  if (!workflow) return;

  // Step 2: Validate workflow
  const builder = new WorkflowBuilder(workflow.id, workflow.goal);
  for (const agent of workflow.agents) {
    builder.addAgent(agent);
  }
  builder.getWorkflow().strategy = workflow.strategy;
  const { isValid, errors } = builder.validate();

  if (!isValid) {
    console.log(chalk.red("\n❌ Workflow validation failed:\n"));
    for (const error of errors) {
      console.log(chalk.red(`  • ${error}`));
    }
    return;
  }

  // Step 3: Review workflow configuration
  console.log(chalk.bold("\n📋 Workflow Configuration\n"));
  console.log(`Goal: ${workflow.goal}`);
  console.log(`Strategy: ${workflow.strategy.type}`);
  console.log(`Agents: ${workflow.agents.length}`);
  console.log(
    `  ${workflow.agents
      .map(
        (a) =>
          `• ${a.name} (${a.role})${a.model ? ` [model: ${a.model}]` : ""}`,
      )
      .join("\n  ")}`,
  );

  // Step 4: Execute workflow
  const orchestrator = new MultiAgentOrchestrator(workflow);

  await withSpinner(
    {
      message: "Orchestrating multi-agent workflow...",
      doneMessage: "workflow completed",
      failMessage: "workflow failed",
    },
    () => orchestrator.execute(),
  );

  // Step 5: Display results
  displayExecutionResults(orchestrator);

  // Step 6: Review and approve changes from all agents
  await runMultiAgentApprovalFlow(orchestrator);
}

/**
 * Run approval flow for all agent trackers.
 * Uses the REAL per-agent trackers and executors from the orchestrator,
 * ensuring that approved changes are actually written to disk.
 */
async function runMultiAgentApprovalFlow(
  orchestrator: MultiAgentOrchestrator,
): Promise<void> {
  const trackers = orchestrator.getAllTrackers();
  const executors = orchestrator.getAllExecutors();

  // Collect all pending mutations across all agents
  let totalPending = 0;
  for (const [, tracker] of trackers) {
    const pending = tracker.getPendingMutations();
    totalPending += pending.length;
  }

  if (totalPending === 0) {
    console.log(chalk.dim("\nNo staged file changes to review.\n"));
    return;
  }

  console.log(
    chalk.bold(
      `\n📝 ${totalPending} staged change(s) from ${trackers.size} agent(s)\n`,
    ),
  );

  const choice = await select({
    message: "Apply staged changes?",
    options: [
      { value: "all", label: "Approve and apply all" },
      { value: "select", label: "Review one by one" },
      { value: "cancel", label: "Cancel / discard all" },
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
    // Review each agent's changes one by one
    for (const [agentId, tracker] of trackers) {
      const pending = tracker.getPendingMutations();
      if (pending.length === 0) continue;

      console.log(
        chalk.bold(
          `\n🤖 Agent: ${agentId} (${pending.length} change(s))`,
        ),
      );

      const groups = groupPendingByAgent(agentId, pending);

      for (const g of groups) {
        while (true) {
          const opt = await select({
            message: chalk.bold(g.label),
            options: [
              { value: "accept", label: "Accept" },
              {
                value: "diff",
                label: "Show diff",
                hint: g.patch ? "" : "N/A",
              },
              { value: "reject", label: "Reject" },
            ],
          });

          if (isCancel(opt)) {
            // Reject everything on cancel
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
              console.log(
                "\n" +
                  renderTerminalMarkdown("```diff\n" + g.patch + "\n```\n") +
                  "\n",
              );
            }
            continue;
          }

          for (const id of g.actionIds) {
            tracker.updateStatus(
              id,
              opt === "accept" ? "approved" : "rejected",
              opt === "accept",
            );
          }

          break;
        }
      }
    }
  }

  // Apply approved changes using each agent's REAL executor.
  // The executor already has the overlay state from the agent's tool calls,
  // and the tracker now has "approved" status on the chosen actions.
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
        console.log(chalk.red("\nSome operations reported errors:\n"));
        for (const e of allErrors) {
          console.log(chalk.red(`  · ${e}`));
        }
      } else {
        console.log(chalk.green("\n✔ All changes applied.\n"));
      }
    },
  );
}

/**
 * Select from predefined workflow templates
 */
async function selectTemplate() {
  const template = await select({
    message: "Select workflow template",
    options: [
      {
        value: "code_review",
        label: "Code Review (Researcher → Implementer → Reviewer)",
      },
      {
        value: "feature_dev",
        label: "Feature Development (Coordinator → Parallel Developers → QA)",
      },
      {
        value: "bug_fix",
        label: "Bug Fixing (Debug → Fix → Test)",
      },
      {
        value: "research",
        label: "Collaborative Research (Parallel Researchers)",
      },
    ],
  });

  if (isCancel(template)) return null;

  const goal = await text({
    message: "What is the goal for this workflow?",
  });

  if (isCancel(goal) || !goal.trim()) return null;

  const timestamp = Date.now();
  const workflowId = `workflow_${template}_${timestamp}`;

  let workflow;

  switch (template) {
    case "code_review":
      workflow = WorkflowTemplates.codeReviewWorkflow(workflowId, goal);
      break;
    case "feature_dev":
      workflow = WorkflowTemplates.featureDevelopmentWorkflow(workflowId, goal);
      break;
    case "bug_fix":
      workflow = WorkflowTemplates.bugFixingWorkflow(workflowId, goal);
      break;
    case "research":
      workflow = WorkflowTemplates.collaborativeResearchWorkflow(workflowId, goal);
      break;
    default:
      return null;
  }

  return workflow;
}

/**
 * Build a custom workflow interactively
 */
async function buildCustomWorkflow() {
  const goal = await text({
    message: "What is the goal of this workflow?",
  });

  if (isCancel(goal) || !goal.trim()) return null;

  const timestamp = Date.now();
  const builder = new WorkflowBuilder(`workflow_custom_${timestamp}`, goal);

  // Add agents
  let addingAgents = true;
  let agentCount = 0;

  while (addingAgents && agentCount < 10) {
    const agentType = await select({
      message: `Add agent #${agentCount + 1}?`,
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

    if (agentType === "done") {
      addingAgents = false;
      break;
    }

    const name = await text({
      message: `Agent name`,
      initialValue: `${agentType}_agent_${agentCount + 1}`,
    });

    if (isCancel(name)) return null;

    const description = await text({
      message: "Agent description",
    });

    if (isCancel(description)) return null;

    // Ask for optional model override
    const useCustomModel = await confirm({
      message: "Use a custom model for this agent?",
      initialValue: false,
    });

    let model: string | undefined;
    if (!isCancel(useCustomModel) && useCustomModel) {
      const modelInput = await text({
        message: "Model ID (e.g. anthropic/claude-sonnet-4.5)",
        initialValue: "openrouter/owl-alpha",
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

  // Select orchestration strategy
  const strategy = await select({
    message: "Select orchestration strategy",
    options: [
      {
        value: "sequential",
        label: "Sequential (agents work one after another)",
      },
      {
        value: "parallel",
        label: "Parallel (agents work simultaneously)",
      },
      {
        value: "hierarchical",
        label: "Hierarchical (coordinator delegates)",
      },
      {
        value: "collaborative",
        label: "Collaborative (agents communicate)",
      },
    ],
  });

  if (isCancel(strategy)) return null;

  switch (strategy) {
    case "sequential":
      builder.withSequentialStrategy();
      break;
    case "parallel":
      builder.withParallelStrategy(3, 30000);
      break;
    case "hierarchical":
      builder.withHierarchicalStrategy();
      break;
    case "collaborative":
      builder.withCollaborativeStrategy(60000);
      break;
  }

  // Optional: enable retry
  const enableRetry = await select({
    message: "Enable retry on failure?",
    options: [
      { value: "yes", label: "Yes, retry up to 2 times" },
      { value: "no", label: "No, fail fast" },
    ],
  });

  if (!isCancel(enableRetry) && enableRetry === "yes") {
    builder.withRetryOnFailure(2);
  }

  return builder.build();
}

/**
 * Let user select tools for a custom agent
 */
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

  const selected: string[] = [];

  // Always include read_file as a base tool
  selected.push("read_file");

  let addingTools = true;
  while (addingTools) {
    const remaining = availableTools.filter((t) => !selected.includes(t));
    if (remaining.length === 0) break;

    const tool = await select({
      message: `Add tool #${selected.length + 1}?`,
      options: [
        ...remaining.slice(0, 15).map((t) => ({
          value: t,
          label: t,
        })),
        { value: "done", label: "Done adding tools" },
      ],
    });

    if (isCancel(tool)) return null;

    if (tool === "done") {
      addingTools = false;
      break;
    }

    selected.push(tool);
  }

  return selected;
}

/**
 * Display execution results with detailed breakdown
 */
function displayExecutionResults(orchestrator: MultiAgentOrchestrator): void {
  const summary = orchestrator.getSummary();

  console.log(chalk.bold("\n📊 Execution Summary\n"));

  // Basic stats
  const statusColor =
    summary.status === "completed" ? chalk.green : chalk.red;
  const statusIcon = summary.status === "completed" ? "✓" : "✗";
  console.log(`Status: ${statusColor(`${statusIcon} ${summary.status}`)}`);
  console.log(`Strategy: ${summary.strategy}`);
  console.log(
    `Duration: ${summary.duration ? `${summary.duration}ms` : "Still running"}`,
  );

  // Pool stats
  console.log(chalk.bold("\n🤖 Agent Pool Stats\n"));
  console.log(`Total Agents: ${summary.poolStats.totalAgents}`);
  console.log(`Active: ${summary.poolStats.activeAgents}`);
  console.log(`Waiting: ${summary.poolStats.waitingAgents}`);
  console.log(`Failed: ${chalk.red(String(summary.poolStats.failedAgents))}`);
  console.log(
    `Overall Completion: ${chalk.cyan(`${summary.poolStats.completionPercentage}%`)}`,
  );

  // Agent execution results
  console.log(chalk.bold("\n🔍 Agent Execution Results\n"));
  for (const result of summary.executionResults) {
    const icon = result.success ? chalk.green("✓") : chalk.red("✗");
    const role = chalk.dim(`(${result.role})`);
    console.log(`${icon} ${chalk.bold(result.agentId)} ${role}`);
    console.log(`   Steps: ${result.steps}`);
  }

  // Task tracking
  console.log(chalk.bold("\n✅ Task Tracking\n"));
  console.log(
    `Completed Tasks: ${chalk.green(String(summary.completedTasks))}`,
  );
  console.log(`Failed Tasks: ${chalk.red(String(summary.failedTasks))}`);

  // Detailed timeline
  const timeline = orchestrator.getTimeline();
  if (timeline.length > 0) {
    console.log(chalk.bold("\n📈 Detailed Timeline\n"));
    for (const entry of timeline) {
      const status = entry.success
        ? chalk.green("Success")
        : chalk.red("Failed");
      console.log(`[${entry.agentId}] ${status}`);

      if (entry.output) {
        const preview = entry.output.slice(0, 200);
        console.log(chalk.dim(`  Output: ${preview}...`));
      }

      if (entry.executedTools.length > 0) {
        console.log(chalk.dim(`  Tools: ${entry.executedTools.join(", ")}`));
      }

      if (entry.error) {
        console.log(chalk.red(`  Error: ${entry.error.message}`));
      }
    }
  }

  // Message history (if collaborative)
  const messages = orchestrator.getMessageHistory();
  if (messages.length > 0) {
    console.log(chalk.bold("\n💬 Agent Communications\n"));
    for (const msg of messages.slice(-3)) {
      const target = msg.toAgentId ? `→ ${msg.toAgentId}` : "→ all";
      console.log(`${chalk.cyan(msg.fromAgentId)} ${target}: ${msg.type}`);
      console.log(chalk.dim(`  ${msg.content.slice(0, 100)}...`));
    }
  }
}

/**
 * Export for main application integration
 */
export default {
  runMultiAgentMode,
  selectTemplate,
  buildCustomWorkflow,
  displayExecutionResults,
};
