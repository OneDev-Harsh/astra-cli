import type {
  AgentConfig,
  MultiAgentWorkflow,
  OrchestrationStrategy,
  StrategyType,
  StrategyConfig,
} from "./types";

// ─── WorkflowBuilder ─────────────────────────────────────────────────────────

/**
 * Fluent builder for creating multi-agent workflows.
 * Supports all strategy types including DAG (dependency-aware) execution.
 */
export class WorkflowBuilder {
  private workflow: MultiAgentWorkflow;

  constructor(workflowId: string, goal: string) {
    this.workflow = {
      id: workflowId,
      goal,
      agents: [],
      strategy: {
        type: "sequential",
        config: { failureMode: "fail-fast" },
      },
      initialPrompt: goal,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // ─── Agent Additions ───────────────────────────────────────────────────────

  addAgent(config: AgentConfig): this {
    this.workflow.agents.push(config);
    this.workflow.updatedAt = new Date();
    return this;
  }

  addResearcher(
    id: string,
    name: string,
    description: string,
    options?: AgentOptions,
  ): this {
    return this.addAgent({
      id,
      role: "researcher",
      name,
      description,
      model: options?.model,
      systemPrompt: options?.systemPrompt,
      maxSteps: options?.maxSteps ?? 30,
      dependsOn: options?.dependsOn,
      timeoutMs: options?.timeoutMs,
      tags: options?.tags,
      tools: [
        "read_file",
        "read_multiple_files",
        "list_files",
        "search_files",
        "analyze_codebase",
        "grep",
        "web_search",
        "fetch_url",
        "git_status",
        "git_log",
        "git_diff",
        "detect_framework",
        "read_package_json",
        "read_skill",
        "list_skills",
        "show_pending_changes",
      ],
    });
  }

  addImplementer(
    id: string,
    name: string,
    description: string,
    options?: AgentOptions,
  ): this {
    return this.addAgent({
      id,
      role: "implementer",
      name,
      description,
      model: options?.model,
      systemPrompt: options?.systemPrompt,
      maxSteps: options?.maxSteps ?? 50,
      dependsOn: options?.dependsOn,
      timeoutMs: options?.timeoutMs,
      tags: options?.tags,
      tools: [
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
        "show_pending_changes",
        "apply_changes",
      ],
    });
  }

  addReviewer(
    id: string,
    name: string,
    description: string,
    options?: AgentOptions,
  ): this {
    return this.addAgent({
      id,
      role: "reviewer",
      name,
      description,
      model: options?.model,
      systemPrompt: options?.systemPrompt,
      maxSteps: options?.maxSteps ?? 25,
      dependsOn: options?.dependsOn,
      timeoutMs: options?.timeoutMs,
      tags: options?.tags,
      tools: [
        "read_file",
        "read_multiple_files",
        "list_files",
        "search_files",
        "analyze_codebase",
        "grep",
        "git_status",
        "git_log",
        "git_diff",
        "run_tests",
        "run_test_file",
        "lint_project",
        "detect_framework",
        "show_pending_changes",
      ],
    });
  }

  addCoordinator(
    id: string,
    name: string,
    description: string,
    options?: AgentOptions,
  ): this {
    return this.addAgent({
      id,
      role: "coordinator",
      name,
      description,
      model: options?.model,
      systemPrompt: options?.systemPrompt,
      maxSteps: options?.maxSteps ?? 20,
      dependsOn: options?.dependsOn,
      timeoutMs: options?.timeoutMs,
      tags: options?.tags,
      tools: [
        "read_file",
        "list_files",
        "search_files",
        "analyze_codebase",
        "git_status",
        "detect_framework",
        "create_plan",
        "get_plan",
      ],
    });
  }

  addCustomAgent(
    id: string,
    name: string,
    description: string,
    tools: string[],
    options?: AgentOptions,
  ): this {
    return this.addAgent({
      id,
      role: "custom",
      name,
      description,
      model: options?.model,
      systemPrompt: options?.systemPrompt,
      maxSteps: options?.maxSteps ?? 30,
      dependsOn: options?.dependsOn,
      timeoutMs: options?.timeoutMs,
      tags: options?.tags,
      tools,
    });
  }

  // ─── Strategy ──────────────────────────────────────────────────────────────

  withSequentialStrategy(config?: Partial<StrategyConfig>): this {
    this.workflow.strategy = {
      type: "sequential",
      config: { failureMode: "fail-fast", ...config },
    };
    return this._touch();
  }

  withParallelStrategy(maxConcurrent = 3, timeout = 30_000, config?: Partial<StrategyConfig>): this {
    this.workflow.strategy = {
      type: "parallel",
      config: { maxConcurrentAgents: maxConcurrent, timeout, failureMode: "continue", ...config },
    };
    return this._touch();
  }

  withHierarchicalStrategy(config?: Partial<StrategyConfig>): this {
    this.workflow.strategy = {
      type: "hierarchical",
      config: { failureMode: "fail-fast", ...config },
    };
    return this._touch();
  }

  withCollaborativeStrategy(timeout = 60_000, config?: Partial<StrategyConfig>): this {
    this.workflow.strategy = {
      type: "collaborative",
      config: { timeout, failureMode: "continue", ...config },
    };
    return this._touch();
  }

  /**
   * DAG strategy: agents run as soon as all their `dependsOn` are satisfied.
   * You must set `dependsOn` on each AgentConfig that has prerequisites.
   */
  withDagStrategy(maxConcurrent = 4, timeout = 60_000, config?: Partial<StrategyConfig>): this {
    this.workflow.strategy = {
      type: "dag",
      config: {
        maxConcurrentAgents: maxConcurrent,
        timeout,
        failureMode: "fail-at-end",
        ...config,
      },
    };
    return this._touch();
  }

  withRetryOnFailure(maxRetries = 2): this {
    this.workflow.strategy.config.retryOnFailure = true;
    this.workflow.strategy.config.maxRetries = maxRetries;
    return this._touch();
  }

  withFallbackAgents(agentIds: string[]): this {
    this.workflow.strategy.config.fallbackAgents = agentIds;
    return this._touch();
  }

  withFailureMode(mode: StrategyConfig["failureMode"]): this {
    this.workflow.strategy.config.failureMode = mode;
    return this._touch();
  }

  withExpectedOutput(description: string): this {
    this.workflow.expectedOutput = description;
    return this._touch();
  }

  withMeta(meta: Record<string, unknown>): this {
    this.workflow.meta = { ...this.workflow.meta, ...meta };
    return this._touch();
  }

  // ─── Build & Inspect ───────────────────────────────────────────────────────

  build(): MultiAgentWorkflow {
    return { ...this.workflow, agents: [...this.workflow.agents] };
  }

  getWorkflow(): MultiAgentWorkflow {
    return this.workflow;
  }

  // ─── Validation ────────────────────────────────────────────────────────────

  static validateWorkflow(
  workflow: MultiAgentWorkflow
): ValidationResult {

  const builder = new WorkflowBuilder(
    workflow.id,
    workflow.goal
  );

  builder.getWorkflow().agents.push(
    ...workflow.agents
  );

  return builder.validate();
}

  validate(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.workflow.id.trim()) errors.push("Workflow ID is required");
    if (!this.workflow.goal.trim()) errors.push("Goal is required");
    console.log(
    "Workflow agents:",
    this.workflow.agents.length
);
    if (this.workflow.agents.length === 0)
      errors.push("At least one agent is required");

    // Duplicate IDs
    const agentIds = this.workflow.agents.map((a) => a.id);
    const seen = new Set<string>();
    const duplicates = agentIds.filter((id) => {
      if (seen.has(id)) return true;
      seen.add(id);
      return false;
    });
    if (duplicates.length > 0)
      errors.push(`Duplicate agent IDs: ${duplicates.join(", ")}`);

    // Per-agent checks
    for (const agent of this.workflow.agents) {
      if (!agent.id.trim())
        errors.push("Agent ID cannot be empty");
      if (!agent.name.trim())
        errors.push(`Agent name cannot be empty (id: ${agent.id})`);
      if (agent.maxSteps <= 0)
        errors.push(`Agent ${agent.id}: maxSteps must be > 0`);
      if (agent.tools.length === 0)
        errors.push(`Agent ${agent.id}: must have at least one tool`);
      if (agent.timeoutMs !== undefined && agent.timeoutMs <= 0)
        errors.push(`Agent ${agent.id}: timeoutMs must be > 0`);

      // Dependency checks
      for (const dep of agent.dependsOn ?? []) {
        if (!agentIds.includes(dep))
          errors.push(`Agent ${agent.id}: dependency '${dep}' not found`);
        if (dep === agent.id)
          errors.push(`Agent ${agent.id}: cannot depend on itself`);
      }
    }

    // DAG cycle detection
    if (this.workflow.strategy.type === "dag") {
      const cycle = this._detectCycle();
      if (cycle) errors.push(`Dependency cycle detected: ${cycle}`);
    }

    // Strategy-specific checks
    const validStrategies: StrategyType[] = [
      "sequential", "parallel", "hierarchical", "collaborative", "dag",
    ];
    if (!validStrategies.includes(this.workflow.strategy.type))
      errors.push(`Invalid strategy type: ${this.workflow.strategy.type}`);

    if (
      this.workflow.strategy.type === "hierarchical" &&
      !this.workflow.agents.some((a) => a.role === "coordinator")
    ) {
      errors.push("Hierarchical strategy requires a coordinator agent");
    }

    if (
      this.workflow.strategy.type === "collaborative" &&
      this.workflow.agents.length > 1 &&
      !this.workflow.strategy.config.timeout
    ) {
      warnings.push(
        "Collaborative strategy with multiple agents should have a timeout configured",
      );
    }

    // Fallback agent existence
    for (const fid of this.workflow.strategy.config.fallbackAgents ?? []) {
      if (!agentIds.includes(fid))
        errors.push(`Fallback agent '${fid}' not found in workflow agents`);
    }

    // Warn if DAG strategy used but no agent has dependsOn
    if (
      this.workflow.strategy.type === "dag" &&
      this.workflow.agents.every((a) => !a.dependsOn?.length)
    ) {
      warnings.push(
        "DAG strategy selected but no agent has dependsOn — consider using parallel instead",
      );
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  private _detectCycle(): string | null {
    const graph = new Map<string, string[]>();
    for (const agent of this.workflow.agents) {
      graph.set(agent.id, agent.dependsOn ?? []);
    }

    const visited = new Set<string>();
    const stack = new Set<string>();

    const dfs = (id: string, path: string[]): string | null => {
      if (stack.has(id)) return [...path, id].join(" → ");
      if (visited.has(id)) return null;

      visited.add(id);
      stack.add(id);

      for (const dep of graph.get(id) ?? []) {
        const cycle = dfs(dep, [...path, id]);
        if (cycle) return cycle;
      }

      stack.delete(id);
      return null;
    };

    for (const agent of this.workflow.agents) {
      const cycle = dfs(agent.id, []);
      if (cycle) return cycle;
    }
    return null;
  }

  private _touch(): this {
    this.workflow.updatedAt = new Date();
    return this;
  }
}

// ─── Supporting Types ─────────────────────────────────────────────────────────

export interface AgentOptions {
  model?: string;
  systemPrompt?: string;
  maxSteps?: number;
  dependsOn?: string[];
  timeoutMs?: number;
  tags?: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Workflow Templates ────────────────────────────────────────────────────────

export class WorkflowTemplates {
  static codeReviewWorkflow(workflowId: string, goal: string): MultiAgentWorkflow {
    return new WorkflowBuilder(workflowId, goal)
      .addResearcher("research_agent", "Research Agent", "Analyzes the codebase and gathers requirements")
      .addImplementer("impl_agent", "Implementation Agent", "Writes and modifies code", {
        dependsOn: ["research_agent"],
      })
      .addReviewer("review_agent", "Review Agent", "Reviews code for quality and correctness", {
        dependsOn: ["impl_agent"],
      })
      .withSequentialStrategy()
      .withRetryOnFailure(1)
      .build();
  }

  static featureDevelopmentWorkflow(workflowId: string, goal: string): MultiAgentWorkflow {
    return new WorkflowBuilder(workflowId, goal)
      .addCoordinator("coordinator", "Coordinator", "Plans the feature development")
      .addImplementer("backend_dev", "Backend Developer", "Implements backend functionality", {
        dependsOn: ["coordinator"],
      })
      .addImplementer("frontend_dev", "Frontend Developer", "Implements frontend functionality", {
        dependsOn: ["coordinator"],
      })
      .addReviewer("qa_agent", "QA Agent", "Tests and validates the feature", {
        dependsOn: ["backend_dev", "frontend_dev"],
      })
      .withDagStrategy(3, 60_000)
      .build();
  }

  static bugFixingWorkflow(workflowId: string, goal: string): MultiAgentWorkflow {
    return new WorkflowBuilder(workflowId, goal)
      .addResearcher("debug_agent", "Debug Agent", "Analyzes the bug and traces its cause")
      .addImplementer("fix_agent", "Fix Agent", "Implements the bug fix", {
        dependsOn: ["debug_agent"],
      })
      .addReviewer("test_agent", "Test Agent", "Verifies the fix works correctly", {
        dependsOn: ["fix_agent"],
      })
      .withSequentialStrategy()
      .withRetryOnFailure(2)
      .build();
  }

  static collaborativeResearchWorkflow(workflowId: string, goal: string): MultiAgentWorkflow {
    return new WorkflowBuilder(workflowId, goal)
      .addResearcher("researcher_1", "Researcher 1", "Primary research")
      .addResearcher("researcher_2", "Researcher 2", "Secondary research")
      .addResearcher("researcher_3", "Researcher 3", "Validation research")
      .withParallelStrategy(3, 45_000)
      .build();
  }

  /**
   * Security audit: researcher scans, two parallel auditors review separately,
   * then a coordinator synthesizes findings — true DAG execution.
   */
  static securityAuditWorkflow(workflowId: string, goal: string): MultiAgentWorkflow {
    return new WorkflowBuilder(workflowId, goal)
      .addResearcher("scanner", "Code Scanner", "Scans codebase for potential vulnerabilities")
      .addReviewer("static_auditor", "Static Auditor", "Static analysis of security issues", {
        dependsOn: ["scanner"],
        tags: ["security"],
      })
      .addReviewer("dependency_auditor", "Dependency Auditor", "Audits third-party dependencies", {
        dependsOn: ["scanner"],
        tags: ["security"],
      })
      .addCoordinator("report_coordinator", "Report Coordinator", "Synthesizes audit findings into a report", {
        dependsOn: ["static_auditor", "dependency_auditor"],
      })
      .withDagStrategy(2, 90_000)
      .withExpectedOutput("Full security audit report with prioritized findings")
      .build();
  }

  /**
   * Full-stack feature with database, API, and frontend in parallel, then E2E tests.
   */
  static fullStackFeatureWorkflow(workflowId: string, goal: string): MultiAgentWorkflow {
    return new WorkflowBuilder(workflowId, goal)
      .addCoordinator("architect", "Architect", "Designs the system and creates specs", {
        model: "openrouter/owl-alpha",
      })
      .addImplementer("db_dev", "DB Developer", "Schema design and migrations", {
        dependsOn: ["architect"],
      })
      .addImplementer("api_dev", "API Developer", "REST/GraphQL endpoints", {
        dependsOn: ["architect"],
      })
      .addImplementer("ui_dev", "UI Developer", "Frontend components and pages", {
        dependsOn: ["architect"],
      })
      .addReviewer("integration_tester", "Integration Tester", "End-to-end integration tests", {
        dependsOn: ["db_dev", "api_dev", "ui_dev"],
      })
      .withDagStrategy(3, 120_000)
      .withRetryOnFailure(1)
      .withExpectedOutput("Full feature implementation with passing tests")
      .build();
  }
}