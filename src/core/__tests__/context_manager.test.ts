import { describe, it, expect, beforeEach } from 'vitest';
import { ContextManager } from '../context_manager';

describe('ContextManager', () => {
    it('should track token usage correctly', () => {
        const manager = new ContextManager({ limit: 1000 });
        manager.recordExchange('Hello', 'Hi there!');
        expect(manager.getUsage()).toBeGreaterThan(0);
    });

    it('should trigger refresh when limit is exceeded', () => {
        const manager = new ContextManager({ limit: 50 });
        manager.recordExchange('A'.repeat(150), 'B'.repeat(150)); // ~300 chars / 4 = 75 tokens
        expect(manager.needsRefresh()).toBe(true);
    });

    it('should generate a summary/checkpoint for state restoration', () => {
        const manager = new ContextManager({ limit: 1000 });
        manager.recordExchange('Fix bug in auth.ts', 'I found the bug.');
        manager.updateState({ lastFile: 'auth.ts', status: 'fixing' });

        const checkpoint = manager.createCheckpoint();
        expect(checkpoint.state.lastFile).toBe('auth.ts');
        expect(checkpoint.historySummary).toContain('auth.ts');
    });
});
