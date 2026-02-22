import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MessageStore } from "../../core/message_store";
import { WorktreeManager } from "../../core/worktree_manager";
import { Orchestrator, type Task } from "../orchestrator";
import { WorkerPool } from "../worker_pool";

describe("Worktree Auto-Cleanup", () => {
  const dbPath = join(process.cwd(), "test-cleanup.db");
  const worktreesDir = join(process.cwd(), ".test-cleanup-worktrees");
  const repoRoot = process.cwd();

  let messageStore: MessageStore;
  let worktreeManager: WorktreeManager;

  beforeEach(() => {
    if (existsSync(dbPath))
      try {
        rmSync(dbPath);
      } catch (_e) {}
    if (existsSync(worktreesDir))
      try {
        rmSync(worktreesDir, { recursive: true, force: true });
      } catch (_e) {}
    mkdirSync(worktreesDir, { recursive: true });

    messageStore = new MessageStore(dbPath);
    worktreeManager = new WorktreeManager(repoRoot, worktreesDir);
  });

  afterEach(() => {
    messageStore.close();
    if (existsSync(dbPath))
      try {
        rmSync(dbPath);
      } catch (_e) {}
    if (existsSync(worktreesDir))
      try {
        rmSync(worktreesDir, { recursive: true, force: true });
      } catch (_e) {}
  });

  it("should complete task with default autoCleanup behavior", async () => {
    const taskId = `cleanup-default-${Date.now()}`;
    const tasks: Task[] = [
      { id: taskId, status: "PENDING", dependencies: [], command: "echo test" },
    ];

    const orchestrator = new Orchestrator(tasks, messageStore);
    const pool = new WorkerPool({
      messageStore,
      worktreeManager,
      repoRoot,
      worktreesDir,
    });

    pool.attach(orchestrator);

    await new Promise<void>((resolve) => {
      orchestrator.on("finished", resolve);
      orchestrator.run(100);
    });

    const allTasks = orchestrator.getAllTasks();
    expect(allTasks[0]?.status).toBe("COMPLETED");
  });

  it("should complete task when autoCleanup is explicitly enabled", async () => {
    const taskId = `cleanup-enabled-${Date.now()}`;
    const tasks: Task[] = [
      { id: taskId, status: "PENDING", dependencies: [], command: "echo enabled" },
    ];

    const orchestrator = new Orchestrator(tasks, messageStore);
    const pool = new WorkerPool({
      messageStore,
      worktreeManager,
      repoRoot,
      worktreesDir,
      autoCleanup: true,
    });

    pool.attach(orchestrator);

    await new Promise<void>((resolve) => {
      orchestrator.on("finished", resolve);
      orchestrator.run(100);
    });

    const allTasks = orchestrator.getAllTasks();
    expect(allTasks[0]?.status).toBe("COMPLETED");
  });

  it("should complete task when autoCleanup is disabled", async () => {
    const taskId = `cleanup-disabled-${Date.now()}`;
    const tasks: Task[] = [
      { id: taskId, status: "PENDING", dependencies: [], command: "echo disabled" },
    ];

    const orchestrator = new Orchestrator(tasks, messageStore);
    const pool = new WorkerPool({
      messageStore,
      worktreeManager,
      repoRoot,
      worktreesDir,
      autoCleanup: false,
    });

    pool.attach(orchestrator);

    await new Promise<void>((resolve) => {
      orchestrator.on("finished", resolve);
      orchestrator.run(100);
    });

    const allTasks = orchestrator.getAllTasks();
    expect(allTasks[0]?.status).toBe("COMPLETED");
  });

  it("should handle DAG with dependencies", async () => {
    const timestamp = Date.now();
    const tasks: Task[] = [
      { id: `dag-a-${timestamp}`, status: "PENDING", dependencies: [], command: "echo A" },
      {
        id: `dag-b-${timestamp}`,
        status: "PENDING",
        dependencies: [`dag-a-${timestamp}`],
        command: "echo B",
      },
    ];

    const orchestrator = new Orchestrator(tasks, messageStore);
    const pool = new WorkerPool({
      messageStore,
      worktreeManager,
      repoRoot,
      worktreesDir,
      autoCleanup: true,
    });

    pool.attach(orchestrator);

    await new Promise<void>((resolve) => {
      orchestrator.on("finished", resolve);
      orchestrator.run(100);
    });

    const allTasks = orchestrator.getAllTasks();
    expect(allTasks.every((t) => t.status === "COMPLETED")).toBe(true);
  });

  it("should handle failed task gracefully", async () => {
    const taskId = `cleanup-fail-${Date.now()}`;
    const tasks: Task[] = [{ id: taskId, status: "PENDING", dependencies: [], command: "exit 1" }];

    const orchestrator = new Orchestrator(tasks, messageStore);
    const pool = new WorkerPool({
      messageStore,
      worktreeManager,
      repoRoot,
      worktreesDir,
      autoCleanup: true,
    });

    pool.attach(orchestrator);

    await new Promise<void>((resolve) => {
      orchestrator.on("finished", resolve);
      orchestrator.run(100);
    });

    const allTasks = orchestrator.getAllTasks();
    expect(allTasks[0]?.status).toBe("FAILED");
  });
});
