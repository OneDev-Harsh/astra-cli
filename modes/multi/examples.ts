import chalk from "chalk";
import { MultiAgentOrchestrator } from "./multi-agent-orchestrator";
import { WorkflowBuilder, WorkflowTemplates } from "./workflow-builder";
import { withSpinner } from "../../tui/spinner";

/**
 * Example: Code review with inline failure handling
 */
export async function exampleCodeReviewWorkflow(): Promise<void> {
  console.log(chalk.bold("\n🤝 Code Review Workflow\n"));

  const workflow = new WorkflowBuilder(
    "review_001",
    "Review the authentication module for security vulnerabilities",
  )
    .addResearcher(
      "security_analyzer",
      "Security Analyzer",
      "Analyzes code for security vulnerabilities and best practices",
    )
    .addImplementer(
      "code_improver",
      "Code Improver",
      "Fixes identified security issues and improves code",
    )
    .addReviewer(
      "qa_validator",
      "QA Validator",
      "Validates that all security fixes are properly implemented",
    )
    .withSequentialStrategy()
    .withRetryOnFailure(1)
    .withExpectedOutput("Security audit report with fixes applied")
    .build();

  const validation = new WorkflowBuilder(workflow.id, workflow.goal).validate();
  if (!validation.isValid) {
    console.log(chalk.red("❌ Validation failed:"));
    validation.errors.forEach((e) => console.log(chalk.red(`  • ${e}`)));
    return;
  }

  const orchestrator = new MultiAgentOrchestrator(workflow);

  // Listen to events
  const unsubscribe = orchestrator.onEvent((event) => {
    if (event.type === "agent:complete") {
      console.log(chalk.dim(`  ✓ ${event.agentId} completed`));
    } else if (event.type === "agent:failed") {
      console.log(chalk.red(`  ✗ ${event.agentId} failed`));
    }
  });

  await withSpinner(
    {
      message: "Orchestrating review workflow...",
      doneMessage: "workflow completed",
      failMessage: "workflow failed",
    },
    () => orchestrator.execute(),
  );

  unsubscribe();

  const summary = orchestrator.getSummary();
  console.log(chalk.bold("\n📊 Results\n"));
  console.log(`Status: ${chalk.green(summary.status)}`);
  console.log(`Duration: ${summary.duration}ms`);
  console.log(`Completed: ${summary.completedTasks}`);
  console.log(`Failed: ${summary.failedTasks}`);
}

/**
 * Example: Parallel feature development with multiple models
 */
export async function exampleParallelDevelopment(): Promise<void> {
  console.log(chalk.bold("\n⚡ Parallel Feature Development\n"));

  const workflow = WorkflowTemplates.featureDevelopmentWorkflow(
    "feature_dev_001",
    "Implement user authentication with OAuth2 support",
  );

  const orchestrator = new MultiAgentOrchestrator(workflow);

  await withSpinner(
    {
      message: "Executing parallel feature development...",
      doneMessage: "feature development completed",
      failMessage: "feature development failed",
    },
    () => orchestrator.execute(),
  );

  console.log(chalk.bold("\n✅ Feature Development Complete\n"));
  const timeline = orchestrator.getTimeline();

  for (const result of timeline) {
    if (result.success) {
      console.log(chalk.green(`✓ ${result.agentId} (${result.durationMs}ms)`));
      if (result.output) {
        console.log(chalk.dim(`  Output: ${result.output.slice(0, 80)}...`));
      }
    } else {
      console.log(chalk.red(`✗ ${result.agentId}`));
      if (result.error) {
        console.log(chalk.dim(`  Error: ${result.error.message}`));
      }
    }
  }
}

/**
 * Example: Collaborative bug investigation
 */
export async function exampleCollaborativeBugFix(): Promise<void> {
  console.log(chalk.bold("\n🐛 Collaborative Bug Investigation\n"));

  const workflow = new WorkflowBuilder(
    "bugfix_001",
    "The login endpoint returns 500 errors intermittently",
  )
    .addResearcher(
      "bug_analyzer",
      "Bug Analyzer",
      "Analyzes error logs and traces the source of the issue",
    )
    .addResearcher(
      "test_investigator",
      "Test Investigator",
      "Writes tests to reproduce the bug",
    )
    .addImplementer(
      "bug_fixer",
      "Bug Fixer",
      "Implements the fix based on findings",
    )
    .withCollaborativeStrategy(60_000)
    .withExpectedOutput("Fixed login endpoint with regression tests")
    .build();

  const orchestrator = new MultiAgentOrchestrator(workflow);

  await withSpinner(
    {
      message: "Investigating bug with collaborative agents...",
      doneMessage: "investigation complete",
      failMessage: "investigation failed",
    },
    () => orchestrator.execute(),
  );

  const messages = orchestrator.getMessageHistory();
  if (messages.length > 0) {
    console.log(chalk.bold("\n💬 Agent Communication\n"));
    for (const msg of messages.slice(-5)) {
      console.log(`${chalk.cyan(msg.fromAgentId)} → ${msg.toAgentId || "all"}: ${msg.type}`);
      console.log(chalk.dim(`  ${msg.content.slice(0, 80)}...`));
    }
  }
}

