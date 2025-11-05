# Engram

Self-improving AI coding agent framework with deterministic learning and memory.

## Overview

Engram is a framework that enables AI coding agents to learn from their execution history through a deterministic feedback loop. It captures build/test/lint outcomes, analyzes patterns, and curates actionable knowledge that improves future performance.

## Core Concepts

**Learning Loop**: capture → reflect → curate → apply

- **Capture**: Record execution traces (builds, tests, lints) with errors and outcomes
- **Reflect**: Analyze patterns across traces to extract insights
- **Curate**: Filter high-confidence insights and add them to the knowledge base
- **Apply**: Use learned patterns to avoid repeating mistakes

**Source of Truth**: `.engram/engram.db` (SQLite database) with JSONL audit snapshots for git tracking.

## Installation

```bash
npm install
npm run build
```

## Requirements

- Node.js >= 18
- TypeScript 5.3+

## CLI Usage

The framework is controlled via the `en` CLI:

```bash
# Initialize a new project
en init

# Capture execution trace
en capture --bead <task-id> --exec errors.json --outcome failure

# Analyze patterns
en analyze --mode batch --beads <id1> <id2>

# Query learned insights
en get bullets --sort-by helpful --limit 10

# Update knowledge base
en learn --beads <task-id> --min-confidence 0.8

# View status
en status
```

## Bead Tracking

Engram uses "beads" for deterministic issue tracking:

```bash
bd create "Task title" -t feature -p 2
bd ready                              # Find unblocked work
bd update <id> --status in_progress   # Claim task
bd close <id> --reason "Done"         # Complete task
```

## Architecture

```
src/
  cli/        # Command-line interface
  commands/   # Individual CLI commands
  agents/     # Subagent manifests
  adapters/   # External integrations (beads, git, jsonl, threads)
  store/      # Database layer (repository, migrations)
  schemas/    # Type definitions (Zod)
  utils/      # Pure utilities (canonicalize, id)
```

## Key Features

### Deterministic IDs

All entities use content-based IDs via canonical JSON (RFC8785) + SHA-256:

```typescript
import { deterministicId } from 'engram/utils/id';
const id = deterministicId(obj); // Same content always produces same ID
```

### Offline-First

SQLite database is authoritative. All data persists locally with optional JSONL snapshots for version control.

### Input Validation

All external data validated at boundaries using Zod schemas:

```typescript
const result = MySchema.safeParse(input);
if (!result.success) {
  throw new Error(`Validation failed: ${result.error.issues}`);
}
```

### Idempotent Operations

Database operations designed to be safely rerun:

```sql
INSERT OR IGNORE INTO table (id, ...) VALUES (?, ...);
UPDATE table SET counter = counter + ? WHERE id = ?;
```

## Development

### Building

```bash
npm run build       # TypeScript compilation + copy migrations
```

### Testing

```bash
npm test            # Run tests once (Vitest with --run)
npm run test:watch  # Run tests in watch mode
```

### Code Quality

```bash
npm run typecheck   # Type checking without emit
npm run lint        # ESLint check
npm run lint:fix    # Auto-fix linting issues
npm run format      # Format with Prettier
npm run check       # Run all checks (typecheck + lint + format + test)
```

### Pre-Commit Checklist

- [ ] `npm test`
- [ ] `npm run build`
- [ ] No `any` types introduced
- [ ] Validation added at boundaries
- [ ] DB operations idempotent where applicable

## Design Principles

1. **Offline-First**: SQLite is the source of truth
2. **Deterministic**: Same input always produces same output
3. **Modular**: Clear boundaries between layers
4. **Type-Safe**: Zod validation at all external interfaces
5. **Self-Documenting**: Code clarity over cleverness

## License

See [LICENSE](LICENSE) file for details.

## Repository

https://github.com/sjarmak/engram
