import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Worker } from '../worker';
import { MessageStore } from '../../core/message_store';
import { ContextManager } from '../../core/context_manager';
import { WorktreeManager } from '../../core/worktree_manager';
import { rmSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

describe('Worker', () => {
    const dbPath = join(process.cwd(), 'test-worker.db');
    const worktreesDir = join(process.cwd(), '.test-worker-worktrees');
    const repoRoot = process.cwd();

    let messageStore: MessageStore;
    let contextManager: ContextManager;
    let worktreeManager: WorktreeManager;

    beforeEach(() => {
        if (existsSync(dbPath)) try { rmSync(dbPath); } catch (e) { }
        if (!existsSync(worktreesDir)) mkdirSync(worktreesDir, { recursive: true });

        messageStore = new MessageStore(dbPath);
        contextManager = new ContextManager({ limit: 1000 });
        worktreeManager = new WorktreeManager(repoRoot, worktreesDir);
    });

    afterEach(() => {
        messageStore.close();
        if (existsSync(dbPath)) try { rmSync(dbPath); } catch (e) { }
        // Cleanup worktrees is usually handled by the manager
    });

    it('should initialize a worktree for a task', async () => {
        const worker = new Worker('worker-1', messageStore, contextManager, worktreeManager);
        const taskPath = join(worktreesDir, 'task-init');

        await worker.setupTask(taskPath, 'task/init-branch');

        expect(existsSync(taskPath)).toBe(true);
        // Prune the worktree after test to keep it clean
        await worktreeManager.remove(taskPath);
    });

    it('should be able to execute a command in its worktree', async () => {
        const worker = new Worker('worker-1', messageStore, contextManager, worktreeManager);
        const taskPath = join(worktreesDir, 'task-exec');

        await worker.setupTask(taskPath, 'task/exec-branch');

        // On Windows, 'dir' is a shell builtin, so we can use it via 'dir' or 'echo'
        const result = worker.executeCommand('echo "hello"', taskPath);
        expect(result).toContain('hello');

        await worktreeManager.remove(taskPath);
    });
});
