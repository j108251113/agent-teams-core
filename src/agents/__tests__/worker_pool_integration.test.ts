import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MessageStore } from "../../core/message_store";
import { WorktreeManager } from "../../core/worktree_manager";
import { OpencodeProvider } from "../opencode_provider";
import { Orchestrator, type Task } from "../orchestrator";
import { WorkerPool } from "../worker_pool";

describe("WorkerPool Integration", () => {
  const dbPath = join(process.cwd(), "test-worker-pool-integration.db");
  const worktreesDir = join(process.cwd(), ".test-worker-pool-integration-worktrees");
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

  it("should create worktree and execute simple task", async () => {
    const taskId = `integration-task-${Date.now()}`;
    const tasks: Task[] = [
      { id: taskId, status: "PENDING", dependencies: [], command: "echo test" },
    ];

    const orchestrator = new Orchestrator(tasks, messageStore);
    const pool = new WorkerPool({
      messageStore,
      worktreeManager,
      repoRoot,
      worktreesDir,
      provider: { type: "opencode" },
    });

    pool.attach(orchestrator);

    await new Promise<void>((resolve) => {
      orchestrator.on("finished", resolve);
      orchestrator.run(100);
    });

    const allTasks = orchestrator.getAllTasks();
    expect(allTasks[0]?.status).toBe("COMPLETED");
  });

  it("should apply instruction overlay via provider", async () => {
    const provider = new OpencodeProvider();
    const taskPath = join(worktreesDir, "test-overlay-task");
    const branchName = "test/overlay-branch";

    await provider.init("test-agent", taskPath);
    await worktreeManager.create(taskPath, branchName);

    await provider.applyInstructionOverlay("# Test Instructions\n\nDo this and that.");

    const overlayPath = join(taskPath, ".agent-teams", "instructions.md");
    expect(existsSync(overlayPath)).toBe(true);
    expect(readFileSync(overlayPath, "utf8")).toContain("Test Instructions");

    await provider.cleanup();
    await worktreeManager.remove(taskPath);
  });

  it("should handle task without provider", async () => {
    const taskId = `simple-task-${Date.now()}`;
    const tasks: Task[] = [
      { id: taskId, status: "PENDING", dependencies: [], command: "echo simple" },
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

  it("should use configured worktrees directory", () => {
    expect(worktreeManager.getWorktreesDir()).toBe(worktreesDir);
  });
});
