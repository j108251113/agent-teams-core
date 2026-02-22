import type { ContextManager } from "../core/context_manager";
import type { Message, MessageStore } from "../core/message_store";

/**
 * Base class for all agents in the system.
 */
export class Agent {
  constructor(
    public readonly id: string,
    protected messageStore: MessageStore,
    protected contextManager: ContextManager,
  ) {}

  /**
   * Sends a message to another agent or the orchestrator.
   */
  async sendMessage(
    to: string,
    subject: string,
    body: string,
    type: Message["type"],
    payload?: string,
  ): Promise<void> {
    await this.messageStore.send({
      from: this.id,
      to,
      subject,
      body,
      type,
      payload,
    });
  }

  /**
   * Records a dialogue exchange to track context usage.
   */
  recordExchange(prompt: string, response: string): void {
    this.contextManager.recordExchange(prompt, response);
  }

  /**
   * Checks if the agent needs a context refresh.
   */
  needsRefresh(): boolean {
    return this.contextManager.needsRefresh();
  }

  /**
   * Gets current context usage estimate.
   */
  getContextUsage(): number {
    return this.contextManager.getUsage();
  }

  /**
   * Updates the agent's internal state.
   */
  updateState(state: Record<string, any>): void {
    this.contextManager.updateState(state);
  }

  /**
   * Returns a special prompt to help the agent restore its state after a context clear.
   */
  getRestorationInstructions(): string {
    const checkpoint = this.contextManager.createCheckpoint();
    return `
### RESTORE_FROM_CHECKPOINT ###
Agent ID: ${this.id}
Timestamp: ${checkpoint.timestamp}

Current State:
${JSON.stringify(checkpoint.state, null, 2)}

Summary of previous actions:
${checkpoint.historySummary}

Please continue from your last state and provide the next step for your task.
`.trim();
  }
}
