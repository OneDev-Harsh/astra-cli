import type {
  AgentConfig,
  AgentContext,
  AgentExecutionResult,
  AgentMessage,
  MultiAgentWorkflow,
  OrchestratorState,
} from "./types";
import { AgentPoolManager } from "./agent-pool-manager";
import { MessageBroker } from "./message-broker";
import { ActionTracker } from "../agent/action-tracker";
import { ToolExecutor } from "../agent/tool-executor";
import { defaultAgentConfig, type AgentConfig as SingleAgentConfig } from "../agent/types";
import { createAgentTools } from "../agent/agent-tools";
import { ToolLoopAgent, stepCountIs } from "ai";
import { getAgentModel } from "../../ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getEnv } from "../../ai/config-loader";

/**
 * Logger utility for multi-agent orchestration
 */
const orchestrationLogger = {
  info: (agentId: string, msg: string, details?: Record<string, unknown>) => {
    const timestamp = new Date().toISOString().split("T")[1]?.slice(0, 8) || "";
    const agentLabel = agentId.padEnd(20);
    const detailsStr = details ? ` | ${JSON.stringify(details)}` : "";
    console.log(`[${agentLabel}] ${msg}${detailsStr}`);
  },
  strategy: (strategy: string, msg: string) => {
    const timestamp = new Date().toISOString().split("T")[1]?.slice(0, 8) || "";
    console.log(`[STRATEGY:${strategy}] ${msg}`);
  },
  error: (agentId: string, msg: string, error?: Error) => {
    const timestamp = new Date().toISOString().split("T")[1]?.slice(0, 8) || "";
    const errorMsg = error ? `: ${error.message}` : "";
    console.error(`[${agentId}] ✗ ${msg}${errorMsg}`);
  },
};

/**
 * Main orchestrator for coordinating multiple agents.
 * Supports different orchestration strategies:
 * - Sequential: Agents work one after another
 * - Parallel: Multiple agents work simultaneously
 * - Hierarchical: Agents organized in hierarchy with coordinator
 * - Collaborative: Agents communicate and negotiate
 */
export class MultiAgentOrchestrator {
  private workflow: MultiAgentWorkflow;
  private poolManager: AgentPoolManager;
  private messageBroker: MessageBroker;
  private state: OrchestratorState;
  private trackers: Map<string, ActionTracker> = new Map();
  private executors: Map<string, ToolExecutor> = new Map();
  private agents: Map<string, ToolLoopAgent> = new Map();
  private sharedTracker: ActionTracker;

  constructor(workflow: MultiAgentWorkflow) {
    this.workflow = workflow;
    this.poolManager = new AgentPoolManager();
    this.messageBroker = new MessageBroker();
    this.sharedTracker = new ActionTracker();

    orchestrationLogger.info(
      "ORCHESTRATOR",
      "Initializing orchestrator",
      {
        workflowId: workflow.id,
        agents: workflow.agents.length,
        strategy: workflow.strategy.type,
      },
    );

    // Register all agents in the pool
    for (const agentConfig of workflow.agents) {
      this.poolManager.registerAgent(agentConfig);
      orchestrationLogger.info(
        agentConfig.id,
        `Registered agent (${agentConfig.role})`,
        { tools: agentConfig.tools.length, maxSteps: agentConfig.maxSteps },
      );
    }

    // Initialize orchestrator state
    this.state = {
      workflowId: workflow.id,
      status: "pending",
      pool: this.poolManager.getPool(),
      sharedContext: {
        goal: workflow.goal,
        conversationHistory: [],
        sharedState: new Map(),
        metadata: {
          startTime: new Date(),
          currentStep: 0,
          completedTasks: [],
          failedTasks: [],
        },
      },
      timeline: [],
      startTime: new Date(),
      currentCoordinator: this.findCoordinator(),
    };

    orchestrationLogger.info(
      "ORCHESTRATOR",
      "Initialization complete",
      { coordinator: this.state.currentCoordinator },
    );
  }

  /**
   * Find the coordinator agent (usually 'coordinator' role)
   */
  private findCoordinator(): string {
    const coordinators = this.workflow.agents.filter(
      (a) => a.role === "coordinator",
    );
    if (coordinators.length > 0) return coordinators[0]!.id;
    return this.workflow.agents[0]!.id; // Fallback to first agent
  }

