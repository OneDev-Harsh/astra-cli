/**
 * Multi-Agent Orchestration Types
 *
 * Defines the interfaces and types for coordinating multiple agents
 * working together on complex tasks.
 */

export type AgentRole =
  | 'researcher'      // Gathers information and analyzes
  | 'implementer'     // Writes code and modifies files
  | 'reviewer'        // Reviews changes and validates
  | 'coordinator'     // Manages workflow and delegates tasks
  | 'custom'          // Custom role defined by user

export interface AgentConfig {
  id: string
  role: AgentRole
  name: string
  description: string
  model?: string  // Override default model (e.g. "anthropic/claude-sonnet-4.5")
  maxSteps: number
  tools: string[]  // List of tool names this agent can use
  systemPrompt?: string  // Custom system instructions
  specializations?: string[]  // What this agent is good at
}

export interface AgentMessage {
  id: string
  fromAgentId: string
  toAgentId?: string  // undefined = broadcast to all
  type: 'request' | 'response' | 'status' | 'error' | 'result'
  content: string
  context?: Record<string, unknown>
  timestamp: Date
  requiresResponse: boolean
}

export interface AgentContext {
  goal: string
  conversationHistory: AgentMessage[]
  sharedState: Map<string, unknown>
  parentContext?: AgentContext  // For nested orchestrations
  metadata: {
    startTime: Date
    currentStep: number
    completedTasks: string[]
    failedTasks: string[]
  }
}

export interface AgentExecutionResult {
  agentId: string
  success: boolean
  output: string
  executedTools: string[]
  messagesReceived: AgentMessage[]
  messagesSent: AgentMessage[]
  context: AgentContext
  error?: Error
}

export interface OrchestrationStrategy {
  type: 'sequential' | 'parallel' | 'hierarchical' | 'collaborative'
  config: {
    maxConcurrentAgents?: number
    timeout?: number  // milliseconds
    retryOnFailure?: boolean
    maxRetries?: number
    fallbackAgents?: string[]  // Agent IDs to fall back to
  }
}

export interface MultiAgentWorkflow {
  id: string
  goal: string
  agents: AgentConfig[]
  strategy: OrchestrationStrategy
  initialPrompt: string
  expectedOutput?: string
  createdAt: Date
  updatedAt: Date
}

export interface AgentPool {
  agents: Map<string, AgentInstance>
  activeAgents: Set<string>
  waitingAgents: Set<string>
  failedAgents: Set<string>
}

export interface AgentInstance {
  config: AgentConfig
  context: AgentContext
  isActive: boolean
  lastMessageTime: Date
  messageQueue: AgentMessage[]
  completionPercentage: number
}

export interface OrchestratorState {
  workflowId: string
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed'
  pool: AgentPool
  sharedContext: AgentContext
  timeline: AgentExecutionResult[]
  startTime: Date
  endTime?: Date
  currentCoordinator: string  // ID of the agent currently coordinating
}

export interface CommunicationChannel {
  messageBuffer: AgentMessage[]
  subscribers: Map<string, (msg: AgentMessage) => void>
  broadcast(message: Omit<AgentMessage, 'id' | 'timestamp'>): AgentMessage
  subscribe(agentId: string, callback: (msg: AgentMessage) => void): () => void
  getMessagesFor(agentId: string): AgentMessage[]
  getConversation(agentId1: string, agentId2: string): AgentMessage[]
  clearBuffer(): void
}
