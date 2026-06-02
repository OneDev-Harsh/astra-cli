import type { AgentMessage, CommunicationChannel } from "./types";

/**
 * Implements a publish-subscribe communication channel for agents
 * to send and receive messages asynchronously.
 */
export class MessageBroker implements CommunicationChannel {
  messageBuffer: AgentMessage[] = [];
  subscribers: Map<string, (msg: AgentMessage) => void> = new Map();
  private messageId = 0;

  /**
   * Send a message that can be received by subscribed agents
   */
  broadcast(message: Omit<AgentMessage, "id" | "timestamp">): AgentMessage {
    const fullMessage: AgentMessage = {
      id: `msg_${++this.messageId}`,
      timestamp: new Date(),
      ...message,
    };

    this.messageBuffer.push(fullMessage);

    // Deliver to specific agent or broadcast to all
    if (message.toAgentId) {
      const callback = this.subscribers.get(message.toAgentId);
      if (callback) callback(fullMessage);
    } else {
      // Broadcast to all except sender
      for (const [agentId, callback] of this.subscribers.entries()) {
        if (agentId !== message.fromAgentId) {
          callback(fullMessage);
        }
      }
    }

    return fullMessage;
  }

  /**
   * Subscribe an agent to receive messages
   * Returns unsubscribe function
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

  /**
   * Get messages for a specific agent (including broadcasts)
   */
  getMessagesFor(agentId: string): AgentMessage[] {
    return this.messageBuffer.filter(
      (msg) => !msg.toAgentId || msg.toAgentId === agentId,
    );
  }

  /**
   * Clear message buffer
   */
  clearBuffer(): void {
    this.messageBuffer = [];
  }

  /**
   * Get message history between two agents
   */
  getConversation(agentId1: string, agentId2: string): AgentMessage[] {
    return this.messageBuffer.filter(
      (msg) =>
        (msg.fromAgentId === agentId1 && msg.toAgentId === agentId2) ||
        (msg.fromAgentId === agentId2 && msg.toAgentId === agentId1),
    );
  }

  /**
   * Replay messages for an agent in order
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
}