/**
 * Example: Advanced DAG workflow with full-stack development
 */
export async function exampleAdvancedDAGWorkflow(): Promise<void> {
  console.log(chalk.bold("\n🚀 Full-Stack Development (DAG)\n"));

  const workflow = WorkflowTemplates.fullStackFeatureWorkflow(
    "fullstack_001",
    "Build a new user profile management feature with database, API, and UI",
  );

  console.log(chalk.dim("Dependencies:"));
  for (const agent of workflow.agents) {
    const deps = agent.dependsOn?.join(", ") || "(root)";
    console.log(chalk.dim(`  ${agent.name} ← ${deps}`));
  }
  console.log();

  const orchestrator = new MultiAgentOrchestrator(workflow);

  // Log events in real-time
  orchestrator.onEvent((event) => {
    if (event.type === "agent:start") {
      console.log(chalk.cyan(`→ ${event.agentId} starting`));
    } else if (event.type === "agent:complete") {
      const duration = event.payload?.duration;
      console.log(chalk.green(`✓ ${event.agentId} done${duration ? ` (${duration}ms)` : ""}`));
    }
  });

  await withSpinner(
    {
      message: "Executing DAG workflow...",
      doneMessage: "all stages completed",
      failMessage: "workflow encountered errors",
    },
    () => orchestrator.execute(),
  );

  const summary = orchestrator.getSummary();
  console.log(chalk.bold("\n📈 Detailed Report\n"));
  console.log(`Total Duration: ${summary.duration}ms`);
  console.log(`Agents: ${summary.totalAgents}`);
  console.log(`Completed: ${chalk.green(String(summary.completedTasks))}`);
  console.log(`Failed: ${chalk.red(String(summary.failedTasks))}`);
  console.log();

  for (const result of summary.executionResults) {
    const icon = result.success ? chalk.green("✓") : chalk.red("✗");
    console.log(`${icon} ${chalk.bold(result.agentId)} (${result.role})`);
    console.log(`   Duration: ${result.durationMs}ms, Steps: ${result.steps}`);
  }
}

/**
 * Example: Security audit with parallel reviewers
 */
export async function exampleSecurityAudit(): Promise<void> {
  console.log(chalk.bold("\n🔒 Security Audit (Parallel)\n"));

  const workflow = WorkflowTemplates.securityAuditWorkflow(
    "audit_001",
    "Full security audit of the payment processing module",
  );

  const orchestrator = new MultiAgentOrchestrator(workflow);

  // Track which agents are running
  const running = new Set<string>();
  orchestrator.onEvent((event) => {
    if (event.type === "agent:start" && event.agentId) {
      running.add(event.agentId);
      console.log(chalk.cyan(`→ [${running.size}] ${event.agentId}`));
    } else if (event.type === "agent:complete" && event.agentId) {
      running.delete(event.agentId);
      console.log(chalk.green(`✓ [${running.size}] ${event.agentId}`));
    }
  });

  await withSpinner(
    {
      message: "Running security audit...",
      doneMessage: "audit completed",
      failMessage: "audit failed",
    },
    () => orchestrator.execute(),
  );

  const summary = orchestrator.getSummary();
  console.log(chalk.bold("\n🔍 Audit Summary\n"));
  console.log(`Status: ${summary.status}`);
  console.log(`Duration: ${summary.duration}ms`);

  console.log(chalk.bold("\n📋 Agent Reports\n"));
  const timeline = orchestrator.getTimeline();
  for (const result of timeline) {
    if (result.success) {
      console.log(chalk.green(`✓ ${result.agentId}`));
      console.log(chalk.dim(`  ${result.output.slice(0, 150)}...`));
    }
  }
}

/**
 * Example: Multi-model orchestration — different models for different agents
 */
