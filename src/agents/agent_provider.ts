export interface AgentProvider {
  readonly name: string;

  init(agentId: string, worktreePath: string): Promise<void>;

  sendPrompt(prompt: string): Promise<string>;

  cleanup(): Promise<void>;
}

export type AgentProviderType = "copilot" | "opencode";

export interface AgentProviderConfig {
  type: AgentProviderType;
  model?: string;
}
