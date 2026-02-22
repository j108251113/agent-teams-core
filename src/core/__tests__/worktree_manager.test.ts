import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorktreeManager } from "../worktree_manager";

describe("WorktreeManager", () => {
  const tempTestDir = join(process.cwd(), ".test-worktrees");
  const repoRoot = process.cwd();

  beforeEach(() => {
    if (!existsSync(tempTestDir)) {
      mkdirSync(tempTestDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Cleanup will be handled by the manager or manually
    // (empty afterEach to avoid unreachable code warning)
  });

  it("should create a new worktree successfully", async () => {
    const manager = new WorktreeManager(repoRoot, tempTestDir);
    const id = Math.random().toString(36).substring(7);
    const worktreePath = join(tempTestDir, `test-task-${id}`);
    const branchName = `task/test-task-${id}`;

    await manager.create(worktreePath, branchName);

    expect(existsSync(worktreePath)).toBe(true);

    // Verify branch from root
    const listOutput = execSync("git worktree list --porcelain", { cwd: repoRoot }).toString();
    expect(listOutput).toContain(branchName);
  });

  it("should remove a worktree successfully", async () => {
    const manager = new WorktreeManager(repoRoot, tempTestDir);
    const id = Math.random().toString(36).substring(7);
    const worktreePath = join(tempTestDir, `test-remove-${id}`);
    const branchName = `task/test-remove-${id}`;

    await manager.create(worktreePath, branchName);
    expect(existsSync(worktreePath)).toBe(true);

    await manager.remove(worktreePath);
    expect(existsSync(worktreePath)).toBe(false);
  });
});
