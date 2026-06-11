import type {
  AgentConfig,
  AgentContext,
  AgentExecutionResult,
  AgentMessage,
  MultiAgentWorkflow,
  OrchestratorState,
  OrchestratorEvent,
  OrchestratorEventListener,
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
import { getEnv, getMultiRetryConfig } from "../../ai/config-loader";
import { withRetry } from "../../core/retry";
import chalk from "chalk";
import type { LanguageModelUsage } from "../../tui/spinner";

/**
 * Safely extract token counts from an AI SDK usage object.
 */
function extractUsage(usage: unknown): LanguageModelUsage {
  const raw = usage as any;
  return {
    promptTokens:     raw?.promptTokens     ?? undefined,
    completionTokens: raw?.completionTokens ?? undefined,
    inputTokens:      raw?.inputTokens      ?? undefined,
    outputTokens:     raw?.outputTokens     ?? undefined,
  };
}

/**
 * Helper to generate descriptive text depending on the tool executed and its parameters.
 */
function getToolDetailsString(toolName: string, input: any): string {
  if (!input || typeof input !== "object") return "";

  const targetPath = input.path ?? input.filePath ?? input.filename ?? input.dirPath ?? input.folderPath;
  
  switch (toolName) {
    case "read_file":
      return targetPath ? `reading ${chalk.yellow(targetPath)}` : "";
    case "create_file":
      return targetPath ? `creating ${chalk.green(targetPath)}` : "";
    case "modify_file":
    case "replace_in_file":
    case "append_to_file":
    case "insert_at_line":
      return targetPath ? `modifying ${chalk.yellow(targetPath)}` : "";
    case "delete_file":
      return targetPath ? `deleting ${chalk.red(targetPath)}` : "";
    case "create_folder":
      return targetPath ? `creating directory ${chalk.green(targetPath)}` : "";
    case "run_command":
    case "run_background_command":
    case "execute_shell":
      return input.command ? `running ${chalk.magenta(`"${input.command}"`)}` : "";
    case "run_test_file":
      return targetPath ? `testing ${chalk.cyan(targetPath)}` : "";
    case "session_search":
    case "web_search":
      return input.query ? `searching for ${chalk.italic(`"${input.query}"`)}` : "";
    case "fetch_url":
      return input.url ? `fetching ${chalk.underline.dim(input.url)}` : "";
    default:
      if (targetPath) return `target: ${targetPath}`;
      if (input.query) return `query: "${input.query}"`;
      if (input.command) return `cmd: "${input.command}"`;
      return "";
  }
}

/**
 * Logger utility with consistent formatting
 */
const orchestrationLogger = {
  info: (agentId: string, msg: string, details?: Record<string, unknown>) => {
    const agentLabel = agentId.padEnd(20);
    const detailsStr = details ? ` | ${JSON.stringify(details)}` : "";
    console.log(`[${agentLabel}] ${msg}${detailsStr}`);
  },
  strategy: (strategy: string, msg: string) => {
    console.log(`[STRATEGY:${strategy}] ${msg}`);
  },
  error: (agentId: string, msg: string, error?: Error) => {
    const errorMsg = error ? `: ${error.message}` : "";
    console.error(`[${agentId}] ✗ ${msg}${errorMsg}`);
  },
};

/**
 * Main orchestrator for coordinating multiple agents.
 */
export class MultiAgentOrchestrator {
  private workflow: MultiAgentWorkflow;
  private poolManager: AgentPoolManager;
  private messageBroker: MessageBroker;
  private state: OrchestratorState;
  private trackers: Map<string, ActionTracker> = new Map();
  private executors: Map<string, ToolExecutor> = new Map();
  
  // FIX: Type map 'any' to decouple tooling signatures universally
  private agents: Map<string, any> = new Map();
  private sharedTracker: ActionTracker;
  private eventListeners: OrchestratorEventListener[] = [];

  constructor(workflow: MultiAgentWorkflow) {
    this.workflow = workflow;
    this.poolManager = new AgentPoolManager();
    this.messageBroker = new MessageBroker();
    this.sharedTracker = new ActionTracker();

    orchestrationLogger.info(
      "ORCHESTRATOR",
      "Initializing",
      { workflowId: workflow.id, agents: workflow.agents.length, strategy: workflow.strategy.type },
    );

    // Register all agents
    for (const agentConfig of workflow.agents) {
      this.poolManager.registerAgent(agentConfig);
      orchestrationLogger.info(agentConfig.id, `Registered (${agentConfig.role})`, {
        tools: agentConfig.tools.length,
        maxSteps: agentConfig.maxSteps,
        dependsOn: agentConfig.dependsOn?.join(","),
      });
    }

    // Initialize state
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
          retryCount: 0,
        },
      },
      timeline: [],
      startTime: new Date(),
      currentCoordinator: this._findCoordinator(),
      events: [],
    };

    orchestrationLogger.info("ORCHESTRATOR", "Initialization complete", {
      coordinator: this.state.currentCoordinator,
    });
  }

  // ─── Event System ─────────────────────────────────────────────────────────

  onEvent(listener: OrchestratorEventListener): () => void {
    this.eventListeners.push(listener);
    return () => {
      const idx = this.eventListeners.indexOf(listener);
      if (idx >= 0) this.eventListeners.splice(idx, 1);
    };
  }

  private _emitEvent(event: any): void {
    this.state.events.push(event);
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("Error in event listener:", err);
      }
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private _findCoordinator(): string {
    const coordinators = this.workflow.agents.filter((a) => a.role === "coordinator");
    if (coordinators.length > 0) return coordinators[0]!.id;
    return this.workflow.agents[0]!.id;
  }

  private async _getModelForAgent(agentConfig: AgentConfig) {
    if (agentConfig.model) {
      orchestrationLogger.info(agentConfig.id, `Custom model: ${agentConfig.model}`);
      const apiKey = getEnv("OPENROUTER_API_KEY");
      if (!apiKey) {
        throw new Error(`OPENROUTER_API_KEY not set for agent ${agentConfig.id}`);
      }
      const provider = createOpenRouter({ apiKey });
      return provider.chat(agentConfig.model);
    }
    return await getAgentModel();
  }

  private _buildSystemPrompt(agentConfig: AgentConfig): string {
    const parts: string[] = [];

    if (agentConfig.systemPrompt) {
      parts.push(agentConfig.systemPrompt);
    } else {
      const rolePrompts: Record<AgentConfig["role"], string> = {
        researcher:
          "You are Astra, an AI-native development CLI companion tool built to help the user navigate, analyze, and build within their workspace codebase. If the user asks who you are, what your name is, or what model you are running on, you must always identify yourself exclusively as Astra. Do not mention your underlying model architecture or provider. You are a Research Agent. Gather information, analyze codebases, and provide detailed findings. You have read-only file access.",
        implementer:
          "You are Astra, an AI-native development CLI companion tool built to help the user navigate, analyze, and build within their workspace codebase. If the user asks who you are, what your name is, or what model you are running on, you must always identify yourself exclusively as Astra. Do not mention your underlying model architecture or provider. You are an Implementation Agent. Write code, modify files, and implement features. File changes are staged until approval.",
        reviewer:
          "You are Astra, an AI-native development CLI companion tool built to help the user navigate, analyze, and build within their workspace codebase. If the user asks who you are, what your name is, or what model you are running on, you must always identify yourself exclusively as Astra. Do not mention your underlying model architecture or provider. You are a Review Agent. Review code for quality, correctness, style, and potential issues. You can run tests and linting.",
        coordinator:
          "You are Astra, an AI-native development CLI companion tool built to help the user navigate, analyze, and build within their workspace codebase. If the user asks who you are, what your name is, or what model you are running on, you must always identify yourself exclusively as Astra. Do not mention your underlying model architecture or provider. You are a Coordinator Agent. Plan tasks, delegate work to other agents, and synthesize results. You manage the workflow.",
        custom: `You are Astra, an AI-native development CLI companion tool built to help the user navigate, analyze, and build within their workspace codebase. If the user asks who you are, what your name is, or what model you are running on, you must always identify yourself exclusively as Astra. Do not mention your underlying model architecture or provider. You are a Custom Agent: ${agentConfig.name}. ${agentConfig.description}`,
      };
      parts.push(rolePrompts[agentConfig.role]);
    }

    if (agentConfig.specializations?.length) {
      parts.push(`\nSpecializations: ${agentConfig.specializations.join(", ")}`);
    }

    parts.push("\nAll file mutations are staged until approval. Describe what you're doing clearly.");
    return parts.join("\n");
  }

  private _filterToolsForAgent(
    allTools: ReturnType<typeof createAgentTools>,
    agentConfig: AgentConfig,
  ) {
    const filtered: Record<string, any> = {};
    for (const toolName of agentConfig.tools) {
      if (toolName in allTools) {
        filtered[toolName] = (allTools as Record<string, any>)[toolName];
      }
    }
    orchestrationLogger.info(agentConfig.id, `Filtered tools: ${Object.keys(filtered).length} available`);
    return filtered;
  }

  private _createExecutorForAgent(agentConfig: AgentConfig) {
    const config: SingleAgentConfig = defaultAgentConfig();
    const tracker = new ActionTracker();

    switch (agentConfig.role) {
      case "researcher":
        config.tools.allowShellExecution = false;
        config.tools.allowFileModification = false;
        config.tools.allowFileCreation = false;
        config.tools.allowFolderCreation = false;
        break;
      case "implementer":
        config.tools.allowShellExecution = true;
        config.tools.allowFileModification = true;
        config.tools.allowFileCreation = true;
        config.tools.allowFolderCreation = true;
        break;
      case "reviewer":
        config.tools.allowShellExecution = true;
        config.tools.allowFileModification = false;
        config.tools.allowFileCreation = false;
        config.tools.allowFolderCreation = false;
        break;
      case "coordinator":
        config.tools.allowShellExecution = false;
        config.tools.allowFileModification = false;
        config.tools.allowFileCreation = false;
        config.tools.allowFolderCreation = false;
        break;
      case "custom":
        const toolSet = new Set(agentConfig.tools);
        config.tools.allowFileCreation = toolSet.has("create_file") || toolSet.has("create_folder");
        config.tools.allowFileModification = toolSet.has("modify_file") || toolSet.has("replace_in_file");
        config.tools.allowFolderCreation = toolSet.has("create_folder");
        config.tools.allowShellExecution =
          toolSet.has("run_command") || toolSet.has("run_tests") || toolSet.has("run_test_file");
        break;
    }

    const executor = new ToolExecutor(tracker, config);
    return { tracker, executor };
  }

  private async _initializeAgent(agentConfig: AgentConfig) {
    orchestrationLogger.info(agentConfig.id, "Initializing");

    const { tracker, executor } = this._createExecutorForAgent(agentConfig);
    this.trackers.set(agentConfig.id, tracker);
    this.executors.set(agentConfig.id, executor);

    const allTools = createAgentTools(executor);
    const tools = this._filterToolsForAgent(allTools, agentConfig);
    const model = await this._getModelForAgent(agentConfig);

    const agent = new ToolLoopAgent({
      model,
      stopWhen: stepCountIs(agentConfig.maxSteps),
      tools,
      instructions: [
        this._buildSystemPrompt(agentConfig),
        `Workspace root: ${defaultAgentConfig().codebasePath}`,
      ].join("\n"),
    });

    this.agents.set(agentConfig.id, agent);
    orchestrationLogger.info(agentConfig.id, "Initialized");
    return executor;
  }

  private _buildAgentPrompt(agentConfig: AgentConfig): string {
    const parts: string[] = [];
    parts.push(`Goal: ${this.workflow.goal}`);
    parts.push(`\nYour role: ${agentConfig.description}`);
    parts.push(`\nYour role type: ${agentConfig.role}`);

    const recentMessages = this.state.sharedContext.conversationHistory.slice(-20);
    if (recentMessages.length > 0) {
      parts.push("\n--- Previous Agent Outputs ---");
      for (const msg of recentMessages) {
        parts.push(`[${msg.fromAgentId}]: ${msg.content.slice(0, 500)}`);
      }
      parts.push("--- End Previous Outputs ---\n");
    }

    const queuedMessages = this.poolManager.flushMessageQueue(agentConfig.id);
    if (queuedMessages.length > 0) {
      parts.push("\n--- Messages for you ---");
      for (const msg of queuedMessages) {
        const direction = msg.toAgentId ? `(from ${msg.fromAgentId})` : `(broadcast from ${msg.fromAgentId})`;
        parts.push(`${direction}: ${msg.content.slice(0, 500)}`);
      }
      parts.push("--- End Messages ---\n");
    }

    return parts.join("\n");
  }

  // ─── Execution ────────────────────────────────────────────────────────────

  async execute(): Promise<OrchestratorState> {
    this.state.status = "running";
    this._emitEvent({
      type: "workflow:start",
      timestamp: new Date(),
      payload: { strategy: this.workflow.strategy.type },
    });

    orchestrationLogger.strategy(this.workflow.strategy.type, "Starting execution");

    try {
      switch (this.workflow.strategy.type) {
        case "sequential":
          await this._executeSequential();
          break;
        case "parallel":
          await this._executeParallel();
          break;
        case "hierarchical":
          await this._executeHierarchical();
          break;
        case "collaborative":
          await this._executeCollaborative();
          break;
        case "dag":
          await this._executeDAG();
          break;
      }

      this.state.status = "completed";
      this._emitEvent({
        type: "workflow:complete",
        timestamp: new Date(),
        payload: { duration: this.state.endTime?.getTime()! - this.state.startTime.getTime() },
      });

      orchestrationLogger.strategy(this.workflow.strategy.type, "Completed successfully");
    } catch (error) {
      this.state.status = "failed";
      this._emitEvent({
        type: "workflow:failed",
        timestamp: new Date(),
        payload: { error: error instanceof Error ? error.message : String(error) },
      });

      orchestrationLogger.error("ORCHESTRATOR", "Execution failed", error instanceof Error ? error : undefined);
    }

    this.state.endTime = new Date();
    return this.state;
  }

  private async _executeAgent(agentConfig: AgentConfig): Promise<AgentExecutionResult> {
    const startMs = Date.now();
    orchestrationLogger.info(agentConfig.id, "Starting execution");
    this.poolManager.activateAgent(agentConfig.id);

    this._emitEvent({
      type: "agent:start",
      timestamp: new Date(),
      agentId: agentConfig.id,
    });

    const executor = await this._initializeAgent(agentConfig);
    const agent = this.agents.get(agentConfig.id)!;
    const agentInstance = this.poolManager.getAgent(agentConfig.id)!;
    const tracker = this.trackers.get(agentConfig.id)!;
    const executedTools: string[] = [];
    const messagesSent: AgentMessage[] = [];

    // Determine retry configuration from workflow strategy and environment
    const multiRetryConfig = getMultiRetryConfig();
    const strategyMaxRetries = this.workflow.strategy.config.retryOnFailure
      ? (this.workflow.strategy.config.maxRetries ?? 1)
      : 0;
    const effectiveMaxRetries = multiRetryConfig.enabled
      ? Math.max(strategyMaxRetries, multiRetryConfig.maxRetries)
      : strategyMaxRetries;

    try {
      const prompt = this._buildAgentPrompt(agentConfig);
      orchestrationLogger.info(agentConfig.id, "Generating model response");

      const stepTimingState = { lastStepTimestamp: Date.now() };

      // FIX: Replace agent.generate() with agent.stream() & for await chunk loop
      const { result, stats } = await withRetry(
        async () => {
          stepTimingState.lastStepTimestamp = Date.now(); 
          
          const streamResult = await agent.stream({
            prompt,
            onStepFinish: ({ toolCalls, usage }: { toolCalls: any[]; usage?: any }) => {
              const now = Date.now();
              const stepDurationMs = now - stepTimingState.lastStepTimestamp;
              stepTimingState.lastStepTimestamp = now;

              const elapsedSeconds = (stepDurationMs / 1000).toFixed(1);
              const stepMetrics = extractUsage(usage);
              const inT = stepMetrics.inputTokens ?? stepMetrics.promptTokens ?? 0;
              const outT = stepMetrics.outputTokens ?? stepMetrics.completionTokens ?? 0;

              if (usage) {
                this._emitEvent({
                  type: "usage_updated",
                  timestamp: new Date(),
                  payload: { usage: stepMetrics }
                });
              }

              if (toolCalls && toolCalls.length > 0) {
                for (const tc of toolCalls) {
                  const toolName = String(tc.toolName);
                  if (!executedTools.includes(toolName)) {
                    executedTools.push(toolName);
                    orchestrationLogger.info(agentConfig.id, `Executed tool: ${toolName}`);
                  }
                  
                  const detailedInfo = getToolDetailsString(toolName, tc.input);
                  const separator = detailedInfo ? " — " : "";

                  this._emitEvent({
                    type: "tool_executed",
                    timestamp: new Date(),
                    payload: {
                      agentId: agentConfig.id,
                      toolName: toolName,
                      logLine: `  ${chalk.blue("➔")} [${chalk.magenta(agentConfig.id)}] ${chalk.dim("Executed:")} ` +
                               `${chalk.cyan.bold(toolName)}${separator}${detailedInfo} ` +
                               `${chalk.gray(`(${elapsedSeconds}s · ↑${inT} ↓${outT} tokens)`)}`
                    }
                  });
                }
              }
              agentInstance.context.metadata.currentStep++;
            },
          });

          // Process the text chunk stream dynamically
          let accumulated = "";
          let firstChunk = true;
          for await (const chunk of streamResult.textStream) {
            if (firstChunk) {
              this._emitEvent({ 
                type: "agent:stream_start", 
                timestamp: new Date(), 
                agentId: agentConfig.id 
              });
              firstChunk = false;
            }
            accumulated += chunk;
            
            // Broadcast chunk metrics natively so the UI spinner pulsing triggers
            this._emitEvent({ 
              type: "agent:chunk", 
              timestamp: new Date(), 
              agentId: agentConfig.id 
            });
          }

          return { text: accumulated };
        },
        {
          maxRetries: effectiveMaxRetries,
          baseDelayMs: 1000,
          maxDelayMs: 30000,
          backoffMultiplier: multiRetryConfig.backoffMultiplier,
          jitter: true,
          maxJitterMs: 1000,
          onRetry: (attempt, error, delayMs) => {
            orchestrationLogger.info(
              agentConfig.id,
              `Retry ${attempt}/${effectiveMaxRetries} after ${error.category} error, waiting ${Math.round(delayMs / 1000)}s`,
            );
            this._emitEvent({
              type: "agent:retry",
              timestamp: new Date(),
              agentId: agentConfig.id,
              payload: { attempt, error: error.category, delayMs },
            });
          },
          onExhausted: (error, totalAttempts) => {
            orchestrationLogger.error(
              agentConfig.id,
              `All ${totalAttempts} attempts failed (${error.category})`,
            );
          },
        },
      );

      const durationMs = Date.now() - startMs;
      const executionResult: AgentExecutionResult = {
        agentId: agentConfig.id,
        success: true,
        output: result.text,
        executedTools,
        messagesReceived: [...agentInstance.context.conversationHistory],
        messagesSent,
        context: agentInstance.context,
        durationMs,
        attemptNumber: stats.totalAttempts,
      };

      this.poolManager.updateCompletion(agentConfig.id, 100);
      this.poolManager.deactivateAgent(agentConfig.id);

      this._emitEvent({
        type: "agent:complete",
        timestamp: new Date(),
        agentId: agentConfig.id,
        payload: { duration: durationMs, steps: agentInstance.context.metadata.currentStep },
      });

      orchestrationLogger.info(agentConfig.id, "Execution completed", {
        tools: executedTools.length,
        durationMs,
        attempts: stats.totalAttempts,
      });

      return executionResult;
    } catch (error) {
      this.poolManager.markAgentFailed(agentConfig.id);

      this._emitEvent({
        type: "agent:failed",
        timestamp: new Date(),
        agentId: agentConfig.id,
        payload: { error: error instanceof Error ? error.message : String(error) },
      });

      orchestrationLogger.error(
        agentConfig.id,
        "Execution failed (all retries exhausted)",
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
        durationMs: Date.now() - startMs,
        attemptNumber: 1 + (agentInstance.context.metadata.retryCount ?? 0),
      };
    }
  }

  private async _executeAgentWithMessaging(agentConfig: AgentConfig): Promise<AgentExecutionResult> {
    const result = await this._executeAgent(agentConfig);

    if (result.success) {
      const msg = this.messageBroker.broadcast({
        fromAgentId: agentConfig.id,
        type: "result",
        content: result.output,
        requiresResponse: false,
      });
      this.state.sharedContext.conversationHistory.push(msg);
      orchestrationLogger.info(agentConfig.id, `Broadcast to ${this.workflow.agents.length - 1} agents`);
    }

    return result;
  }

  private async _executeSequential(): Promise<void> {
    orchestrationLogger.strategy("sequential", `Executing ${this.workflow.agents.length} agents`);

    for (let i = 0; i < this.workflow.agents.length; i++) {
      const agentConfig = this.workflow.agents[i]!;
      orchestrationLogger.strategy("sequential", `[${i + 1}/${this.workflow.agents.length}] ${agentConfig.id}`);

      const result = await this._executeAgent(agentConfig);
      this.state.timeline.push(result);

      if (result.success) {
        this._updateSharedContext(agentConfig, result);
      } else {
        this._handleAgentFailure(agentConfig, result);
      }
    }
  }

  private async _executeParallel(): Promise<void> {
    const maxConcurrent = this.workflow.strategy.config.maxConcurrentAgents || this.workflow.agents.length;
    const timeout = this.workflow.strategy.config.timeout || 30_000;

    orchestrationLogger.strategy("parallel", `maxConcurrent=${maxConcurrent}, timeout=${timeout}ms`);

    const executeWithTimeout = async (agentConfig: AgentConfig) => {
      return Promise.race([
        this._executeAgent(agentConfig),
        new Promise<AgentExecutionResult>((_, reject) =>
          setTimeout(() => {
            orchestrationLogger.error(agentConfig.id, `Timeout after ${timeout}ms`);
            reject(new Error(`Timeout after ${timeout}ms`));
          }, timeout),
        ),
      ]);
    };

    for (let i = 0; i < this.workflow.agents.length; i += maxConcurrent) {
      const batch = this.workflow.agents.slice(i, i + maxConcurrent);
      const batchNum = Math.floor(i / maxConcurrent) + 1;
      const totalBatches = Math.ceil(this.workflow.agents.length / maxConcurrent);

      orchestrationLogger.strategy("parallel", `Batch ${batchNum}/${totalBatches} (${batch.length} agents)`);

      try {
        const results = await Promise.all(batch.map(executeWithTimeout));
        for (const result of results) {
          this.state.timeline.push(result);
          const agent = this.workflow.agents.find((a) => a.id === result.agentId);
          if (result.success && agent) {
            this._updateSharedContext(agent, result);
          }
        }
      } catch (error) {
        orchestrationLogger.error("ORCHESTRATOR", "Batch execution error", error instanceof Error ? error : undefined);
      }
    }
  }

  private async _executeHierarchical(): Promise<void> {
    const coordinatorId = this.state.currentCoordinator;
    const coordinator = this.workflow.agents.find((a) => a.id === coordinatorId);

    if (!coordinator) {
      orchestrationLogger.error("ORCHESTRATOR", "Coordinator not found");
      return;
    }

    orchestrationLogger.strategy("hierarchical", `Coordinator: ${coordinatorId}`);

    const coordinationResult = await this._executeAgent(coordinator);
    this.state.timeline.push(coordinationResult);
    if (coordinationResult.success) {
      this._updateSharedContext(coordinator, coordinationResult);
    }

    const specialists = this.workflow.agents.filter((a) => a.id !== coordinatorId);
    orchestrationLogger.strategy("hierarchical", `Executing ${specialists.length} specialists`);

    for (const specialist of specialists) {
      const result = await this._executeAgent(specialist);
      this.state.timeline.push(result);
      if (result.success) {
        this._updateSharedContext(specialist, result);
      }
    }
  }

  private async _executeCollaborative(): Promise<void> {
    orchestrationLogger.strategy("collaborative", `Setting up ${this.workflow.agents.length} agents`);

    for (const agentConfig of this.workflow.agents) {
      this.messageBroker.subscribe(agentConfig.id, (message) => {
        this.poolManager.queueMessageFor(agentConfig.id, message);
        orchestrationLogger.info(agentConfig.id, `Message queued from ${message.fromAgentId}`);
      });
    }

    for (let turn = 0; turn < this.workflow.agents.length; turn++) {
      const agentConfig = this.workflow.agents[turn]!;
      orchestrationLogger.strategy("collaborative", `Turn ${turn + 1}: ${agentConfig.id}`);

      const result = await this._executeAgentWithMessaging(agentConfig);
      this.state.timeline.push(result);
      if (result.success) {
        this._updateSharedContext(agentConfig, result);
      }
    }
  }

  private async _executeDAG(): Promise<void> {
    orchestrationLogger.strategy("dag", "Executing with dependency-aware scheduling");
    const maxConcurrent = this.workflow.strategy.config.maxConcurrentAgents || 4;

    const pending = new Set(this.workflow.agents.map((a) => a.id));
    const running = new Set<string>();
    let batch: string[] = [];

    while (pending.size > 0 || running.size > 0) {
      const ready = this.poolManager.getReadyAgents();
      for (const agent of ready) {
        if (!pending.has(agent.config.id)) continue;
        if (batch.length < maxConcurrent) {
          batch.push(agent.config.id);
          pending.delete(agent.config.id);
          running.add(agent.config.id);
        }
      }

      if (batch.length === 0) {
        if (pending.size > 0) {
          const blocked = Array.from(pending);
          orchestrationLogger.error(
            "ORCHESTRATOR",
            `Deadlock: marking ${blocked.length} blocked agents as skipped`,
          );

          for (const blockedId of blocked) {
            const blockedAgent = this.workflow.agents.find((a) => a.id === blockedId);
            if (!blockedAgent) continue;

            this.poolManager.markAgentSkipped(blockedId);
            this.state.sharedContext.metadata.failedTasks.push(
              `${blockedId}: skipped (dependencies failed)`,
            );

            const emptyResult: AgentExecutionResult = {
              agentId: blockedId,
              success: false,
              output: "Agent skipped due to failed dependencies",
              executedTools: [],
              messagesReceived: [],
              messagesSent: [],
              context: this.poolManager.getAgent(blockedId)!.context,
              error: new Error("Dependencies failed"),
              durationMs: 0,
              attemptNumber: 1,
            };
            this.state.timeline.push(emptyResult);

            this._emitEvent({
              type: "agent:failed",
              timestamp: new Date(),
              agentId: blockedId,
              payload: { reason: "dependencies_failed" },
            });
          }
          pending.clear();
        }
        break;
      }

      orchestrationLogger.strategy("dag", `Executing batch: ${batch.join(", ")}`);
      const promises = batch.map((id) => {
        const cfg = this.workflow.agents.find((a) => a.id === id)!;
        return this._executeAgent(cfg);
      });

      const results = await Promise.allSettled(promises);
      batch = [];

      for (const settled of results) {
        const result = settled.status === "fulfilled" ? settled.value : null;
        if (!result) continue;

        running.delete(result.agentId);
        this.state.timeline.push(result);

        const agent = this.workflow.agents.find((a) => a.id === result.agentId);
        if (result.success && agent) {
          this._updateSharedContext(agent, result);
        } else if (agent) {
          await this._handleAgentFailure(agent, result);
        }
      }
    }
  }

  private _updateSharedContext(agentConfig: AgentConfig, result: AgentExecutionResult): void {
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
    this.state.sharedContext.metadata.completedTasks.push(`${agentConfig.id}: ${agentConfig.description}`);
  }

  private async _handleAgentFailure(
    agentConfig: AgentConfig,
    result: AgentExecutionResult,
  ): Promise<void> {
    const failureMode = this.workflow.strategy.config.failureMode ?? "fail-fast";
    const maxRetries = this.workflow.strategy.config.maxRetries ?? 1;
    const shouldRetry =
      this.workflow.strategy.config.retryOnFailure &&
      result.context.metadata.retryCount < maxRetries;

    if (shouldRetry) {
      this.poolManager.markAgentRetrying(agentConfig.id);
      this._emitEvent({
        type: "agent:retry",
        timestamp: new Date(),
        agentId: agentConfig.id,
        payload: { attempt: 1 + result.context.metadata.retryCount },
      });

      orchestrationLogger.info(
        agentConfig.id,
        `Retry ${1 + result.context.metadata.retryCount}/${maxRetries}`,
      );
      return;
    }

    this.poolManager.markAgentFailed(agentConfig.id);
    this.state.sharedContext.metadata.failedTasks.push(
      `${agentConfig.id}: ${agentConfig.description}`,
    );

    const dependentIds = this.workflow.agents
      .filter((a) => a.dependsOn?.includes(agentConfig.id))
      .map((a) => a.id);

    for (const depId of dependentIds) {
      const depAgent = this.poolManager.getAgent(depId);
      if (depAgent && (depAgent.status === "pending")) {
        this.poolManager.markAgentSkipped(depId);
        this.state.sharedContext.metadata.failedTasks.push(
          `${depId}: skipped (dependency ${agentConfig.id} failed)`,
        );

        const skipResult: AgentExecutionResult = {
          agentId: depId,
          success: false,
          output: `Skipped because dependency ${agentConfig.id} failed`,
          executedTools: [],
          messagesReceived: [],
          messagesSent: [],
          context: depAgent.context,
          error: new Error(`Dependency ${agentConfig.id} failed`),
          durationMs: 0,
          attemptNumber: 1,
        };
        this.state.timeline.push(skipResult);

        this._emitEvent({
          type: "agent:failed",
          timestamp: new Date(),
          agentId: depId,
          payload: { reason: `dependency_${agentConfig.id}_failed` },
        });

        const depAgentConfig = this.workflow.agents.find((a) => a.id === depId);
        if (depAgentConfig) {
          await this._handleAgentFailure(depAgentConfig, skipResult);
        }
      }
    }

    if (failureMode === "fail-fast") {
      throw new Error(
        `Agent ${agentConfig.id} failed: ${result.error?.message || "unknown error"}`,
      );
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  getAllTrackers(): Map<string, ActionTracker> {
    return this.trackers;
  }

  getSharedTracker(): ActionTracker {
    return this.sharedTracker;
  }

  getAllExecutors(): Map<string, ToolExecutor> {
    return this.executors;
  }

  getState(): OrchestratorState {
    return this.state;
  }

  getTimeline(): AgentExecutionResult[] {
    return this.state.timeline;
  }

  getMessageHistory(): AgentMessage[] {
    return this.messageBroker.messageBuffer;
  }

  getEvents(): OrchestratorEvent[] {
    return this.state.events;
  }

  pause(): void {
    this.state.status = "paused";
  }

  resume(): void {
    if (this.state.status === "paused") {
      this.state.status = "running";
    }
  }

  getSummary() {
    const poolStats = this.poolManager.getStats();
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
      poolStats,
      executionResults: this.state.timeline.map((r) => ({
        agentId: r.agentId,
        success: r.success,
        role: this.workflow.agents.find((a) => a.id === r.agentId)?.role,
        steps: r.context.metadata.currentStep,
        durationMs: r.durationMs,
        toolsUsed: r.executedTools,
        attemptNumber: r.attemptNumber,
      })),
    };
  }

  debugInfo(): string {
    const lines: string[] = [
      `=== Orchestrator Debug Info ===`,
      `Workflow: ${this.workflow.id}`,
      `Status: ${this.state.status}`,
      `Strategy: ${this.workflow.strategy.type}`,
      `\n${this.poolManager.debugSnapshot()}`,
      `\nMessage Broker: ${JSON.stringify(this.messageBroker.stats())}`,
      `Events: ${this.state.events.length}`,
    ];
    return lines.join("\n");
  }
}