  /**
   * Get a model instance for a specific agent, respecting per-agent model overrides
   */
  private getModelForAgent(agentConfig: AgentConfig) {
    if (agentConfig.model) {
      orchestrationLogger.info(agentConfig.id, `Using custom model: ${agentConfig.model}`);
      const apiKey = getEnv("OPENROUTER_API_KEY");
      if (!apiKey) {
        throw new Error(
          `OPENROUTER_API_KEY is not set, cannot create model for agent ${agentConfig.id}`,
        );
      }
      const provider = createOpenRouter({ apiKey });
      return provider(agentConfig.model);
    }
    orchestrationLogger.info(agentConfig.id, "Using default model");
    return getAgentModel();
  }

  /**
   * Build the system prompt for an agent based on its role and config
   */
  private buildSystemPrompt(agentConfig: AgentConfig): string {
    const parts: string[] = [];

    if (agentConfig.systemPrompt) {
      parts.push(agentConfig.systemPrompt);
    } else {
      // Default role-based prompts
      switch (agentConfig.role) {
        case "researcher":
          parts.push(
            "You are a Research Agent. Your job is to gather information, analyze codebases, and provide detailed findings. You have read-only access to the file system.",
          );
          break;
        case "implementer":
          parts.push(
            "You are an Implementation Agent. Your job is to write code, modify files, and implement features. All your file changes are staged until user approval.",
          );
          break;
        case "reviewer":
          parts.push(
            "You are a Review Agent. Your job is to review code for quality, correctness, style, and potential issues. You can also run tests and linting.",
          );
          break;
        case "coordinator":
          parts.push(
            "You are a Coordinator Agent. Your job is to plan tasks, delegate work to other agents, and synthesize results. You manage the workflow.",
          );
          break;
        case "custom":
          parts.push(
            `You are a Custom Agent: ${agentConfig.name}. ${agentConfig.description}`,
          );
          break;
      }
    }

    if (agentConfig.specializations && agentConfig.specializations.length > 0) {
      parts.push(`\nSpecializations: ${agentConfig.specializations.join(", ")}`);
    }

    parts.push(
      "\nAll file mutations are staged until approval. Always describe what you're doing clearly.",
    );

    return parts.join("\n");
  }

  /**
   * Filter tools for an agent based on its config
   */
  private filterToolsForAgent(
    allTools: ReturnType<typeof createAgentTools>,
    agentConfig: AgentConfig,
  ) {
    const filtered: Record<string, any> = {};
    for (const toolName of agentConfig.tools) {
      if (toolName in allTools) {
        filtered[toolName] = (allTools as Record<string, any>)[toolName];
      }
    }
    orchestrationLogger.info(
      agentConfig.id,
      `Filtered tools: ${Object.keys(filtered).length} / ${agentConfig.tools.length}`,
    );
    return filtered;
  }

  /**
   * Create a ToolExecutor for an agent based on its role and tool requirements
   */
  private createExecutorForAgent(agentConfig: AgentConfig): {
    tracker: ActionTracker;
    executor: ToolExecutor;
  } {
    const config: SingleAgentConfig = defaultAgentConfig();
    const tracker = new ActionTracker();

    // Configure tool permissions based on role
    switch (agentConfig.role) {
      case "researcher":
        config.tools.allowShellExecution = false;
        config.tools.allowFileModification = false;
        config.tools.allowFileCreation = false;
        config.tools.allowFolderCreation = false;
        orchestrationLogger.info(agentConfig.id, "Configured as read-only agent");
        break;
      case "implementer":
        config.tools.allowShellExecution = true;
        config.tools.allowFileModification = true;
        config.tools.allowFileCreation = true;
        config.tools.allowFolderCreation = true;
        orchestrationLogger.info(agentConfig.id, "Configured with write permissions");
        break;
      case "reviewer":
        config.tools.allowShellExecution = true; // for running tests/lint
        config.tools.allowFileModification = false;
        config.tools.allowFileCreation = false;
        config.tools.allowFolderCreation = false;
        orchestrationLogger.info(agentConfig.id, "Configured for review (can execute, no writes)");
        break;
      case "coordinator":
        config.tools.allowShellExecution = false;
        config.tools.allowFileModification = false;
        config.tools.allowFileCreation = false;
        config.tools.allowFolderCreation = false;
        orchestrationLogger.info(agentConfig.id, "Configured as coordinator (read-only)");
        break;
      case "custom":
        // For custom agents, enable based on tools requested
        const toolSet = new Set(agentConfig.tools);
        config.tools.allowFileCreation = toolSet.has("create_file") || toolSet.has("create_folder");
        config.tools.allowFileModification =
          toolSet.has("modify_file") ||
          toolSet.has("replace_in_file") ||
          toolSet.has("append_to_file") ||
          toolSet.has("insert_at_line") ||
          toolSet.has("delete_file");
        config.tools.allowFolderCreation = toolSet.has("create_folder");
        config.tools.allowShellExecution =
          toolSet.has("run_command") ||
          toolSet.has("execute_shell") ||
          toolSet.has("run_background_command") ||
          toolSet.has("run_tests") ||
          toolSet.has("run_test_file");
        orchestrationLogger.info(
          agentConfig.id,
          `Configured custom agent with selective permissions`,
        );
        break;
    }

    const executor = new ToolExecutor(tracker, config);
    return { tracker, executor };
  }

