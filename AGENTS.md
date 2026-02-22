# AGENTS.md - Agent Teams Core

This document provides essential information for AI coding agents working in this repository.

## Build/Lint/Test Commands

```bash
# Run all tests
npm test

# Run a single test file
npx vitest run path/to/test.test.ts

# Run tests matching a pattern
npx vitest run -t "test name pattern"

# Run tests in watch mode
npm test -- --watch

# Lint check
npm run lint

# Format code
npm run format

# Type checking
npm run typecheck
```

## Project Structure

```
src/
  core/           # Core logic (Worktree, Messaging, Context)
    message_store.ts      # SQLite-based inter-agent messaging
    worktree_manager.ts   # Git worktree management for isolation
    context_manager.ts    # LLM context monitoring and checkpointing
  agents/         # Agent implementations (Lead, Worker, Specialist)
  cli.ts          # Command-line interface
test/             # Integration and acceptance tests
```

## Code Style Guidelines

### Formatting (Biome)

- **Indentation**: 2 spaces
- **Line width**: 100 characters max
- **Imports**: Auto-organized (enabled in Biome)
- **Quotes**: Single quotes for strings
- **Trailing commas**: As needed

### TypeScript

- **Strict mode**: Enabled
- **Target**: ESNext
- **Module**: ESNext with Bundler resolution
- **noUncheckedIndexedAccess**: Enabled - always handle undefined for array/object access

### Naming Conventions

- **Files**: snake_case.ts (e.g., `message_store.ts`, `worktree_manager.ts`)
- **Classes**: PascalCase (e.g., `MessageStore`, `WorktreeManager`)
- **Interfaces**: PascalCase (e.g., `Message`, `SendMessageOptions`)
- **Methods/Functions**: camelCase (e.g., `createCheckpoint`, `markAsRead`)
- **Private members**: Private keyword or `#` prefix
- **Constants**: SCREAMING_SNAKE_CASE for true constants, camelCase otherwise

### Imports

```typescript
// Node.js built-ins first (with node: prefix)
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// External packages second
import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';

// Internal modules last
import { MessageStore } from './message_store.js';
```

- Use `node:` prefix for Node.js built-in imports
- Use `type` keyword for type-only imports
- Use `.js` extension for local imports (required for ESM)

### Error Handling

```typescript
// Use try-catch with specific error types
try {
  execSync(command, { cwd: this.repoRoot, stdio: 'pipe' });
} catch (error: any) {
  const stderr = error.stderr?.toString() || Buffer.from(error.message).toString();
  throw new Error(`Failed to create worktree: ${stderr}`);
}

// Early returns for validation
if (!existsSync(path)) return;
```

- Always catch and rethrow with context
- Extract stderr from exec errors for debugging
- Use early returns for guard clauses

### Async Patterns

```typescript
// Prefer async/await over .then()
async send(options: SendMessageOptions): Promise<void> {
  const stmt = this.db.prepare(`...`);
  stmt.run(options.from, options.to, options.subject);
}

// Async methods should return Promise<T>
async check(recipient: string, options?: { unreadOnly?: boolean }): Promise<Message[]>
```

## Core Architecture Principles

### Git Worktree Isolation

Every agent task runs in a dedicated git worktree. Use `WorktreeManager` to create/remove worktrees:

```typescript
const manager = new WorktreeManager(repoRoot, worktreesDir);
await manager.create('/path/to/worktree', 'feature-branch');
await manager.remove('/path/to/worktree');
```

### SQLite Communication (MessageStore)

Use `MessageStore` for all inter-agent messaging to minimize context window bloat:

```typescript
const store = new MessageStore(dbPath);
await store.send({ from: 'lead', to: 'worker', subject: 'Task', body: '...', type: 'status' });
const messages = await store.check('worker', { unreadOnly: true });
```

### Context Management

Monitor context usage and checkpoint frequently:

```typescript
const ctx = new ContextManager({ limit: 100000 });
ctx.recordExchange(prompt, response);
if (ctx.needsRefresh()) {
  const checkpoint = ctx.createCheckpoint();
  // Save checkpoint to SQLite, then clear context
}
```

## Testing

- Tests use Vitest with `globals: true`
- Test files: `*.test.ts` in `src/` or `test/`
- Environment: Node.js
- Write tests before implementation (TDD First)

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('MessageStore', () => {
  let store: MessageStore;

  beforeEach(() => {
    store = new MessageStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('should send and receive messages', async () => {
    await store.send({ from: 'a', to: 'b', subject: 'test', body: 'body', type: 'status' });
    const messages = await store.check('b');
    expect(messages).toHaveLength(1);
  });
});
```

## Git Workflow

- **Main branch**: Clean, production-ready code only
- **Task branches**: Individual agents work on feature/bugfix branches within worktrees
- **Merging**: Automated tiered conflict resolution or manual human intervention

## Pre-commit Checklist

Before committing changes:

1. `npm run lint` - Fix all lint errors
2. `npm run typecheck` - No TypeScript errors
3. `npm test` - All tests pass
4. `npm run format` - Code is formatted

## Important Notes

- This project uses ESM modules (`"type": "module"` in package.json)
- SQLite database uses WAL mode and busy_timeout of 5000ms
- Agent communication is message-based, not shared memory
- Context management is critical for low-context models