export async function exampleMultiModelOrchestration(): Promise<void> {
  console.log(chalk.bold("\n🧠 Multi-Model Orchestration\n"));

  const workflow = new WorkflowBuilder(
    "multimodel_001",
    "Refactor API layer to clean architecture",
  )
    .addCoordinator(
      "architect",
      "Software Architect",
      "Designs clean architecture and creates refactoring plan",
      { model: "anthropic/claude-opus-4" }, // Strongest model
    )
    .addImplementer(
      "refactor_impl",
      "Refactoring Implementer",
      "Executes the refactoring plan",
      { model: "anthropic/claude-3.5-sonnet" }, // Fast & capable
    )
    .addReviewer(
      "test_validator",
      "Test Validator",
      "Writes and runs tests to verify refactoring",
    ) // Uses default
    .withHierarchicalStrategy()
    .withRetryOnFailure(1)
    .build();

  console.log(chalk.bold("Model Assignments:\n"));
  for (const agent of workflow.agents) {
    const model = agent.model ? chalk.cyan(agent.model) : chalk.dim("(default)");
    console.log(`  ${chalk.bold(agent.name)}: ${model}`);
  }
  console.log();

  const orchestrator = new MultiAgentOrchestrator(workflow);

  await withSpinner(
    {
      message: "Running multi-model orchestration...",
      doneMessage: "orchestration complete",
      failMessage: "orchestration failed",
    },
    () => orchestrator.execute(),
  );

  const summary = orchestrator.getSummary();
  console.log(chalk.bold("\n📊 Results\n"));
  for (const result of summary.executionResults) {
    const icon = result.success ? chalk.green("✓") : chalk.red("✗");
    const agent = workflow.agents.find((a) => a.id === result.agentId);
    const model = agent?.model ? chalk.cyan(`[${agent.model}]`) : chalk.dim("[default]");
    console.log(`${icon} ${chalk.bold(result.agentId)} ${model}`);
    console.log(`   ${result.durationMs}ms, ${result.steps} steps`);
  }
}

/**
 * Example: Error handling and retry logic
 */
export async function exampleErrorHandling(): Promise<void> {
  console.log(chalk.bold("\n⚠️  Error Handling & Retry\n"));

  const workflow = new WorkflowBuilder(
    "error_handling_001",
    "Test error recovery with retries",
  )
    .addImplementer(
      "risky_impl",
      "Risky Implementer",
      "An agent that might fail and will retry",
    )
    .addReviewer(
      "fallback_reviewer",
      "Fallback Reviewer",
      "Reviews if main impl fails",
    )
    .withParallelStrategy(2, 20_000)
    .withRetryOnFailure(3)
    .withFailureMode("continue")
    .build();

  console.log(chalk.dim("Config:"));
  console.log(chalk.dim(`  - Max retries: 3`));
  console.log(chalk.dim(`  - Failure mode: continue`));
  console.log(chalk.dim(`  - Timeout: 20s per agent\n`));

  const orchestrator = new MultiAgentOrchestrator(workflow);

  orchestrator.onEvent((event) => {
    if (event.type === "agent:retry") {
      const attempt = event.payload?.attempt || 1;
      console.log(chalk.yellow(`↻ ${event.agentId} retry attempt ${attempt}`));
    }
  });

  await withSpinner(
    {
      message: "Running with error handling...",
      doneMessage: "completed",
      failMessage: "failed",
    },
    () => orchestrator.execute(),
  );

  const summary = orchestrator.getSummary();
  console.log(chalk.bold("\n📊 Retry Statistics\n"));
  for (const result of summary.executionResults) {
    console.log(
      `${result.agentId}: attempt ${result.attemptNumber} - ${result.success ? "✓" : "✗"}`,
    );
  }
}

/**
 * Example: Event-driven monitoring
 */
export async function exampleEventDrivenMonitoring(): Promise<void> {
  console.log(chalk.bold("\n📡 Event-Driven Monitoring\n"));

  const workflow = new WorkflowBuilder("events_001", "Demo event monitoring")
    .addResearcher("researcher", "Researcher", "Gathers info")
    .addImplementer("impl", "Implementer", "Implements", { dependsOn: ["researcher"] })
    .addReviewer("reviewer", "Reviewer", "Reviews", { dependsOn: ["impl"] })
    .withDagStrategy(2, 30_000)
    .build();

  const orchestrator = new MultiAgentOrchestrator(workflow);

  const eventCounts = {
    "agent:start": 0,
    "agent:complete": 0,
    "agent:failed": 0,
    "workflow:start": 0,
    "workflow:complete": 0,
  };

  orchestrator.onEvent((event) => {
    const key = event.type as keyof typeof eventCounts;
    if (key in eventCounts) eventCounts[key]++;

    const icon =
      event.type.includes("complete") || event.type === "workflow:start"
        ? chalk.green("✓")
        : chalk.red("✗");
    console.log(`${icon} ${event.type}`);
  });

  await withSpinner(
    {
      message: "Monitoring events...",
      doneMessage: "completed",
      failMessage: "failed",
    },
    () => orchestrator.execute(),
  );

  console.log(chalk.bold("\n📊 Event Summary\n"));
  for (const [type, count] of Object.entries(eventCounts)) {
    console.log(`${type}: ${count}`);
  }
}

export default {
  exampleCodeReviewWorkflow,
  exampleParallelDevelopment,
  exampleCollaborativeBugFix,
  exampleAdvancedDAGWorkflow,
  exampleSecurityAudit,
  exampleMultiModelOrchestration,
  exampleErrorHandling,
  exampleEventDrivenMonitoring,
};