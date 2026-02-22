import { execSync } from "node:child_process";
import type { ContextManager } from "../core/context_manager";
import type { MessageStore } from "../core/message_store";
import type { WorktreeManager } from "../core/worktree_manager";
import { Agent } from "./agent.js";
import type { AgentProvider } from "./agent_provider.js";

export function hasInstructionOverlay(
  provider: unknown,
): provider is { applyInstructionOverlay(instructions: string): Promise<void> } {
  return typeof provider === "object" && provider !== null && "applyInstructionOverlay" in provider;
}

export interface WorkerOptions {
  autoCleanup?: boolean;
  keepOnError?: boolean;
}

/**
 * An agent that executes tasks in isolated git worktrees.
 */
export class Worker extends Agent {
  protected provider: AgentProvider | null = null;
  protected options: WorkerOptions = {};

  constructor(
    id: string,
    messageStore: MessageStore,
    contextManager: ContextManager,
    protected worktreeManager: WorktreeManager,
    options?: WorkerOptions,
  ) {
    super(id, messageStore, contextManager);
    this.options = options || {};
  }

  /**
   * Sets an AI provider for this worker.
   */
  setProvider(provider: AgentProvider): void {
    this.provider = provider;
  }

  /**
   * Sets up a worktree for a specific task.
   */
  async setupTask(path: string, branch: string): Promise<void> {
    await this.worktreeManager.create(path, branch);
    this.updateState({ currentWorktree: path, currentBranch: branch });

    if (this.provider) {
      await this.provider.init(this.id, path);
    }
  }

  /**
   * Sends a prompt to the AI provider.
   */
  async sendPrompt(prompt: string): Promise<string> {
    if (!this.provider) {
      throw new Error("No AI provider configured");
    }
    return this.provider.sendPrompt(prompt);
  }

  /**
   * Applies an instruction overlay to the worktree.
   */
  async applyInstructionOverlay(instructions: string): Promise<void> {
    if (this.provider && hasInstructionOverlay(this.provider)) {
      await this.provider.applyInstructionOverlay(instructions);
    }
  }

  /**
   * Executes a command in the task's worktree.
   */
  executeCommand(command: string, worktreePath: string): string {
    try {
      const output = execSync(command, { cwd: worktreePath, stdio: "pipe" }).toString();
      return output;
    } catch (error: any) {
      const stderr = error.stderr?.toString() || error.message;
      throw new Error(`Command failed: ${stderr}`);
    }
  }

  /**
   * Completes a task by removing the worktree and sending a result message.
   */
  async completeTask(result: string, success: boolean = true): Promise<void> {
    if (this.provider) {
      await this.provider.cleanup();
      this.provider = null;
    }

    const state = (this.contextManager as any).state; // Accessing internal state
    const path = state.currentWorktree;

    const shouldCleanup =
      this.options.autoCleanup !== false && (success || !this.options.keepOnError);

    if (path && shouldCleanup) {
      await this.worktreeManager.remove(path);
    }

    await this.sendMessage(
      "orchestrator",
      success ? "Task Succeeded" : "Task Failed",
      result,
      success ? "result" : "error",
    );

    this.updateState({ currentWorktree: null, currentBranch: null });
  }
}
