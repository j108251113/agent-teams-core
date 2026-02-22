import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CopilotClient, type CopilotSession, type SessionConfig } from "@github/copilot-sdk";
import type { AgentProvider } from "./agent_provider.js";

export class CopilotProvider implements AgentProvider {
  readonly name = "copilot";

  private client: CopilotClient | null = null;
  private session: CopilotSession | null = null;
  private worktreePath: string | null = null;

  async init(agentId: string, worktreePath: string): Promise<void> {
    this.worktreePath = worktreePath;

    this.client = new CopilotClient({});

    const config: SessionConfig = {
      model: "claude-sonnet-4-20250514",
    };

    this.session = await this.client.createSession(config);

    this.session.on((event) => {
      if (event.type === "assistant.message") {
        console.log(`[CopilotProvider ${agentId}] Received message`);
      } else if (event.type === "session.error") {
        console.error(`[CopilotProvider ${agentId}] Session Error:`, event.data.message);
      }
    });
  }

  async sendPrompt(prompt: string): Promise<string> {
    if (!this.session) {
      throw new Error("Copilot session not initialized");
    }

    const response = await this.session.sendAndWait({ prompt });
    return response?.data.content ?? "";
  }

  async applyInstructionOverlay(instructions: string): Promise<void> {
    if (!this.worktreePath) {
      throw new Error("No active worktree found for instruction overlay");
    }

    const instructionDir = join(this.worktreePath, ".github");
    const instructionPath = join(instructionDir, "copilot-instructions.md");

    mkdirSync(instructionDir, { recursive: true });
    writeFileSync(instructionPath, instructions);
  }

  async cleanup(): Promise<void> {
    if (this.session) {
      await this.session.destroy();
      this.session = null;
    }
    this.client = null;
    this.worktreePath = null;
  }
}
