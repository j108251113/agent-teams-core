# Agent Teams — Assistant Instructions

**Purpose**: High-performance multi-agent team orchestration optimized for low-context models (GPT-5 Mini).

## Core Principles 🧠
- **Git Worktree Isolation**: Every agent task must run in a dedicated git worktree.
- **SQLite Communication**: Use the `MessageStore` (SQLite) for all inter-agent messaging to minimize context window bloat.
- **Checkpointing**: Agents must save progress to SQLite frequently. If context is lost or cleared, they resume from the last checkpoint.
- **TDD First**: Every feature must have integration and acceptance tests before implementation.

## Project Structure 📁
- `src/core/`: Core logic (Worktree, Messaging, Context).
- `src/agents/`: Agent implementations (Lead, Worker, Specialist).
- `test/`: Integration and Acceptance tests.

## Context Management ♻️
- **Monitor Context**: Always track estimated token usage.
- **Context Clearing**: When context > 80% capacity, summarize status, clear history, and reload instructions + last checkpoint.
- **Respawning**: If reasoning becomes incoherent due to long history, terminate the session and spawn a new one in the same worktree.

## Developer Workflows ▶️
- `npm test`: Run all tests (Vitest).
- `npm run lint`: Check linting (Biome).
- `npm run format`: Format code.
- `npm run typecheck`: Run TypeScript type checking.

## Git Workflow 🔧
- **Main branch**: Clean, production-ready code.
- **Task branches**: Individual agents work on feature/bugfix branches within their worktrees.
- **Merging**: Automated tiered conflict resolution or manual human intervention.
