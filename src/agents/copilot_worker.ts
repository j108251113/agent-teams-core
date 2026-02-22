import { Worker } from './worker';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { MessageStore } from '../core/message_store';
import type { ContextManager } from '../core/context_manager';
import type { WorktreeManager } from '../core/worktree_manager';
import { CopilotClient, CopilotSession, type SessionConfig } from '@github/copilot-sdk';

/**
 * A worker agent that integrates with GitHub Copilot CLI via the SDK.
 */
export class CopilotWorker extends Worker {
    private session: CopilotSession | null = null;

    constructor(
        id: string,
        messageStore: MessageStore,
        contextManager: ContextManager,
        worktreeManager: WorktreeManager
    ) {
        super(id, messageStore, contextManager, worktreeManager);
    }

    /**
     * Initializes a Copilot session for this worker.
     */
    async initCopilot(client: CopilotClient, config: SessionConfig): Promise<void> {
        this.session = await client.createSession(config);

        // Setup basic event logging/handling
        this.session.on((event) => {
            if (event.type === 'assistant.message') {
                this.recordExchange('Copilot Agent Request', event.data.content);
            } else if (event.type === 'session.error') {
                console.error(`[CopilotWorker ${this.id}] Session Error:`, event.data.message);
            }
        });
    }

    /**
     * Applies an instruction overlay to the current worktree.
     * Overstory-style: writes a specific file that the agent is instructed to read first.
     */
    async applyInstructionOverlay(instructions: string): Promise<void> {
        const state = (this.contextManager as any).state;
        const worktreePath = state.currentWorktree;

        if (!worktreePath) {
            throw new Error('No active worktree found for instruction overlay');
        }

        const instructionDir = join(worktreePath, '.github');
        const instructionPath = join(instructionDir, 'copilot-instructions.md');

        mkdirSync(instructionDir, { recursive: true });
        writeFileSync(instructionPath, instructions);

        this.updateState({ instructionOverlayApplied: true });
    }

    /**
     * Sends a "Beacon" message to the Copilot session to guide the agent.
     */
    async sendBeacon(prompt: string): Promise<string | undefined> {
        if (!this.session) {
            throw new Error('Copilot session not initialized');
        }

        const response = await this.session.sendAndWait({ prompt });
        return response?.data.content;
    }

    /**
     * Cleans up resources, including the Copilot session.
     */
    async cleanup(): Promise<void> {
        if (this.session) {
            await this.session.destroy();
            this.session = null;
        }

        const state = (this.contextManager as any).state;
        if (state.currentWorktree) {
            await this.worktreeManager.remove(state.currentWorktree);
        }

        this.updateState({ currentWorktree: null, currentBranch: null });
    }
}
