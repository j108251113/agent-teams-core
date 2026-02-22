import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MessageStore } from "../message_store";

describe("MessageStore", () => {
  const dbPath = join(process.cwd(), "test-mail.db");
  let store: MessageStore;

  beforeEach(() => {
    if (existsSync(dbPath)) {
      try {
        rmSync(dbPath);
      } catch (_e) {
        /* ignore */
      }
    }
    store = new MessageStore(dbPath);
  });

  afterEach(() => {
    store.close();
    if (existsSync(dbPath)) {
      try {
        rmSync(dbPath);
        if (existsSync(`${dbPath}-shm`)) rmSync(`${dbPath}-shm`);
        if (existsSync(`${dbPath}-wal`)) rmSync(`${dbPath}-wal`);
      } catch (_e) {
        /* ignore */
      }
    }
  });

  it("should send and receive messages", async () => {
    await store.send({
      from: "agent-a",
      to: "agent-b",
      subject: "Hello",
      body: "How are you?",
      type: "question",
    });

    const messages = await store.check("agent-b");
    expect(messages.length).toBe(1);
    expect(messages[0]!.from).toBe("agent-a");
    expect(messages[0]!.subject).toBe("Hello");
    expect(messages[0]!.type).toBe("question");
  });

  it("should mark messages as read", async () => {
    await store.send({
      from: "agent-a",
      to: "agent-b",
      subject: "Task",
      body: "Done",
      type: "status",
    });

    let unread = await store.check("agent-b", { unreadOnly: true });
    expect(unread.length).toBe(1);

    await store.markAsRead(unread[0]!.id);

    unread = await store.check("agent-b", { unreadOnly: true });
    expect(unread.length).toBe(0);
  });

  it("should support concurrent access with WAL mode", async () => {
    const promises = Array.from({ length: 10 }).map((_, i) =>
      store.send({
        from: `agent-${i}`,
        to: "orchestrator",
        subject: "StatusUpdate",
        body: `progress-${i}`,
        type: "status",
      }),
    );

    await Promise.all(promises);

    const messages = await store.check("orchestrator");
    expect(messages.length).toBe(10);
  });
});
