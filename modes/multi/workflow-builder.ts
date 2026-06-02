import type {
  AgentConfig,
  MultiAgentWorkflow,
  OrchestrationStrategy,
  AgentRole,
} from "./types";

/**
 * Fluent builder for creating multi-agent workflows
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
        config: {},
      },
      initialPrompt: goal,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Add an agent to the workflow
   */
  addAgent(config: AgentConfig): this {
    this.workflow.agents.push(config);
    this.workflow.updatedAt = new Date();
    return this;
  }

  /**
   * Add a researcher agent (read-only, gathers information)
   */
  addResearcher(
    id: string,
    name: string,
    description: string,
    options?: { model?: string; systemPrompt?: string; maxSteps?: number },
  ): this {
    return this.addAgent({
      id,
      role: "researcher",
      name,
      description,
      model: options?.model,
      systemPrompt: options?.systemPrompt,
      maxSteps: options?.maxSteps ?? 30,
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

  /**
   * Add an implementer agent (can write code)
   */
  addImplementer(
    id: string,
    name: string,
    description: string,
    options?: { model?: string; systemPrompt?: string; maxSteps?: number },
  ): this {
    return this.addAgent({
      id,
      role: "implementer",
      name,
      description,
      model: options?.model,
      systemPrompt: options?.systemPrompt,
      maxSteps: options?.maxSteps ?? 50,
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

  /**
   * Add a reviewer agent (validates and critiques)
   */
  addReviewer(
    id: string,
    name: string,
    description: string,
    options?: { model?: string; systemPrompt?: string; maxSteps?: number },
  ): this {
    return this.addAgent({
      id,
      role: "reviewer",
      name,
      description,
      model: options?.model,
      systemPrompt: options?.systemPrompt,
      maxSteps: options?.maxSteps ?? 25,
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

  /**
   * Add a coordinator agent (orchestrates others)
   */
  addCoordinator(
    id: string,
    name: string,
    description: string,
    options?: { model?: string; systemPrompt?: string; maxSteps?: number },
  ): this {
    return this.addAgent({
      id,
      role: "coordinator",
      name,
      description,
      model: options?.model,
      systemPrompt: options?.systemPrompt,
      maxSteps: options?.maxSteps ?? 20,
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

  /**
   * Add a custom agent with specific tools
   */
  addCustomAgent(
    id: string,
    name: string,
    description: string,
    tools: string[],
    options?: { model?: string; systemPrompt?: string; maxSteps?: number },
  ): this {
    return this.addAgent({
      id,
      role: "custom",
      name,
      description,
      model: options?.model,
      systemPrompt: options?.systemPrompt,
      maxSteps: options?.maxSteps ?? 30,
      tools,
    });
  }

  /**
   * Set orchestration strategy to sequential
   */
  withSequentialStrategy(): this {
    this.workflow.strategy = {
      type: "sequential",
      config: {
        retryOnFailure: false,
      },
    };
    this.workflow.updatedAt = new Date();
    return this;
  }

  /**
   * Set orchestration strategy to parallel
   */
  withParallelStrategy(
    maxConcurrent: number = 3,
    timeout: number = 30000,
  ): this {
    this.workflow.strategy = {
      type: "parallel",
      config: {
        maxConcurrentAgents: maxConcurrent,
        timeout,
      },
    };
    this.workflow.updatedAt = new Date();
    return this;
  }

  /**
   * Set orchestration strategy to hierarchical
   */
  withHierarchicalStrategy(): this {
    this.workflow.strategy = {
      type: "hierarchical",
      config: {},
    };
    this.workflow.updatedAt = new Date();
    return this;
  }

  /**
   * Set orchestration strategy to collaborative
   */
  withCollaborativeStrategy(timeout: number = 60000): this {
    this.workflow.strategy = {
      type: "collaborative",
      config: {
        timeout,
      },
    };
    this.workflow.updatedAt = new Date();
    return this;
  }

  /**
   * Enable retry on failure
   */
  withRetryOnFailure(maxRetries: number = 2): this {
    this.workflow.strategy.config.retryOnFailure = true;
    this.workflow.strategy.config.maxRetries = maxRetries;
    this.workflow.updatedAt = new Date();
    return this;
  }

  /**
   * Set fallback agents (used if primary agents fail)
   */
  withFallbackAgents(agentIds: string[]): this {
    this.workflow.strategy.config.fallbackAgents = agentIds;
    this.workflow.updatedAt = new Date();
    return this;
  }

  /**
   * Set expected output format/description
   */
  withExpectedOutput(description: string): this {
    this.workflow.expectedOutput = description;
    this.workflow.updatedAt = new Date();
    return this;
  }

  /**
   * Build and return the workflow
   */
  build(): MultiAgentWorkflow {
    this.workflow.updatedAt = new Date();
    return { ...this.workflow };
  }

  /**
   * Get current workflow state
   */
  getWorkflow(): MultiAgentWorkflow {
    return this.workflow;
  }

  /**
   * Validate the workflow configuration
   */
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.workflow.id) errors.push("Workflow ID is required");
    if (!this.workflow.goal) errors.push("Goal is required");
    if (this.workflow.agents.length === 0)
      errors.push("At least one agent is required");

    // Check for duplicate agent IDs
    const agentIds = this.workflow.agents.map((a) => a.id);
    const uniqueIds = new Set(agentIds);
    if (uniqueIds.size !== agentIds.length) {
      const duplicates = agentIds.filter(
        (id, idx) => agentIds.indexOf(id) !== idx,
      );
      errors.push(`Duplicate agent IDs found: ${duplicates.join(", ")}`);
    }

    // Check for empty agent ID or name
    for (const agent of this.workflow.agents) {
      if (!agent.id.trim()) errors.push("Agent ID cannot be empty");
      if (!agent.name.trim()) errors.push(`Agent name cannot be empty (id: ${agent.id})`);
      if (agent.maxSteps <= 0)
        errors.push(`Agent ${agent.id} must have maxSteps > 0`);
      if (agent.tools.length === 0)
        errors.push(`Agent ${agent.id} must have at least one tool`);
    }

    // Validate strategy
    const validStrategies: OrchestrationStrategy["type"][] = [
      "sequential",
      "parallel",
      "hierarchical",
      "collaborative",
    ];
    if (!validStrategies.includes(this.workflow.strategy.type)) {
      errors.push(`Invalid strategy type: ${this.workflow.strategy.type}`);
    }

    // For hierarchical strategy, ensure there's a coordinator
    if (
      this.workflow.strategy.type === "hierarchical" &&
      !this.workflow.agents.some((a) => a.role === "coordinator")
    ) {
      errors.push("Hierarchical strategy requires a coordinator agent");
    }

    // For collaborative strategy with >1 agent, warn about timeout
    if (
      this.workflow.strategy.type === "collaborative" &&
      this.workflow.agents.length > 1 &&
      !this.workflow.strategy.config.timeout
    ) {
      errors.push(
        "Collaborative strategy with multiple agents should have a timeout configured",
      );
    }

    // Validate fallback agents exist
    const fallbackIds = this.workflow.strategy.config.fallbackAgents;
    if (fallbackIds) {
      for (const fid of fallbackIds) {
        if (!this.workflow.agents.some((a) => a.id === fid)) {
          errors.push(
            `Fallback agent '${fid}' not found in workflow agents`,
          );
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Predefined workflow templates
 */
export class WorkflowTemplates {
  /**
   * Create a code review workflow: researcher → implementer → reviewer
   */
  static codeReviewWorkflow(
    workflowId: string,
    goal: string,
  ): MultiAgentWorkflow {
    return new WorkflowBuilder(workflowId, goal)
      .addResearcher(
        "research_agent",
        "Research Agent",
        "Analyzes the codebase and gathers requirements",
      )
      .addImplementer(
        "impl_agent",
        "Implementation Agent",
        "Writes and modifies code based on requirements",
      )
      .addReviewer(
        "review_agent",
        "Review Agent",
        "Reviews code for quality, style, and correctness",
      )
      .withSequentialStrategy()
      .withRetryOnFailure(1)
      .build();
  }

  /**
   * Create a feature development workflow with parallel agents
   */
  static featureDevelopmentWorkflow(
    workflowId: string,
    goal: string,
  ): MultiAgentWorkflow {
    return new WorkflowBuilder(workflowId, goal)
      .addCoordinator(
        "coordinator",
        "Coordinator",
        "Plans the feature development",
      )
      .addImplementer(
        "backend_dev",
        "Backend Developer",
        "Implements backend functionality",
      )
      .addImplementer(
        "frontend_dev",
        "Frontend Developer",
        "Implements frontend functionality",
      )
      .addReviewer("qa_agent", "QA Agent", "Tests and validates the feature")
      .withHierarchicalStrategy()
      .build();
  }

  /**
   * Create a bug fixing workflow
   */
  static bugFixingWorkflow(
    workflowId: string,
    goal: string,
  ): MultiAgentWorkflow {
    return new WorkflowBuilder(workflowId, goal)
      .addResearcher(
        "debug_agent",
        "Debug Agent",
        "Analyzes the bug and traces its cause",
      )
      .addImplementer("fix_agent", "Fix Agent", "Implements the bug fix")
      .addReviewer(
        "test_agent",
        "Test Agent",
        "Verifies the fix works correctly",
      )
      .withSequentialStrategy()
      .withRetryOnFailure(2)
      .build();
  }

  /**
   * Create a collaborative research workflow
   */
  static collaborativeResearchWorkflow(
    workflowId: string,
    goal: string,
  ): MultiAgentWorkflow {
    return new WorkflowBuilder(workflowId, goal)
      .addResearcher("researcher_1", "Researcher 1", "Primary research")
      .addResearcher("researcher_2", "Researcher 2", "Secondary research")
      .addResearcher("researcher_3", "Researcher 3", "Validation research")
      .withParallelStrategy(3, 45000)
      .build();
  }
}
