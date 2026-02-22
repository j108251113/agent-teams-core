import { EventEmitter } from "node:events";
import type { MessageStore } from "../core/message_store";

export type TaskStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export interface Task {
  id: string;
  status: TaskStatus;
  dependencies: string[];
  command: string;
  assignedTo?: string;
  result?: string;
  error?: string;
}

/**
 * Orchestrates tasks in a Directed Acyclic Graph (DAG) and dispatches them to agents.
 */
export class Orchestrator extends EventEmitter {
  private tasks: Map<string, Task>;
  private running = false;

  constructor(
    initialTasks: Task[],
    private messageStore: MessageStore,
  ) {
    super();
    this.tasks = new Map(initialTasks.map((t) => [t.id, t]));
  }

  /**
   * Gets a task by ID.
   */
  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  /**
   * Returns all tasks that are ready to run (PENDING and dependencies COMPLETED).
   */
  getReadyTasks(): Task[] {
    return Array.from(this.tasks.values()).filter((task) => {
      if (task.status !== "PENDING") return false;
      return task.dependencies.every((depId) => {
        const dep = this.tasks.get(depId);
        return dep?.status === "COMPLETED";
      });
    });
  }

  /**
   * Checks for new messages from agents and updates task statuses.
   */
  async pollMessages(): Promise<void> {
    const messages = await this.messageStore.check("orchestrator", { unreadOnly: true });

    for (const msg of messages) {
      // Find which task this message relates to (based on the agent that sent it)
      const task = Array.from(this.tasks.values()).find(
        (t) => t.assignedTo === msg.from && t.status === "RUNNING",
      );

      if (task) {
        if (msg.type === "result") {
          task.status = "COMPLETED";
          task.result = msg.body;
        } else if (msg.type === "error") {
          task.status = "FAILED";
          task.error = msg.body;
        }
        await this.messageStore.markAsRead(msg.id);
      }
    }
  }

  /**
   * Assigns a task to an agent and marks it as RUNNING.
   */
  assignTask(taskId: string, agentId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = "RUNNING";
      task.assignedTo = agentId;
    }
  }

  /**
   * Checks if all tasks are finished (completed, failed, or blocked by failed dependencies).
   */
  isFinished(): boolean {
    const tasks = Array.from(this.tasks.values());

    const allTerminal = tasks.every((t) => t.status === "COMPLETED" || t.status === "FAILED");
    if (allTerminal) return true;

    const anyRunning = tasks.some((t) => t.status === "RUNNING");
    if (anyRunning) return false;

    const readyTasks = this.getReadyTasks();
    if (readyTasks.length === 0) {
      return true;
    }

    return false;
  }

  /**
   * Returns the current status of all tasks.
   */
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Starts the orchestration loop.
   */
  async run(pollIntervalMs = 1000): Promise<void> {
    this.running = true;

    while (this.running) {
      await this.pollMessages();

      const readyTasks = this.getReadyTasks();
      for (const task of readyTasks) {
        this.emit("taskReady", task);
      }

      if (this.isFinished()) {
        this.running = false;
        this.emit("finished", this.getAllTasks());
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  /**
   * Stops the orchestration loop.
   */
  stop(): void {
    this.running = false;
  }
}
