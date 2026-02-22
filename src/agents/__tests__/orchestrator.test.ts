import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Orchestrator, Task, TaskStatus } from '../orchestrator';
import { MessageStore } from '../../core/message_store';
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('Orchestrator', () => {
    const dbPath = join(process.cwd(), 'test-orchestrator.db');
    let messageStore: MessageStore;

    beforeEach(() => {
        if (existsSync(dbPath)) try { rmSync(dbPath); } catch (e) { }
        messageStore = new MessageStore(dbPath);
    });

    afterEach(() => {
        messageStore.close();
        if (existsSync(dbPath)) try { rmSync(dbPath); } catch (e) { }
    });

    it('should initialize with a set of tasks', () => {
        const tasks: Task[] = [
            { id: 'task-1', status: 'PENDING', dependencies: [], command: 'echo 1' },
            { id: 'task-2', status: 'PENDING', dependencies: ['task-1'], command: 'echo 2' }
        ];
        const orchestrator = new Orchestrator(tasks, messageStore);
        expect(orchestrator.getTask('task-1')?.status).toBe('PENDING');
    });

    it('should identify ready tasks', () => {
        const tasks: Task[] = [
            { id: 'task-1', status: 'COMPLETED', dependencies: [], command: 'echo 1' },
            { id: 'task-2', status: 'PENDING', dependencies: ['task-1'], command: 'echo 2' },
            { id: 'task-3', status: 'PENDING', dependencies: ['task-2'], command: 'echo 3' }
        ];
        const orchestrator = new Orchestrator(tasks, messageStore);
        const ready = orchestrator.getReadyTasks();
        expect(ready.length).toBe(1);
        expect(ready[0].id).toBe('task-2');
    });

    it('should update task status based on agent messages', async () => {
        const tasks: Task[] = [
            { id: 'task-1', status: 'RUNNING', dependencies: [], command: 'echo 1', assignedTo: 'worker-1' }
        ];
        const orchestrator = new Orchestrator(tasks, messageStore);

        // Simulate worker sending result
        await messageStore.send({
            from: 'worker-1',
            to: 'orchestrator',
            subject: 'Task Succeeded',
            body: 'output 1',
            type: 'result'
        });

        await orchestrator.pollMessages();

        expect(orchestrator.getTask('task-1')?.status).toBe('COMPLETED');
        expect(orchestrator.getTask('task-1')?.result).toBe('output 1');
    });
});
