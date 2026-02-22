import { join } from "node:path";
import type { MessageStore } from "../core/message_store";
import type { WorktreeManager } from "../core/worktree_manager";
import type { AgentProvider, AgentProviderConfig, AgentProviderType } from "./agent_provider.js";
import { CopilotProvider } from "./copilot_provider.js";
import { OpencodeProvider } from "./opencode_provider.js";
import type { Orchestrator, Task } from "./orchestrator";
import { Worker } from "./worker.js";

export interface WorkerPoolOptions {
  messageStore: MessageStore;
  worktreeManager: WorktreeManager;
  repoRoot: string;
  worktreesDir: string;
  provider?: AgentProviderConfig;
  autoCleanup?: boolean;
  keepOnError?: boolean;
}

function createProvider(config: AgentProviderConfig): AgentProvider {
  switch (config.type) {
    case "copilot":
      return new CopilotProvider();
    case "opencode":
      return new OpencodeProvider();
    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
}

/**
 * Manages a pool of workers and coordinates with the Orchestrator.
 */
export class WorkerPool {
  private workers: Map<string, Worker> = new Map();
  private provider: AgentProvider | null = null;

  constructor(private options: WorkerPoolOptions) {
    if (options.provider) {
      this.provider = createProvider(options.provider);
    }
  }

  /**
   * Set the AI provider for this pool.
   */
  setProvider(type: AgentProviderType): void {
    this.provider = createProvider({ type });
  }

  /**
   * Attaches the pool to an Orchestrator.
   */
  attach(orchestrator: Orchestrator): void {
    orchestrator.on("taskReady", async (task: Task) => {
      await this.handleTaskReady(orchestrator, task);
    });
  }

  private async handleTaskReady(orchestrator: Orchestrator, task: Task): Promise<void> {
    const workerId = `worker-${task.id}`;

    const { ContextManager } = await import("../core/context_manager");
    const contextManager = new ContextManager({ limit: 10000 });

    const workerOptions = {
      autoCleanup: this.options.autoCleanup ?? true,
      keepOnError: this.options.keepOnError ?? false,
    };

    const worker = new Worker(
      workerId,
      this.options.messageStore,
      contextManager,
      this.options.worktreeManager,
      workerOptions,
    );

    if (this.provider) {
      worker.setProvider(this.provider);
    }

    this.workers.set(workerId, worker);
    orchestrator.assignTask(task.id, workerId);

    const worktreePath = join(this.options.worktreesDir, task.id);
    const branchName = `task/${task.id}`;

    try {
      await worker.setupTask(worktreePath, branchName);

      const output = worker.executeCommand(task.command, worktreePath);

      await worker.completeTask(output, true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await worker.completeTask(message, false);
    } finally {
      this.workers.delete(workerId);
    }
  }
}
