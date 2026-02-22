import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MessageStore } from "../../core/message_store";
import { Orchestrator, type Task } from "../orchestrator";

describe("Orchestration Integration", () => {
  const dbPath = join(process.cwd(), "test-orchestration-integration.db");
  let messageStore: MessageStore;

  beforeEach(() => {
    if (existsSync(dbPath))
      try {
        rmSync(dbPath);
      } catch (_e) {}
    messageStore = new MessageStore(dbPath);
  });

  afterEach(() => {
    messageStore.close();
    if (existsSync(dbPath))
      try {
        rmSync(dbPath);
      } catch (_e) {}
  });

  it("should execute a simple DAG of tasks A -> B", async () => {
    const tasks: Task[] = [
      { id: "task-A", status: "PENDING", dependencies: [], command: "echo A" },
      { id: "task-B", status: "PENDING", dependencies: ["task-A"], command: "echo B" },
    ];

    const orchestrator = new Orchestrator(tasks, messageStore);

    // Simple mock runner that listens for tasks
    orchestrator.on("taskReady", async (task: Task) => {
      // 1. Assign task
      orchestrator.assignTask(task.id, "mock-worker");

      // 2. Simulate worker processing and sending result
      setTimeout(async () => {
        await messageStore.send({
          from: "mock-worker",
          to: "orchestrator",
          subject: "Task Succeeded",
          body: `Result for ${task.id}`,
          type: "result",
        });
      }, 50);
    });

    // Run the orchestrator with small poll interval
    await orchestrator.run(100);

    const allTasks = orchestrator.getAllTasks();
    expect(allTasks.find((t) => t.id === "task-A")?.status).toBe("COMPLETED");
    expect(allTasks.find((t) => t.id === "task-B")?.status).toBe("COMPLETED");
    expect(orchestrator.isFinished()).toBe(true);
  });

  it("should handle task failures and stop execution of dependent tasks", async () => {
    const tasks: Task[] = [
      { id: "task-X", status: "PENDING", dependencies: [], command: "exit 1" },
      { id: "task-Y", status: "PENDING", dependencies: ["task-X"], command: "echo Y" },
    ];

    const orchestrator = new Orchestrator(tasks, messageStore);

    orchestrator.on("taskReady", async (task: Task) => {
      orchestrator.assignTask(task.id, "fail-worker");
      setTimeout(async () => {
        await messageStore.send({
          from: "fail-worker",
          to: "orchestrator",
          subject: "Task Failed",
          body: "Command failed",
          type: "error",
        });
      }, 50);
    });

    await orchestrator.run(100);

    const taskX = orchestrator.getTask("task-X");
    const taskY = orchestrator.getTask("task-Y");

    expect(taskX?.status).toBe("FAILED");
    expect(taskY?.status).toBe("PENDING"); // Should never have started
    expect(orchestrator.isFinished()).toBe(true); // Technically finished because no more tasks can run
  });
});
