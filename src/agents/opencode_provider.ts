import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentProvider } from "./agent_provider.js";

export class OpencodeProvider implements AgentProvider {
  readonly name = "opencode";

  private worktreePath: string | null = null;
  private model: string = "claude-sonnet-4-20250514";

  setModel(model: string): void {
    this.model = model;
  }

  async init(agentId: string, worktreePath: string): Promise<void> {
    this.worktreePath = worktreePath;
    console.log(`[OpencodeProvider] Initialized for ${agentId} at ${worktreePath}`);
  }

  async sendPrompt(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = ["run", prompt, "--format", "json"];

      if (this.model) {
        args.push("--model", this.model);
      }

      const proc = spawn("opencode", args, {
        cwd: this.worktreePath || process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(this.extractResponse(stdout));
        } else {
          reject(new Error(`opencode exited with code ${code}: ${stderr}`));
        }
      });

      proc.on("error", (err) => {
        reject(new Error(`Failed to spawn opencode: ${err.message}`));
      });
    });
  }

  private extractResponse(stdout: string): string {
    try {
      const lines = stdout.trim().split("\n");
      for (const line of lines.reverse()) {
        if (line.includes("content") || line.includes("response")) {
          const json = JSON.parse(line);
          return json.content || json.response || json.message?.content || JSON.stringify(json);
        }
      }
      return stdout.trim();
    } catch {
      return stdout.trim();
    }
  }

  async applyInstructionOverlay(instructions: string): Promise<void> {
    if (!this.worktreePath) {
      throw new Error("No active worktree found for instruction overlay");
    }

    const instructionDir = join(this.worktreePath, ".agent-teams");
    const instructionPath = join(instructionDir, "instructions.md");

    mkdirSync(instructionDir, { recursive: true });
    writeFileSync(instructionPath, instructions);
  }

  async cleanup(): Promise<void> {
    this.worktreePath = null;
  }
}
