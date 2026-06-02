import chalk from "chalk";
import { MultiAgentOrchestrator } from "./multi-agent-orchestrator";
import { WorkflowBuilder, WorkflowTemplates } from "./workflow-builder";
import { withSpinner } from "../../tui/spinner";

/**
 * Example: Simple sequential code review workflow
 */
export async function exampleCodeReviewWorkflow(): Promise<void> {
  console.log(chalk.bold("\n🤝 Multi-Agent Code Review\n"));

  // Build a custom workflow
  const workflow = new WorkflowBuilder(
    "review_workflow_001",
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
    .build();

  // Validate before execution
  const validator = new WorkflowBuilder(workflow.id, workflow.goal);
  for (const agent of workflow.agents) {
    validator.addAgent(agent);
  }
  validator.getWorkflow().strategy = workflow.strategy;
  const validation = validator.validate();

  if (!validation.isValid) {
    console.log(chalk.red("❌ Workflow validation failed:"));
    for (const error of validation.errors) {
      console.log(chalk.red(`  • ${error}`));
    }
    return;
  }

  // Execute the workflow
  const orchestrator = new MultiAgentOrchestrator(workflow);

  await withSpinner(
    {
      message: "Orchestrating multi-agent workflow...",
      doneMessage: "workflow completed",
      failMessage: "workflow failed",
    },
    () => orchestrator.execute(),
  );

  // Display results
  console.log(chalk.bold("\n📊 Execution Summary\n"));
  const summary = orchestrator.getSummary();
  console.log(`Status: ${chalk.green(summary.status)}`);
  console.log(`Strategy: ${summary.strategy}`);
  console.log(`Duration: ${summary.duration}ms`);
  console.log(`Total Agents: ${summary.totalAgents}`);
  console.log(`Completed Tasks: ${chalk.green(String(summary.completedTasks))}`);
  console.log(`Failed Tasks: ${chalk.red(String(summary.failedTasks))}`);

  console.log(chalk.bold("\n🔍 Agent Execution Timeline\n"));
  for (const exec of summary.executionResults) {
    const status = exec.success ? chalk.green("✓") : chalk.red("✗");
    console.log(
      `${status} ${chalk.bold(exec.agentId)} (${exec.role}) - ${exec.steps} steps`,
    );
  }
}

/**
 * Example: Parallel feature development workflow
 */
export async function exampleParallelDevelopment(): Promise<void> {
  console.log(chalk.bold("\n⚡ Parallel Feature Development\n"));

  // Use predefined template
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
      console.log(chalk.green(`✓ ${result.agentId} completed successfully`));
      if (result.output) {
        console.log(
          chalk.dim(`  Output preview: ${result.output.slice(0, 100)}...`),
        );
      }
    } else {
      console.log(chalk.red(`✗ ${result.agentId} failed`));
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
    .withCollaborativeStrategy(60000)
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

  // Display conversation history
  const messages = orchestrator.getMessageHistory();
  if (messages.length > 0) {
    console.log(chalk.bold("\n💬 Agent Communication History\n"));
    for (const msg of messages.slice(-5)) {
      // Show last 5 messages
      console.log(
        `${chalk.cyan(msg.fromAgentId)} → ${msg.toAgentId || "all"}: ${msg.type}`,
      );
      console.log(chalk.dim(`  ${msg.content.slice(0, 80)}...`));
    }
  }
}

/**
 * Advanced example: Custom multi-stage workflow with per-agent models
 */
export async function exampleAdvancedWorkflow(): Promise<void> {
  console.log(
    chalk.bold("\n🚀 Advanced Multi-Stage Development Workflow\n"),
  );

  const workflow = new WorkflowBuilder(
    "advanced_001",
    "Implement a new payment processing module with full test coverage",
  )
    // Stage 1: Research
    .addResearcher(
      "payment_researcher",
      "Payment Researcher",
      "Researches payment processing requirements and best practices",
      // Use a fast, cheap model for research
      { model: "anthropic/claude-3.5-sonnet" },
    )

    // Stage 2: Implementation (parallel)
    .addImplementer(
      "payment_impl",
      "Payment Implementation",
      "Implements payment processing logic",
    )
    .addImplementer(
      "integration_impl",
      "Integration Implementation",
      "Integrates with payment gateways",
    )

    // Stage 3: Validation
    .addReviewer(
      "security_reviewer",
      "Security Reviewer",
      "Reviews for security vulnerabilities",
    )
    .addReviewer(
      "compliance_reviewer",
      "Compliance Reviewer",
      "Ensures PCI compliance",
    )

    // Configure workflow
    .withHierarchicalStrategy()
    .withRetryOnFailure(2)
    .withExpectedOutput(
      "Complete payment module with 100% test coverage and security audit",
    )
    .build();

  // Validate workflow
  const validator = new WorkflowBuilder(workflow.id, workflow.goal);
  for (const agent of workflow.agents) {
    validator.addAgent(agent);
  }
  validator.getWorkflow().strategy = workflow.strategy;
  const validation = validator.validate();

  if (!validation.isValid) {
    console.log(chalk.red("Validation errors:"));
    validation.errors.forEach((e) => console.log(chalk.red(`  • ${e}`)));
    return;
  }

  // Execute with detailed monitoring
  const orchestrator = new MultiAgentOrchestrator(workflow);
  console.log(chalk.blue(`Workflow ID: ${workflow.id}`));
  console.log(chalk.blue(`Agents: ${workflow.agents.length}`));
  console.log(chalk.blue(`Strategy: ${workflow.strategy.type}\n`));

  await withSpinner(
    {
      message: "Executing advanced multi-stage workflow...",
      doneMessage: "all stages completed",
      failMessage: "workflow encountered errors",
    },
    () => orchestrator.execute(),
  );

  // Detailed results
  const summary = orchestrator.getSummary();
  console.log(chalk.bold("\n📈 Detailed Execution Report\n"));
  console.log(`Total Duration: ${summary.duration}ms`);
  console.log(`Pool Statistics:`);
  console.log(`  • Active: ${summary.poolStats.activeAgents}`);
  console.log(`  • Waiting: ${summary.poolStats.waitingAgents}`);
  console.log(`  • Failed: ${summary.poolStats.failedAgents}`);
  console.log(`  • Completion: ${summary.poolStats.completionPercentage}%`);

  console.log(chalk.bold("\n🎯 Agent Results\n"));
  for (const result of summary.executionResults) {
    const icon = result.success ? chalk.green("✓") : chalk.red("✗");
    console.log(
      `${icon} ${chalk.bold(result.agentId)} (${result.role}) - ${result.steps} steps`,
    );
  }
}

/**
 * Example: Multi-model orchestration — each agent uses a different model
 */
export async function exampleMultiModelOrchestration(): Promise<void> {
  console.log(chalk.bold("\n🧠 Multi-Model Orchestration\n"));
  console.log(
    chalk.dim(
      "This example demonstrates using different models for different agent roles.\n",
    ),
  );

  const workflow = new WorkflowBuilder(
    "multimodel_001",
    "Refactor the API layer to use a clean architecture pattern",
  )
    // Use a strong model for architecture decisions
    .addCoordinator(
      "architect",
      "Software Architect",
      "Designs the clean architecture and creates the refactoring plan",
      { model: "anthropic/claude-sonnet-4.5" },
    )
    // Use a fast model for implementation
    .addImplementer(
      "refactor_impl",
      "Refactoring Implementer",
      "Executes the refactoring plan",
      { model: "anthropic/claude-3.5-sonnet" },
    )
    // Use a model good at testing
    .addReviewer(
      "test_validator",
      "Test Validator",
      "Writes and runs tests to verify the refactoring",
    )
    .withHierarchicalStrategy()
    .withRetryOnFailure(1)
    .build();

  // Show model assignments
  console.log(chalk.bold("Model Assignments:\n"));
  for (const agent of workflow.agents) {
    const modelInfo = agent.model
      ? chalk.cyan(agent.model)
      : chalk.dim("(default)");
    console.log(`  ${chalk.bold(agent.name)}: ${modelInfo}`);
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
  console.log(chalk.bold("\n📊 Multi-Model Results\n"));
  for (const result of summary.executionResults) {
    const agent = workflow.agents.find((a) => a.id === result.agentId);
    const icon = result.success ? chalk.green("✓") : chalk.red("✗");
    const model = agent?.model ?? chalk.dim("(default)");
    console.log(
      `${icon} ${chalk.bold(result.agentId)} [${model}] (${result.role}) - ${result.steps} steps`,
    );
  }
}

/**
 * Interactive workflow creation and execution
 */
export async function interactiveMultiAgentMode(): Promise<void> {
  console.log(chalk.bold("\n🤖 Interactive Multi-Agent Mode\n"));

  // For now, run the advanced example
  // In a real app, this would have CLI prompts
  await exampleAdvancedWorkflow();
}

export default {
  exampleCodeReviewWorkflow,
  exampleParallelDevelopment,
  exampleCollaborativeBugFix,
  exampleAdvancedWorkflow,
  exampleMultiModelOrchestration,
  interactiveMultiAgentMode,
};
