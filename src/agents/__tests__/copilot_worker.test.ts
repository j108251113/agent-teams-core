import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CopilotWorker } from '../copilot_worker';
import { MessageStore } from '../../core/message_store';
import { ContextManager } from '../../core/context_manager';
import { WorktreeManager } from '../../core/worktree_manager';
import { rmSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CopilotClient } from '@github/copilot-sdk';

// Mocking @github/copilot-sdk
vi.mock('@github/copilot-sdk', () => {
    const mockSession = {
        sessionId: 'test-session',
        sendAndWait: vi.fn(),
        on: vi.fn().mockReturnValue(() => { }),
        destroy: vi.fn().mockResolvedValue(undefined),
    };
    const mockClient = {
        createSession: vi.fn().mockResolvedValue(mockSession),
    };
    return {
        CopilotClient: vi.fn().mockImplementation(function () {
            return mockClient;
        }),
        CopilotSession: vi.fn(),
    };
});

describe('CopilotWorker', () => {
    const dbPath = join(process.cwd(), 'test-copilot-worker.db');
    const worktreesDir = join(process.cwd(), '.test-copilot-worktrees');
    const repoRoot = process.cwd();

    let messageStore: MessageStore;
    let contextManager: ContextManager;
    let worktreeManager: WorktreeManager;

    beforeEach(() => {
        if (existsSync(dbPath)) try { rmSync(dbPath); } catch (e) { }
        if (existsSync(worktreesDir)) try { rmSync(worktreesDir, { recursive: true, force: true }); } catch (e) { }
        mkdirSync(worktreesDir, { recursive: true });

        messageStore = new MessageStore(dbPath);
        contextManager = new ContextManager({ limit: 1000 });
        worktreeManager = new WorktreeManager(repoRoot, worktreesDir);
    });

    afterEach(() => {
        messageStore.close();
        if (existsSync(dbPath)) try { rmSync(dbPath); } catch (e) { }
        vi.clearAllMocks();
    });

    it('should apply instruction overlay to a worktree', async () => {
        const worker = new CopilotWorker('worker-1', messageStore, contextManager, worktreeManager);
        const taskPath = join(worktreesDir, `task-overlay-${Date.now()}`);

        await worker.setupTask(taskPath, 'task/overlay-branch');
        await worker.applyInstructionOverlay('Test instructions');

        const instructionPath = join(taskPath, '.github', 'copilot-instructions.md');
        expect(existsSync(instructionPath)).toBe(true);
        expect(readFileSync(instructionPath, 'utf8')).toContain('Test instructions');

        await worktreeManager.remove(taskPath);
    });

    it('should initialize copilot session and send beacon', async () => {
        const client = new CopilotClient({} as any);
        const worker = new CopilotWorker('worker-1', messageStore, contextManager, worktreeManager);

        await worker.initCopilot(client, { model: 'gpt-4' } as any);

        const mockSession = await client.createSession({} as any);
        (mockSession.sendAndWait as any).mockResolvedValue({ data: { content: 'Beacon Received' } });

        const response = await worker.sendBeacon('Hello Copilot');

        expect(client.createSession).toHaveBeenCalled();
        expect(mockSession.sendAndWait).toHaveBeenCalledWith({ prompt: 'Hello Copilot' });
        expect(response).toBe('Beacon Received');
    });

    it('should clean up session on cleanup', async () => {
        const client = new CopilotClient({} as any);
        const worker = new CopilotWorker('worker-1', messageStore, contextManager, worktreeManager);

        await worker.initCopilot(client, { model: 'gpt-4' } as any);
        const mockSession = await client.createSession({} as any);

        await worker.cleanup();

        expect(mockSession.destroy).toHaveBeenCalled();
    });
});

