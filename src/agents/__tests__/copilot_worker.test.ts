import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextManager } from "../../core/context_manager";
import { MessageStore } from "../../core/message_store";
import { WorktreeManager } from "../../core/worktree_manager";
import { OpencodeProvider } from "../opencode_provider";
import { Worker } from "../worker";

vi.mock("@github/copilot-sdk", () => {
  const mockSession = {
    sessionId: "test-session",
    sendAndWait: vi.fn(),
    on: vi.fn().mockReturnValue(() => {}),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
  const mockClient = {
    createSession: vi.fn().mockResolvedValue(mockSession),
  };
  return {
    CopilotClient: vi.fn().mockImplementation(() => mockClient),
    CopilotSession: vi.fn(),
  };
});

describe("OpencodeProvider", () => {
  const dbPath = join(process.cwd(), "test-opencode-provider.db");
  const worktreesDir = join(process.cwd(), ".test-opencode-worktrees");
  const repoRoot = process.cwd();

  let messageStore: MessageStore;
  let contextManager: ContextManager;
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
    contextManager = new ContextManager({ limit: 1000 });
    worktreeManager = new WorktreeManager(repoRoot, worktreesDir);
  });

  afterEach(() => {
    messageStore.close();
    if (existsSync(dbPath))
      try {
        rmSync(dbPath);
      } catch (_e) {}
  });

  it("should have correct provider name", () => {
    const provider = new OpencodeProvider();
    expect(provider.name).toBe("opencode");
  });

  it("should set model", () => {
    const provider = new OpencodeProvider();
    provider.setModel("gpt-4");
  });

  it("should apply instruction overlay to a worktree", async () => {
    const provider = new OpencodeProvider();
    const worker = new Worker("worker-1", messageStore, contextManager, worktreeManager);
    worker.setProvider(provider);

    const taskPath = join(worktreesDir, `task-overlay-${Date.now()}`);
    const branchName = `task/overlay-${Date.now()}`;

    await worker.setupTask(taskPath, branchName);
    await worker.applyInstructionOverlay("Test instructions");

    const instructionPath = join(taskPath, ".agent-teams", "instructions.md");
    expect(existsSync(instructionPath)).toBe(true);

    await provider.cleanup();
  });

  it("should throw error when sending prompt without provider", async () => {
    const worker = new Worker("worker-1", messageStore, contextManager, worktreeManager);

    await expect(worker.sendPrompt("test")).rejects.toThrow("No AI provider configured");
  });
});
