import { Agent } from './agent';
import { execSync } from 'node:child_process';
import type { MessageStore } from '../core/message_store';
import type { ContextManager } from '../core/context_manager';
import type { WorktreeManager } from '../core/worktree_manager';

/**
 * An agent that executes tasks in isolated git worktrees.
 */
export class Worker extends Agent {
    constructor(
        id: string,
        messageStore: MessageStore,
        contextManager: ContextManager,
        private worktreeManager: WorktreeManager
    ) {
        super(id, messageStore, contextManager);
    }

    /**
     * Sets up a worktree for a specific task.
     */
    async setupTask(path: string, branch: string): Promise<void> {
        await this.worktreeManager.create(path, branch);
        this.updateState({ currentWorktree: path, currentBranch: branch });
    }

    /**
     * Executes a command in the task's worktree.
     */
    executeCommand(command: string, worktreePath: string): string {
        try {
            const output = execSync(command, { cwd: worktreePath, stdio: 'pipe' }).toString();
            return output;
        } catch (error: any) {
            const stderr = error.stderr?.toString() || error.message;
            throw new Error(`Command failed: ${stderr}`);
        }
    }

    /**
     * Completes a task by removing the worktree and sending a result message.
     */
    async completeTask(result: string, success: boolean = true): Promise<void> {
        const state = (this.contextManager as any).state; // Accessing internal state
        const path = state.currentWorktree;

        if (path) {
            await this.worktreeManager.remove(path);
        }

        await this.sendMessage(
            'orchestrator',
            success ? 'Task Succeeded' : 'Task Failed',
            result,
            success ? 'result' : 'error'
        );

        this.updateState({ currentWorktree: null, currentBranch: null });
    }
}
