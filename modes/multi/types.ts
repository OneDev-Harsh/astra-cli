/**
 * Multi-Agent Orchestration Types
 *
 * Defines the interfaces and types for coordinating multiple agents
 * working together on complex tasks.
 */

// ─── Core Agent Types ────────────────────────────────────────────────────────

export type AgentRole =
  | "researcher"   // Gathers information and analyzes
  | "implementer"  // Writes code and modifies files
  | "reviewer"     // Reviews changes and validates
  | "coordinator"  // Manages workflow and delegates tasks
  | "custom";      // Custom role defined by user

export type AgentStatus = "pending" | "running" | "completed" | "failed" | "skipped" | "retrying";

export interface AgentConfig {
  id: string;
  role: AgentRole;
  name: string;
  description: string;
  model?: string;             // Override default model (e.g. "anthropic/claude-sonnet-4.5")
  maxSteps: number;
  tools: string[];            // List of tool names this agent can use
  systemPrompt?: string;      // Custom system instructions
  specializations?: string[]; // What this agent is good at
  /** IDs of agents that must complete before this one starts (DAG dependency) */
  dependsOn?: string[];
  /** Hard timeout in ms for this specific agent (overrides strategy timeout) */
  timeoutMs?: number;
  /** Tags for grouping/filtering agents */
  tags?: string[];
}

// ─── Messaging ───────────────────────────────────────────────────────────────

export type MessageType = "request" | "response" | "status" | "error" | "result" | "handoff";

export interface AgentMessage {
  id: string;
  fromAgentId: string;
  toAgentId?: string;         // undefined = broadcast to all
  type: MessageType;
  content: string;
  context?: Record<string, unknown>;
  timestamp: Date;
  requiresResponse: boolean;
  /** Message this is a reply to */
  replyToId?: string;
  /** Priority for ordering message delivery */
  priority?: "low" | "normal" | "high";
}

// ─── Context & State ─────────────────────────────────────────────────────────

export interface AgentContext {
  goal: string;
  conversationHistory: AgentMessage[];
  sharedState: Map<string, unknown>;
  parentContext?: AgentContext;
  metadata: AgentContextMetadata;
}

export interface AgentContextMetadata {
  startTime: Date;
  endTime?: Date;
  currentStep: number;
  completedTasks: string[];
  failedTasks: string[];
  retryCount: number;
  /** Structured findings the agent surfaced for downstream agents */
  findings?: Record<string, unknown>;
  /** Tokens used, if tracked by the model provider */
  tokensUsed?: number;
}

// ─── Execution Results ───────────────────────────────────────────────────────

export interface AgentExecutionResult {
  agentId: string;
  success: boolean;
  output: string;
  executedTools: string[];
  messagesReceived: AgentMessage[];
  messagesSent: AgentMessage[];
  context: AgentContext;
  error?: Error;
  /** Wall-clock duration in ms */
  durationMs: number;
  /** Which attempt produced this result (1-based) */
  attemptNumber: number;
}

// ─── Orchestration Strategy ──────────────────────────────────────────────────

export type StrategyType = "sequential" | "parallel" | "hierarchical" | "collaborative" | "dag";

export interface OrchestrationStrategy {
  type: StrategyType;
  config: StrategyConfig;
}

export interface StrategyConfig {
  maxConcurrentAgents?: number;
  /** Default timeout in ms applied to all agents (can be overridden per-agent) */
  timeout?: number;
  retryOnFailure?: boolean;
  maxRetries?: number;
  fallbackAgents?: string[];
  /**
   * "fail-fast": abort entire workflow on first agent failure (default for sequential).
   * "continue": skip failed agents and continue.
   * "fail-at-end": complete all agents, then surface errors.
   */
  failureMode?: "fail-fast" | "continue" | "fail-at-end";
}

// ─── Workflow ─────────────────────────────────────────────────────────────────

export interface MultiAgentWorkflow {
  id: string;
  goal: string;
  agents: AgentConfig[];
  strategy: OrchestrationStrategy;
  initialPrompt: string;
  expectedOutput?: string;
  createdAt: Date;
  updatedAt: Date;
  /** Optional metadata bag for user-defined fields */
  meta?: Record<string, unknown>;
}

// ─── Pool ────────────────────────────────────────────────────────────────────

export interface AgentPool {
  agents: Map<string, AgentInstance>;
  activeAgents: Set<string>;
  waitingAgents: Set<string>;
  failedAgents: Set<string>;
  completedAgents: Set<string>;
}

export interface AgentInstance {
  config: AgentConfig;
  context: AgentContext;
  status: AgentStatus;
  /** For backward compat */
  get isActive(): boolean;
  lastMessageTime: Date;
  messageQueue: AgentMessage[];
  completionPercentage: number;
  startedAt?: Date;
  completedAt?: Date;
}

// ─── Orchestrator State ───────────────────────────────────────────────────────

export type OrchestratorStatus = "pending" | "running" | "paused" | "completed" | "failed";

export interface OrchestratorState {
  workflowId: string;
  status: OrchestratorStatus;
  pool: AgentPool;
  sharedContext: AgentContext;
  timeline: AgentExecutionResult[];
  startTime: Date;
  endTime?: Date;
  currentCoordinator: string;
  /** Emitted events in order */
  events: OrchestratorEvent[];
}

// ─── Events ───────────────────────────────────────────────────────────────────

export type OrchestratorEventType =
  | "workflow:start"
  | "workflow:complete"
  | "workflow:failed"
  | "agent:start"
  | "agent:complete"
  | "agent:failed"
  | "agent:retry"
  | "agent:timeout"
  | "strategy:phase"
  | "message:sent";

export interface OrchestratorEvent {
  type: OrchestratorEventType;
  timestamp: Date;
  agentId?: string;
  payload?: Record<string, unknown>;
}

export type OrchestratorEventListener = (event: OrchestratorEvent) => void;

// ─── Communication ────────────────────────────────────────────────────────────

export interface CommunicationChannel {
  messageBuffer: AgentMessage[];
  subscribers: Map<string, (msg: AgentMessage) => void>;
  broadcast(message: Omit<AgentMessage, "id" | "timestamp">): AgentMessage;
  subscribe(agentId: string, callback: (msg: AgentMessage) => void): () => void;
  getMessagesFor(agentId: string): AgentMessage[];
  getConversation(agentId1: string, agentId2: string): AgentMessage[];
  clearBuffer(): void;
}

// ─── Summary Types ────────────────────────────────────────────────────────────

export interface AgentResultSummary {
  agentId: string;
  success: boolean;
  role: AgentRole | undefined;
  steps: number;
  durationMs: number;
  toolsUsed: string[];
  attemptNumber: number;
  output?: string;
}

export interface PoolStats {
  totalAgents: number;
  activeAgents: number;
  waitingAgents: number;
  failedAgents: number;
  completedAgents: number;
  completionPercentage: number;
}

export interface OrchestratorSummary {
  workflowId: string;
  status: OrchestratorStatus;
  goal: string;
  strategy: StrategyType;
  startTime: Date;
  endTime?: Date;
  duration: number | null;
  totalAgents: number;
  completedTasks: number;
  failedTasks: number;
  poolStats: PoolStats;
  executionResults: AgentResultSummary[];
}