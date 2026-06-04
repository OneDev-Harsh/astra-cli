import type {
  AgentConfig,
  AgentInstance,
  AgentPool,
  AgentContext,
  AgentMessage,
  AgentStatus,
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
      completedAgents: new Set(),
    };
  }

  // ─── Registration ──────────────────────────────────────────────────────────

  /**
   * Register a new agent in the pool.
   * Idempotent: re-registering the same ID replaces the existing instance.
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
          retryCount: 0,
        },
      },
      status: "pending",
      get isActive() {
        return this.status === "running";
      },
      lastMessageTime: new Date(),
      messageQueue: [],
      completionPercentage: 0,
    };

    this.pool.agents.set(config.id, instance);
    this.pool.waitingAgents.add(config.id);

    return instance;
  }

  // ─── Lookups ───────────────────────────────────────────────────────────────

  getAgent(agentId: string): AgentInstance | undefined {
    return this.pool.agents.get(agentId);
  }

  getAgentsByRole(role: string): AgentInstance[] {
    return Array.from(this.pool.agents.values()).filter(
      (agent) => agent.config.role === role,
    );
  }

  getAgentsByTag(tag: string): AgentInstance[] {
    return Array.from(this.pool.agents.values()).filter(
      (agent) => agent.config.tags?.includes(tag),
    );
  }

  getAgentsByStatus(status: AgentStatus): AgentInstance[] {
    return Array.from(this.pool.agents.values()).filter(
      (agent) => agent.status === status,
    );
  }

  getActiveAgents(): AgentInstance[] {
    return this._resolveIds(this.pool.activeAgents);
  }

  getWaitingAgents(): AgentInstance[] {
    return this._resolveIds(this.pool.waitingAgents);
  }

  getFailedAgents(): AgentInstance[] {
    return this._resolveIds(this.pool.failedAgents);
  }

  getCompletedAgents(): AgentInstance[] {
    return this._resolveIds(this.pool.completedAgents);
  }

  getAllAgents(): AgentInstance[] {
    return Array.from(this.pool.agents.values());
  }

  private _resolveIds(ids: Set<string>): AgentInstance[] {
    const result: AgentInstance[] = [];
    for (const id of ids) {
      const agent = this.pool.agents.get(id);
      if (agent) result.push(agent);
    }
    return result;
  }

  // ─── Status Transitions ────────────────────────────────────────────────────

  activateAgent(agentId: string): boolean {
    const agent = this.pool.agents.get(agentId);
    if (!agent) return false;

    agent.status = "running";
    agent.startedAt = new Date();
    agent.lastMessageTime = new Date();

    this.pool.waitingAgents.delete(agentId);
    this.pool.failedAgents.delete(agentId);
    this.pool.completedAgents.delete(agentId);
    this.pool.activeAgents.add(agentId);

    return true;
  }

  deactivateAgent(agentId: string): boolean {
    const agent = this.pool.agents.get(agentId);
    if (!agent) return false;

    agent.status = "completed";
    agent.completedAt = new Date();
    agent.completionPercentage = 100;

    this.pool.activeAgents.delete(agentId);
    this.pool.waitingAgents.delete(agentId);
    this.pool.completedAgents.add(agentId);

    return true;
  }

  markAgentFailed(agentId: string): boolean {
    const agent = this.pool.agents.get(agentId);
    if (!agent) return false;

    agent.status = "failed";
    agent.completedAt = new Date();

    this.pool.activeAgents.delete(agentId);
    this.pool.waitingAgents.delete(agentId);
    this.pool.failedAgents.add(agentId);

    return true;
  }

  markAgentRetrying(agentId: string): boolean {
    const agent = this.pool.agents.get(agentId);
    if (!agent) return false;

    agent.status = "retrying";
    agent.context.metadata.retryCount++;

    this.pool.failedAgents.delete(agentId);
    this.pool.activeAgents.delete(agentId);
    this.pool.waitingAgents.add(agentId);

    return true;
  }

  markAgentSkipped(agentId: string): boolean {
    const agent = this.pool.agents.get(agentId);
    if (!agent) return false;

    agent.status = "skipped";
    agent.completedAt = new Date();

    this.pool.waitingAgents.delete(agentId);
    this.pool.activeAgents.delete(agentId);
    this.pool.completedAgents.add(agentId);

    return true;
  }

  // ─── Messaging ─────────────────────────────────────────────────────────────

  queueMessageFor(agentId: string, message: AgentMessage): boolean {
    const agent = this.pool.agents.get(agentId);
    if (!agent) return false;

    agent.messageQueue.push(message);
    agent.context.conversationHistory.push(message);
    return true;
  }

  /** Drain and return the message queue for an agent */
  flushMessageQueue(agentId: string): AgentMessage[] {
    const agent = this.pool.agents.get(agentId);
    if (!agent) return [];

    const messages = [...agent.messageQueue];
    agent.messageQueue = [];
    return messages;
  }

  // ─── Context & Progress ────────────────────────────────────────────────────

  updateCompletion(agentId: string, percentage: number): boolean {
    const agent = this.pool.agents.get(agentId);
    if (!agent) return false;

    agent.completionPercentage = Math.min(100, Math.max(0, percentage));
    return true;
  }

  updateContext(agentId: string, context: Partial<AgentContext>): boolean {
    const agent = this.pool.agents.get(agentId);
    if (!agent) return false;

    Object.assign(agent.context, context);
    return true;
  }

  setFinding(agentId: string, key: string, value: unknown): boolean {
    const agent = this.pool.agents.get(agentId);
    if (!agent) return false;

    if (!agent.context.metadata.findings) {
      agent.context.metadata.findings = {};
    }
    agent.context.metadata.findings[key] = value;
    return true;
  }

  // ─── DAG Dependency Checking ───────────────────────────────────────────────

  /**
   * Returns true if all agents listed in `dependsOn` for the given agent
   * have completed successfully.
   */
  areDependenciesMet(agentId: string): boolean {
    const agent = this.pool.agents.get(agentId);
    if (!agent) return false;

    const deps = agent.config.dependsOn ?? [];
    for (const depId of deps) {
      const dep = this.pool.agents.get(depId);
      if (!dep || dep.status !== "completed") return false;
    }
    return true;
  }

  /**
   * Returns agent IDs whose dependencies are all completed and which are
   * currently waiting (ready to run).
   */
  getReadyAgents(): AgentInstance[] {
    return Array.from(this.pool.waitingAgents)
      .map((id) => this.pool.agents.get(id))
      .filter(
        (agent): agent is AgentInstance =>
          agent !== undefined && this.areDependenciesMet(agent.config.id),
      );
  }

  // ─── Pool Inspection ──────────────────────────────────────────────────────

  getPool(): AgentPool {
    return this.pool;
  }

  areAllAgentsSettled(): boolean {
    return (
      this.pool.activeAgents.size === 0 &&
      this.pool.waitingAgents.size === 0
    );
  }

  areAllAgentsComplete(): boolean {
    return (
      this.pool.activeAgents.size === 0 &&
      this.pool.waitingAgents.size === 0 &&
      this.pool.failedAgents.size === 0
    );
  }

  hasFailedAgents(): boolean {
    return this.pool.failedAgents.size > 0;
  }

  reset(): void {
    this.pool = {
      agents: new Map(),
      activeAgents: new Set(),
      waitingAgents: new Set(),
      failedAgents: new Set(),
      completedAgents: new Set(),
    };
  }

  getStats() {
    const agents = Array.from(this.pool.agents.values());
    const completionPercentage =
      agents.length > 0
        ? Math.round(
            agents.reduce((sum, a) => sum + a.completionPercentage, 0) /
              agents.length,
          )
        : 0;

    return {
      totalAgents: this.pool.agents.size,
      activeAgents: this.pool.activeAgents.size,
      waitingAgents: this.pool.waitingAgents.size,
      failedAgents: this.pool.failedAgents.size,
      completedAgents: this.pool.completedAgents.size,
      completionPercentage,
    };
  }

  /** Human-readable status snapshot for debugging */
  debugSnapshot(): string {
    const lines: string[] = [`Pool snapshot (${this.pool.agents.size} agents):`];
    for (const [id, agent] of this.pool.agents) {
      lines.push(
        `  ${id.padEnd(24)} ${agent.status.padEnd(12)} ${agent.completionPercentage}%  retry=${agent.context.metadata.retryCount}`,
      );
    }
    return lines.join("\n");
  }
}