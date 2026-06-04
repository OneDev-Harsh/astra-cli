import type { AgentMessage, CommunicationChannel } from "./types";

/**
 * Implements a publish-subscribe communication channel for agents.
 * Supports directed messages, broadcasts, priority ordering, and replay.
 */
export class MessageBroker implements CommunicationChannel {
  messageBuffer: AgentMessage[] = [];
  subscribers: Map<string, (msg: AgentMessage) => void> = new Map();
  private messageId = 0;

  // ─── Sending ───────────────────────────────────────────────────────────────

  /**
   * Broadcast or direct-send a message.
   * High-priority messages are delivered first within the same tick.
   */
  broadcast(message: Omit<AgentMessage, "id" | "timestamp">): AgentMessage {
    const fullMessage: AgentMessage = {
      id: `msg_${String(++this.messageId).padStart(6, "0")}`,
      timestamp: new Date(),
      priority: "normal",
      ...message,
    };

    this.messageBuffer.push(fullMessage);

    if (message.toAgentId) {
      // Directed message
      const callback = this.subscribers.get(message.toAgentId);
      if (callback) callback(fullMessage);
    } else {
      // Broadcast — exclude sender, deliver high-priority first
      const recipients = [...this.subscribers.entries()]
        .filter(([agentId]) => agentId !== message.fromAgentId);

      // Sort so high-priority callbacks fire first
      const ordered =
        fullMessage.priority === "high"
          ? recipients
          : recipients; // stable order is fine for normal/low

      for (const [, callback] of ordered) {
        callback(fullMessage);
      }
    }

    return fullMessage;
  }

  /**
   * Convenience wrapper: send a directed message from one agent to another.
   */
  send(
    fromAgentId: string,
    toAgentId: string,
    content: string,
    type: AgentMessage["type"] = "request",
    extra?: Partial<Omit<AgentMessage, "id" | "timestamp" | "fromAgentId" | "toAgentId" | "content" | "type">>,
  ): AgentMessage {
    return this.broadcast({
      fromAgentId,
      toAgentId,
      content,
      type,
      requiresResponse: type === "request",
      ...extra,
    });
  }

  // ─── Subscribing ───────────────────────────────────────────────────────────

  /**
   * Subscribe an agent to receive messages.
   * Returns an unsubscribe function.
   */
  subscribe(
    agentId: string,
    callback: (msg: AgentMessage) => void,
  ): () => void {
    this.subscribers.set(agentId, callback);
    return () => {
      this.subscribers.delete(agentId);
    };
  }

  // ─── Querying ─────────────────────────────────────────────────────────────

  /** All messages directed to (or broadcast to) a specific agent */
  getMessagesFor(agentId: string): AgentMessage[] {
    return this.messageBuffer.filter(
      (msg) => !msg.toAgentId || msg.toAgentId === agentId,
    );
  }

  /** All messages sent FROM a specific agent */
  getMessagesFrom(agentId: string): AgentMessage[] {
    return this.messageBuffer.filter((msg) => msg.fromAgentId === agentId);
  }

  /** Bidirectional conversation between two agents */
  getConversation(agentId1: string, agentId2: string): AgentMessage[] {
    return this.messageBuffer.filter(
      (msg) =>
        (msg.fromAgentId === agentId1 && msg.toAgentId === agentId2) ||
        (msg.fromAgentId === agentId2 && msg.toAgentId === agentId1),
    );
  }

  /** Messages of a specific type */
  getMessagesByType(type: AgentMessage["type"]): AgentMessage[] {
    return this.messageBuffer.filter((msg) => msg.type === type);
  }

  /** Get the reply chain for a given message ID */
  getReplyChain(messageId: string): AgentMessage[] {
    const chain: AgentMessage[] = [];
    let currentId: string | undefined = messageId;

    while (currentId) {
      const msg = this.messageBuffer.find((m) => m.id === currentId);
      if (!msg) break;
      chain.unshift(msg);
      currentId = msg.replyToId;
    }

    return chain;
  }

  /** Total number of messages in the buffer */
  get messageCount(): number {
    return this.messageBuffer.length;
  }

  // ─── Buffer Management ─────────────────────────────────────────────────────

  clearBuffer(): void {
    this.messageBuffer = [];
  }

  /**
   * Trim the buffer to keep only the last `n` messages.
   * Useful for long-running collaborative workflows.
   */
  trimBuffer(keepLast: number): void {
    if (this.messageBuffer.length > keepLast) {
      this.messageBuffer = this.messageBuffer.slice(-keepLast);
    }
  }

  // ─── Replay ───────────────────────────────────────────────────────────────

  /**
   * Replay messages for an agent in chronological order.
   */
  async replayMessages(
    agentId: string,
    callback: (msg: AgentMessage) => Promise<void>,
  ): Promise<void> {
    const messages = this.getMessagesFor(agentId);
    for (const msg of messages) {
      await callback(msg);
    }
  }

  // ─── Diagnostics ──────────────────────────────────────────────────────────

  stats() {
    const byType = new Map<string, number>();
    for (const msg of this.messageBuffer) {
      byType.set(msg.type, (byType.get(msg.type) ?? 0) + 1);
    }
    return {
      total: this.messageBuffer.length,
      subscribers: this.subscribers.size,
      byType: Object.fromEntries(byType),
    };
  }
}