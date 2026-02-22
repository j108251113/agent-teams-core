import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextManager } from "../../core/context_manager";
import { MessageStore } from "../../core/message_store";
import { WorktreeManager } from "../../core/worktree_manager";
import { Worker } from "../worker";

describe("Worker", () => {
  const dbPath = join(process.cwd(), "test-worker.db");
  const worktreesDir = join(process.cwd(), ".test-worker-worktrees");
  const repoRoot = process.cwd();

  let messageStore: MessageStore;
  let contextManager: ContextManager;
  let worktreeManager: WorktreeManager;

  beforeEach(() => {
    if (existsSync(dbPath))
      try {
        rmSync(dbPath);
      } catch (_e) {}
    if (!existsSync(worktreesDir)) mkdirSync(worktreesDir, { recursive: true });

    messageStore = new MessageStore(dbPath);
    contextManager = new ContextManager({ limit: 1000 });
    worktreeManager = new WorktreeManager(repoRoot, worktreesDir);
  });

  afterEach(() => {
    messageStore.close();
    if (existsSync(dbPath))
      try {
        rmSync(dbPath);
      } catch (_e) {}
    // Cleanup worktrees is usually handled by the manager
  });

  it("should initialize a worktree for a task", async () => {
    const worker = new Worker("worker-1", messageStore, contextManager, worktreeManager);
    const taskPath = join(worktreesDir, "task-init");

    await worker.setupTask(taskPath, "task/init-branch");

    expect(existsSync(taskPath)).toBe(true);
    // Prune the worktree after test to keep it clean
    await worktreeManager.remove(taskPath);
  });

  it("should be able to execute a command in its worktree", async () => {
    const worker = new Worker("worker-1", messageStore, contextManager, worktreeManager);
    const taskPath = join(worktreesDir, "task-exec");

    await worker.setupTask(taskPath, "task/exec-branch");

    // On Windows, 'dir' is a shell builtin, so we can use it via 'dir' or 'echo'
    const result = worker.executeCommand('echo "hello"', taskPath);
    expect(result).toContain("hello");

    await worktreeManager.remove(taskPath);
  });
});
