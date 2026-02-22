import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Orchestrator, type Task } from "./agents/orchestrator.js";
import { WorkerPool } from "./agents/worker_pool.js";
import { MessageStore } from "./core/message_store.js";
import { WorktreeManager } from "./core/worktree_manager.js";

async function main() {
  const repoRoot = process.cwd();
  const worktreesDir = join(repoRoot, `.worktrees-${Date.now()}`);
  const dbPath = join(repoRoot, "agent-teams.db");

  // Setup directories
  if (existsSync(worktreesDir)) {
    rmSync(worktreesDir, { recursive: true, force: true });
  }
  mkdirSync(worktreesDir, { recursive: true });

  const messageStore = new MessageStore(dbPath);
  const worktreeManager = new WorktreeManager(repoRoot, worktreesDir);

  // Initial dummy tasks - in future this could be loaded from a file or another agent
  const initialTasks: Task[] = [
    { id: "list-files", status: "PENDING", dependencies: [], command: "dir" },
    {
      id: "check-status",
      status: "PENDING",
      dependencies: ["list-files"],
      command: "echo Everything is ready",
    },
  ];

  const orchestrator = new Orchestrator(initialTasks, messageStore);
  const workerPool = new WorkerPool({
    messageStore,
    worktreeManager,
    repoRoot,
    worktreesDir,
  });

  workerPool.attach(orchestrator);

  console.log("🚀 [Orchestrator] Starting task loop...");

  orchestrator.on("taskReady", (task) => {
    console.log(`📡 [Orchestrator] Dispatching task: ${task.id} (${task.command})`);
  });

  orchestrator.on("finished", (tasks: Task[]) => {
    console.log("🎉 [Orchestrator] All tasks completed!");
    console.table(tasks.map((t) => ({ ID: t.id, Status: t.status, Error: t.error || "-" })));
    messageStore.close();
    process.exit(0);
  });

  try {
    await orchestrator.run(2000);
  } catch (error) {
    console.error("❌ [Orchestrator] Fatal error:", error);
    messageStore.close();
    process.exit(1);
  }
}

main().catch(console.error);
