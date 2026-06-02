import type {
  AgentConfig,
  AgentInstance,
  AgentPool,
  AgentContext,
  AgentMessage,
} from "./types";

/**
 * Manages a pool of agent instances, tracking their status,
 * availability, and execution state.
 */
export class AgentPoolManager {
  private pool: AgentPool;

  constructor() {
    this.pool = {
      agents: new Map(),
      activeAgents: new Set(),
      waitingAgents: new Set(),
      failedAgents: new Set(),
    };
  }

  /**
   * Register a new agent in the pool
   */
  registerAgent(config: AgentConfig): AgentInstance {
    const instance: AgentInstance = {
      config,
      context: {
        goal: "",
        conversationHistory: [],
        sharedState: new Map(),
        metadata: {
          startTime: new Date(),
          currentStep: 0,
          completedTasks: [],
          failedTasks: [],
        },
      },
      isActive: false,
      lastMessageTime: new Date(),
      messageQueue: [],
      completionPercentage: 0,
    };

    this.pool.agents.set(config.id, instance);
    this.pool.waitingAgents.add(config.id);

    return instance;
  }

  /**
   * Get an agent by ID
   */
  getAgent(agentId: string): AgentInstance | undefined {
    return this.pool.agents.get(agentId);
  }

  /**
   * Get all agents with a specific role
   */
  getAgentsByRole(role: string): AgentInstance[] {
    return Array.from(this.pool.agents.values()).filter(
      (agent) => agent.config.role === role,
    );
  }

  /**
   * Get all active agents
   */
  getActiveAgents(): AgentInstance[] {
    return Array.from(this.pool.activeAgents)
      .map((id) => this.pool.agents.get(id))
      .filter((agent) => agent !== undefined) as AgentInstance[];
  }

  /**
   * Get all waiting agents (ready but not active)
   */
  getWaitingAgents(): AgentInstance[] {
    return Array.from(this.pool.waitingAgents)
      .map((id) => this.pool.agents.get(id))
      .filter((agent) => agent !== undefined) as AgentInstance[];
  }

  /**
   * Get all failed agents
   */
  getFailedAgents(): AgentInstance[] {
    return Array.from(this.pool.failedAgents)
      .map((id) => this.pool.agents.get(id))
      .filter((agent) => agent !== undefined) as AgentInstance[];
  }

  /**
   * Mark an agent as active (currently executing)
   */
  activateAgent(agentId: string): boolean {
    const agent = this.pool.agents.get(agentId);
    if (!agent) return false;

    agent.isActive = true;
    agent.lastMessageTime = new Date();
    this.pool.waitingAgents.delete(agentId);
    this.pool.activeAgents.add(agentId);
    this.pool.failedAgents.delete(agentId);

    return true;
  }

  /**
   * Mark an agent as inactive (waiting)
   */
  deactivateAgent(agentId: string): boolean {
    const agent = this.pool.agents.get(agentId);
    if (!agent) return false;

    agent.isActive = false;
    this.pool.activeAgents.delete(agentId);
    this.pool.waitingAgents.add(agentId);

    return true;
  }

  /**
   * Mark an agent as failed
   */
  markAgentFailed(agentId: string): boolean {
    const agent = this.pool.agents.get(agentId);
    if (!agent) return false;

    agent.isActive = false;
    this.pool.activeAgents.delete(agentId);
    this.pool.waitingAgents.delete(agentId);
    this.pool.failedAgents.add(agentId);

    return true;
  }

  /**
   * Queue a message for an agent
   */
  queueMessageFor(agentId: string, message: AgentMessage): boolean {
    const agent = this.pool.agents.get(agentId);
    if (!agent) return false;

    agent.messageQueue.push(message);
    agent.context.conversationHistory.push(message);
    return true;
  }

  /**
   * Get and clear message queue for an agent
   */
  flushMessageQueue(agentId: string): AgentMessage[] {
    const agent = this.pool.agents.get(agentId);
    if (!agent) return [];

    const messages = agent.messageQueue;
    agent.messageQueue = [];
    return messages;
  }

  /**
   * Update agent completion percentage
   */
  updateCompletion(agentId: string, percentage: number): boolean {
    const agent = this.pool.agents.get(agentId);
    if (!agent) return false;

    agent.completionPercentage = Math.min(100, Math.max(0, percentage));
    return true;
  }

  /**
   * Update agent context
   */
  updateContext(agentId: string, context: Partial<AgentContext>): boolean {
    const agent = this.pool.agents.get(agentId);
    if (!agent) return false;

    Object.assign(agent.context, context);
    return true;
  }

  /**
   * Get the full pool state
   */
  getPool(): AgentPool {
    return this.pool;
  }

  /**
   * Check if all agents have completed
   */
  areAllAgentsComplete(): boolean {
    return (
      this.pool.activeAgents.size === 0 && this.pool.waitingAgents.size === 0
    );
  }

  /**
   * Check if any agents have failed
   */
  hasFailedAgents(): boolean {
    return this.pool.failedAgents.size > 0;
  }

  /**
   * Reset the entire pool
   */
  reset(): void {
    this.pool = {
      agents: new Map(),
      activeAgents: new Set(),
      waitingAgents: new Set(),
      failedAgents: new Set(),
    };
  }

  /**
   * Get statistics about the pool
   */
  getStats() {
    return {
      totalAgents: this.pool.agents.size,
      activeAgents: this.pool.activeAgents.size,
      waitingAgents: this.pool.waitingAgents.size,
      failedAgents: this.pool.failedAgents.size,
      completionPercentage:
        this.pool.agents.size > 0
          ? Math.round(
              Array.from(this.pool.agents.values()).reduce(
                (sum, agent) => sum + agent.completionPercentage,
                0,
              ) / this.pool.agents.size,
            )
          : 0,
    };
  }
}