  /**
   * Initialize executor and agent instance for a given agent config
   */
  private initializeAgent(agentConfig: AgentConfig) {
    orchestrationLogger.info(agentConfig.id, "Initializing agent");

    const { tracker, executor } = this.createExecutorForAgent(agentConfig);
    this.trackers.set(agentConfig.id, tracker);
    this.executors.set(agentConfig.id, executor);

    // Create full tool set, then filter for this agent
    const allTools = createAgentTools(executor);
    const tools = this.filterToolsForAgent(allTools, agentConfig);

    // Create ToolLoopAgent with per-agent model and role-based system prompt
    const model = this.getModelForAgent(agentConfig);
    const agent = new ToolLoopAgent({
      model,
      stopWhen: stepCountIs(agentConfig.maxSteps),
      tools,
      instructions: [
        this.buildSystemPrompt(agentConfig),
        `Workspace root: ${defaultAgentConfig().codebasePath}`,
      ].join("\n"),
    });

    this.agents.set(agentConfig.id, agent);
    orchestrationLogger.info(agentConfig.id, "Agent initialization complete");

    return executor;
  }

  /**
   * Execute the workflow based on strategy
   */
  async execute(): Promise<OrchestratorState> {
    this.state.status = "running";
    orchestrationLogger.strategy(
      this.workflow.strategy.type,
      "Starting workflow execution",
    );

    try {
      switch (this.workflow.strategy.type) {
        case "sequential":
          orchestrationLogger.strategy("sequential", "Executing agents sequentially");
          await this.executeSequential();
          break;
        case "parallel":
          orchestrationLogger.strategy("parallel", "Executing agents in parallel");
          await this.executeParallel();
          break;
        case "hierarchical":
          orchestrationLogger.strategy("hierarchical", "Executing with hierarchical coordination");
          await this.executeHierarchical();
          break;
        case "collaborative":
          orchestrationLogger.strategy("collaborative", "Executing with agent collaboration");
          await this.executeCollaborative();
          break;
      }

      this.state.status = "completed";
      orchestrationLogger.strategy(
        this.workflow.strategy.type,
        "Workflow execution completed successfully",
      );
    } catch (error) {
      this.state.status = "failed";
      orchestrationLogger.error(
        "ORCHESTRATOR",
        "Workflow execution failed",
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    this.state.endTime = new Date();
    return this.state;
  }

  /**
   * Sequential execution: agents work one after another
   */
  private async executeSequential(): Promise<void> {
    orchestrationLogger.strategy("sequential", `Executing ${this.workflow.agents.length} agents`);

    for (let i = 0; i < this.workflow.agents.length; i++) {
      const agentConfig = this.workflow.agents[i]!;
      orchestrationLogger.strategy(
        "sequential",
        `[${i + 1}/${this.workflow.agents.length}] Starting ${agentConfig.id}`,
      );

      const result = await this.executeAgent(agentConfig);
      this.state.timeline.push(result);

      if (result.success) {
        orchestrationLogger.info(
          agentConfig.id,
          "Completed successfully",
          { steps: result.context.metadata.currentStep },
        );
        this.updateSharedContext(agentConfig, result);
      } else {
        orchestrationLogger.error(
          agentConfig.id,
          "Execution failed",
          result.error,
        );

        // Handle failure based on strategy config
        if (this.workflow.strategy.config.retryOnFailure) {
          const maxRetries = this.workflow.strategy.config.maxRetries || 1;
          orchestrationLogger.info(
            agentConfig.id,
            `Retrying (${maxRetries} attempts)`,
          );

          for (let retryAttempt = 0; retryAttempt < maxRetries; retryAttempt++) {
            orchestrationLogger.info(
              agentConfig.id,
              `Retry attempt ${retryAttempt + 1}/${maxRetries}`,
            );
            const retryResult = await this.executeAgent(agentConfig);
            if (retryResult.success) {
              this.state.timeline.push(retryResult);
              this.updateSharedContext(agentConfig, retryResult);
              orchestrationLogger.info(
                agentConfig.id,
                `Recovered on retry ${retryAttempt + 1}`,
              );
              break;
            }
          }
        }
      }
    }
  }

  /**
   * Parallel execution: multiple agents work simultaneously
   */
  private async executeParallel(): Promise<void> {
    const maxConcurrent =
      this.workflow.strategy.config.maxConcurrentAgents ||
      this.workflow.agents.length;
    const timeout = this.workflow.strategy.config.timeout || 30000;

    orchestrationLogger.strategy(
      "parallel",
      `Executing with maxConcurrent=${maxConcurrent}, timeout=${timeout}ms`,
    );

    const executeWithTimeout = async (agentConfig: AgentConfig) => {
      return Promise.race([
        this.executeAgent(agentConfig),
        new Promise<AgentExecutionResult>((_, reject) =>
          setTimeout(
            () => {
              orchestrationLogger.error(
                agentConfig.id,
                `Timeout after ${timeout}ms`,
              );
              reject(new Error(`Agent ${agentConfig.id} execution timeout`));
            },
            timeout,
          ),
        ),
      ]);
    };

    // Execute in batches
    for (let i = 0; i < this.workflow.agents.length; i += maxConcurrent) {
      const batch = this.workflow.agents.slice(i, i + maxConcurrent);
      const batchNum = Math.floor(i / maxConcurrent) + 1;
      const totalBatches = Math.ceil(this.workflow.agents.length / maxConcurrent);

      orchestrationLogger.strategy(
        "parallel",
        `Starting batch ${batchNum}/${totalBatches} with ${batch.length} agents`,
      );

      const promises = batch.map(executeWithTimeout);

      try {
        const results = await Promise.all(promises);
        for (const result of results) {
          this.state.timeline.push(result);
          if (result.success) {
            const agent = this.workflow.agents.find((a) => a.id === result.agentId);
            if (agent) this.updateSharedContext(agent, result);
          }
        }
        orchestrationLogger.strategy(
          "parallel",
          `Batch ${batchNum}/${totalBatches} completed`,
        );
      } catch (error) {
        orchestrationLogger.error(
          "ORCHESTRATOR",
          "Error in parallel batch execution",
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
  }

  /**
   * Hierarchical execution: coordinator delegates to specialist agents
   */
  private async executeHierarchical(): Promise<void> {
    const coordinatorId = this.state.currentCoordinator;
    const coordinator = this.workflow.agents.find((a) => a.id === coordinatorId);

    if (!coordinator) {
      orchestrationLogger.error("ORCHESTRATOR", "Coordinator agent not found");
      return;
    }

    orchestrationLogger.strategy(
      "hierarchical",
      `Using coordinator: ${coordinatorId}`,
    );

    // First, run coordinator to plan
    orchestrationLogger.strategy("hierarchical", "Coordinator phase: planning");
    const coordinationResult = await this.executeAgent(coordinator);
    this.state.timeline.push(coordinationResult);

    if (coordinationResult.success) {
      this.updateSharedContext(coordinator, coordinationResult);
      orchestrationLogger.info(
        coordinatorId,
        "Coordination planning completed",
      );
    }

    // Then execute other agents based on coordinator's output
    const specialists = this.workflow.agents.filter((a) => a.id !== coordinatorId);

    orchestrationLogger.strategy(
      "hierarchical",
      `Specialist phase: executing ${specialists.length} specialists`,
    );

    for (const specialist of specialists) {
      const result = await this.executeAgent(specialist);
      this.state.timeline.push(result);
      if (result.success) {
        this.updateSharedContext(specialist, result);
      }
    }

    orchestrationLogger.strategy("hierarchical", "Hierarchical execution completed");
  }

  /**
   * Collaborative execution: agents communicate and negotiate
   */
  private async executeCollaborative(): Promise<void> {
    orchestrationLogger.strategy(
      "collaborative",
      `Setting up message subscriptions for ${this.workflow.agents.length} agents`,
    );

    // Setup message subscriptions
    for (const agentConfig of this.workflow.agents) {
      this.messageBroker.subscribe(agentConfig.id, (message) => {
        this.poolManager.queueMessageFor(agentConfig.id, message);
        orchestrationLogger.info(
          agentConfig.id,
          `Message queued from ${message.fromAgentId}`,
          { type: message.type },
        );
      });
    }

    orchestrationLogger.strategy(
      "collaborative",
      `Starting collaborative execution with ${this.workflow.agents.length} agents`,
    );

    // Give each agent a turn with accumulated context
    for (let turn = 0; turn < this.workflow.agents.length; turn++) {
      const agentConfig = this.workflow.agents[turn]!;
      orchestrationLogger.strategy(
        "collaborative",
        `Turn ${turn + 1}: ${agentConfig.id}'s turn to speak`,
      );

      const result = await this.executeAgentWithMessaging(agentConfig);
      this.state.timeline.push(result);

      if (result.success) {
        this.updateSharedContext(agentConfig, result);
        orchestrationLogger.info(
          agentConfig.id,
          `Turn ${turn + 1} completed, broadcasting results`,
        );
      }
    }

    orchestrationLogger.strategy("collaborative", "Collaborative execution completed");
  }

  /**
   * Update shared context with results from an agent execution
   */
  private updateSharedContext(
    agentConfig: AgentConfig,
    result: AgentExecutionResult,
  ): void {
    const msg: AgentMessage = {
      id: `ctx_${Date.now()}_${agentConfig.id}`,
      fromAgentId: agentConfig.id,
      type: "result",
      content: result.output,
      timestamp: new Date(),
      requiresResponse: false,
      context: { role: agentConfig.role, steps: result.context.metadata.currentStep },
    };
    this.state.sharedContext.conversationHistory.push(msg);
    if (result.success) {
      this.state.sharedContext.metadata.completedTasks.push(
        `${agentConfig.id}: ${agentConfig.description}`,
      );
    } else {
      this.state.sharedContext.metadata.failedTasks.push(
        `${agentConfig.id}: ${agentConfig.description}`,
      );
    }
  }

  /**
   * Build the prompt for an agent, including context from previous agents
   */
  private buildAgentPrompt(agentConfig: AgentConfig): string {
    const parts: string[] = [];

    // Main goal
    parts.push(`Goal: ${this.workflow.goal}`);

    // Agent's specific role
    parts.push(`\nYour role: ${agentConfig.description}`);
    parts.push(`Your role type: ${agentConfig.role}`);

    // Include recent conversation history from other agents
    const recentMessages = this.state.sharedContext.conversationHistory.slice(-20);
    if (recentMessages.length > 0) {
      parts.push("\n--- Previous Agent Outputs ---");
      for (const msg of recentMessages) {
        parts.push(`[${msg.fromAgentId}]: ${msg.content.slice(0, 500)}`);
      }
      parts.push("--- End Previous Outputs ---\n");
    }

    // Include any messages queued specifically for this agent
    const queuedMessages = this.poolManager.flushMessageQueue(agentConfig.id);
    if (queuedMessages.length > 0) {
      parts.push("\n--- Messages for you ---");
      for (const msg of queuedMessages) {
        const direction = msg.toAgentId
          ? `(from ${msg.fromAgentId})`
          : `(broadcast from ${msg.fromAgentId})`;
        parts.push(`${direction}: ${msg.content.slice(0, 500)}`);
      }
      parts.push("--- End Messages ---\n");
    }

    return parts.join("\n");
  }

  /**
   * Execute a single agent
   */
  private async executeAgent(
    agentConfig: AgentConfig,
  ): Promise<AgentExecutionResult> {
    orchestrationLogger.info(agentConfig.id, "Starting execution");
    this.poolManager.activateAgent(agentConfig.id);

    const executor = this.initializeAgent(agentConfig);
    const agent = this.agents.get(agentConfig.id)!;
    const agentInstance = this.poolManager.getAgent(agentConfig.id)!;
    const tracker = this.trackers.get(agentConfig.id)!;
    const executedTools: string[] = [];
    const messagesSent: AgentMessage[] = [];

    try {
      const prompt = this.buildAgentPrompt(agentConfig);

      orchestrationLogger.info(agentConfig.id, "Generating response from model");
      const result = await agent.generate({
        prompt,
        onStepFinish: ({ toolCalls }) => {
          for (const tc of toolCalls) {
            const toolName = String(tc.toolName);
            if (!executedTools.includes(toolName)) {
              executedTools.push(toolName);
              orchestrationLogger.info(agentConfig.id, `Executed tool: ${toolName}`);
            }
            agentInstance.context.metadata.currentStep++;
          }
        },
      });

      const executionResult: AgentExecutionResult = {
        agentId: agentConfig.id,
        success: true,
        output: result.text,
        executedTools,
        messagesReceived: [...agentInstance.context.conversationHistory],
        messagesSent,
        context: agentInstance.context,
      };

      this.poolManager.updateCompletion(agentConfig.id, 100);
      this.poolManager.deactivateAgent(agentConfig.id);

      orchestrationLogger.info(
        agentConfig.id,
        "Execution completed",
        {
          tools: executedTools.length,
          steps: agentInstance.context.metadata.currentStep,
        },
      );

      return executionResult;
    } catch (error) {
      this.poolManager.markAgentFailed(agentConfig.id);

      orchestrationLogger.error(
        agentConfig.id,
        "Execution failed",
        error instanceof Error ? error : new Error(String(error)),
      );

      return {
        agentId: agentConfig.id,
        success: false,
        output: "",
        executedTools,
        messagesReceived: [],
        messagesSent,
        context: agentInstance.context,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Execute an agent with message passing capabilities
   */
  private async executeAgentWithMessaging(
    agentConfig: AgentConfig,
  ): Promise<AgentExecutionResult> {
    const result = await this.executeAgent(agentConfig);

    // Send result as a message to other agents
    if (result.success) {
      const msg = this.messageBroker.broadcast({
        fromAgentId: agentConfig.id,
        type: "result",
        content: result.output,
        requiresResponse: false,
      });
      // Also add to shared conversation history
      this.state.sharedContext.conversationHistory.push(msg);
      orchestrationLogger.info(
        agentConfig.id,
        `Message broadcast to ${this.workflow.agents.length - 1} other agents`,
      );
    }

    return result;
  }

  /**
   * Get all action trackers (one per agent) for approval flow
   */
  getAllTrackers(): Map<string, ActionTracker> {
    return this.trackers;
  }

  /**
   * Get the shared tracker
   */
  getSharedTracker(): ActionTracker {
    return this.sharedTracker;
  }

  /**
   * Get orchestrator state
   */
  getState(): OrchestratorState {
    return this.state;
  }

  /**
   * Get execution timeline
   */
  getTimeline(): AgentExecutionResult[] {
    return this.state.timeline;
  }

  /**
   * Get message history
   */
  getMessageHistory(): AgentMessage[] {
    return this.messageBroker.messageBuffer;
  }

  /**
   * Pause execution
   */
  pause(): void {
    this.state.status = "paused";
  }

  /**
   * Resume execution
   */
  resume(): void {
    if (this.state.status === "paused") {
      this.state.status = "running";
    }
  }

  /**
   * Get comprehensive orchestration summary
   */
  getSummary() {
    return {
      workflowId: this.state.workflowId,
      status: this.state.status,
      goal: this.workflow.goal,
      strategy: this.workflow.strategy.type,
      startTime: this.state.startTime,
      endTime: this.state.endTime,
      duration: this.state.endTime
        ? this.state.endTime.getTime() - this.state.startTime.getTime()
        : null,
      totalAgents: this.workflow.agents.length,
      completedTasks: this.state.sharedContext.metadata.completedTasks.length,
      failedTasks: this.state.sharedContext.metadata.failedTasks.length,
      poolStats: this.poolManager.getStats(),
      executionResults: this.state.timeline.map((r) => ({
        agentId: r.agentId,
        success: r.success,
        role: this.workflow.agents.find((a) => a.id === r.agentId)?.role,
        steps: r.context.metadata.currentStep,
      })),
    };
  }
}