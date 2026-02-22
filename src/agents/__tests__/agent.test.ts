import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextManager } from "../../core/context_manager";
import { MessageStore } from "../../core/message_store";
import { Agent } from "../agent";

describe("Agent", () => {
  const dbPath = join(process.cwd(), "test-agent.db");
  let messageStore: MessageStore;
  let contextManager: ContextManager;

  beforeEach(() => {
    if (existsSync(dbPath)) {
      try {
        rmSync(dbPath);
      } catch (_e) {}
    }
    messageStore = new MessageStore(dbPath);
    contextManager = new ContextManager({ limit: 1000 });
  });

  afterEach(() => {
    messageStore.close();
    if (existsSync(dbPath)) {
      try {
        rmSync(dbPath);
      } catch (_e) {}
    }
  });

  it("should be able to send a message via the message store", async () => {
    const agent = new Agent("worker-1", messageStore, contextManager);

    await agent.sendMessage("orchestrator", "Task complete", "success", "result");

    const msgs = await messageStore.check("orchestrator");
    expect(msgs.length).toBe(1);
    expect(msgs[0]!.from).toBe("worker-1");
    expect(msgs[0]!.subject).toBe("Task complete");
  });

  it("should track its own context usage", async () => {
    const agent = new Agent("worker-1", messageStore, contextManager);

    agent.recordExchange("Do X", "I did X");

    expect(agent.getContextUsage()).toBeGreaterThan(0);
  });

  it("should generate restoration instructions when context limit is reached", async () => {
    const smallContextManager = new ContextManager({ limit: 50 });
    const agent = new Agent("worker-1", messageStore, smallContextManager);

    agent.recordExchange("A".repeat(100), "B".repeat(100)); // Triggers needsRefresh

    expect(agent.needsRefresh()).toBe(true);
    const instructions = agent.getRestorationInstructions();
    expect(instructions).toContain("RESTORE_FROM_CHECKPOINT");
    expect(instructions).toContain("worker-1");
  });
});
