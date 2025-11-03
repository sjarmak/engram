# Amp Framework (AF) - Agent Knowledge Base

## What is Amp Framework?

Amp Framework (AF) is a **self-improving AI coding agent framework** with deterministic learning and memory. It provides:

- **Offline-first** SQLite-based knowledge store
- **Deterministic IDs** via RFC8785 canonical JSON → SHA-256
- **Learning loop**: capture → reflect → curate → apply
- **MCP server** for tool integration
- **Thread tracking** linking beads to Amp conversations
- **Diff-based caching** for CI efficiency

### Core Concept

AF creates a continuous learning cycle:
1. **Capture** execution traces (build/test/lint results, errors, discoveries)
2. **Reflect** to extract patterns and insights from traces
3. **Curate** insights into validated knowledge items
4. **Apply** knowledge to generate improvements

The system maintains an authoritative SQLite database (`.ace/ace.db`) with JSONL audit snapshots for version control.

---

## How to Use AF as an Agent

### Prerequisites

This project uses **bd (beads)** for ALL issue tracking. See the Beads section below for workflow details.

### Agent Workflow: Inner, Middle, and Outer Loops

AF optimizes three loops of agentic development:

#### Inner Loop (Task Execution)
**Goal**: Small, focused changes with rapid feedback

1. **Claim a bead**: `bd update <id> --status in_progress`
2. **Write tests first** (for code changes with testable specs):
   - Discovery beads and spikes don't require tests
   - Code changes with clear specifications require regression tests
   - **Never edit tests just to make them pass** - fix the implementation
3. **Make minimal changes**: Focus on the bead's single responsibility
4. **Run tests frequently**: `npm test` (auto-captures with AF)
5. **Propose commits**: After each successful test pass, propose a commit:
   - Agent suggests: `git commit -m "feat(module): description [bead-id]"`
   - Wait for user approval before executing
6. **Close the bead**: `bd close <id> --reason "Done"` (triggers auto-learn)

**Key Principles**:
- Keep changes atomic and testable
- Capture execution traces automatically
- Learn from failures to update AGENTS.md
- Commit after each green test (with approval)

#### Middle Loop (Context & Coordination)
**Goal**: Multi-agent coordination with maintained knowledge

1. **Modular architecture**: Design code with clear module boundaries
   - Each module has a single, well-defined purpose
   - Use directory structure to enforce separation: `src/cli/`, `src/store/`, `src/agents/`
   - Name modules descriptively: `store/repository.ts`, `utils/canonicalize.ts`
2. **Label everything explicitly**:
   - Beads include module tags: "Module: store/repository"
   - Branches include bead IDs: `amp/tmp/amp_framework-42-a3f8b2c1-sqlite-setup`
   - Commits reference beads: `[amp_framework-42]`
3. **Branch discipline**:
   - Create temp branch: Record in SQLite `branches` table immediately
   - Work in isolation: One branch per bead/agent
   - Mark for deletion: Set `marked_for_deletion=true` when bead closes
   - Cleanup: Run `af branch cleanup` to delete marked branches
4. **Workspace isolation**:
   - Multiple agents can work simultaneously on different modules
   - Clear module ownership prevents conflicts
   - Shared files (AGENTS.md) updated through controlled curation process
5. **Knowledge maintenance**:
   - Learning loop updates AGENTS.md with validated patterns
   - Codified rules prevent repeated mistakes
   - Context preserved across bead transitions

**Key Principles**:
- Partition work by module boundaries
- Never cross streams - respect module ownership
- Use beads + SQLite for all tracking (no markdown task lists)
- Maintain clean, labeled artifacts for multi-agent coordination

#### Outer Loop (CI/CD & Quality)
**Goal**: Gated quality with optimized throughput

1. **Pre-commit validation**:
   - Run `npm test`, `npm run build`, `npm run lint`
   - Auto-capture failures to traces
   - Block commit if critical checks fail
2. **Review gates**:
   - Review agent validates changes against checklist
   - Cleanup agent identifies refactoring opportunities
   - Bug sweeper scans for common defect patterns
3. **Diff-based caching**:
   - Cache analysis results keyed by file content hash
   - Re-scan only changed files in CI
   - Store results in `retrieval_cache` table
4. **Continuous improvement**:
   - Metrics tracked: test pass rate, error count, coverage delta
   - Learning loop extracts patterns from CI failures
   - Knowledge base grows to prevent regressions

**Key Principles**:
- Quality gates prevent broken code from merging
- Caching optimizes CI performance
- Multi-agent commits coordinated through branch isolation
- Metrics inform continuous improvement

### Basic Workflow

```bash
# 1. Initialize workspace (one-time)
af init

# 2. Check ready work
bd ready --json

# 3. Claim and create temp branch
bd update amp_framework-42 --status in_progress
af branch plan "Implement SQLite setup"  # Records branch in DB

# 4. Write tests first (if applicable)
# Create tests in tests/store/sqlite.test.ts

# 5. Implement changes
# Edit src/store/sqlite.ts

# 6. Run tests (auto-captures)
npm test

# 7. Propose commit after green test
# Agent: "Shall I commit with: 'feat(store): add SQLite WAL setup [amp_framework-42]'?"

# 8. Complete and cleanup
bd close amp_framework-42 --reason "Completed"
af branch cleanup  # Deletes marked temp branches
```

### Automatic Capture (with Beads Hooks)

When working with beads, captures happen automatically:
```bash
bd update amp_framework-42 --status in_progress
npm test  # ← Auto-captures results
bd close amp_framework-42 --reason "Completed"  # ← Auto-learns before close
```

---

## Architecture

### Repository Layout

```
amp_framework/
  bin/
    af                      # CLI entry point
  src/
    cli/
      index.ts              # CLI router
      commands/             # All CLI commands
        init.ts
        capture.ts
        reflect.ts
        curate.ts
        apply.ts
        learn.ts
        ci.ts
        mcp.ts
        knowledge.ts
        ...
    agents/                 # Custom subagent manifests
      generator.ts
      reflector.ts
      curator.ts
      review_agent.ts
      cleanup_agent.ts
      bug_sweeper_agent.ts
    adapters/
      beads.ts              # bd integration
      git.ts                # Branch/diff operations
      sqlite.ts             # Database pool
      jsonl.ts              # Audit snapshots
      threads.ts            # Thread tracking
    store/
      repository.ts         # Data access interface
      migrations/           # Schema migrations
        0001_init.sql
    schemas/
      envelope.ts           # JSON envelope (Zod)
      knowledge.ts          # KnowledgeItem schema
      insight.ts
      trace.ts
    utils/
      canonicalize.ts       # RFC8785 implementation
      id.ts                 # Deterministic ID generation
  .ace/
    ace.db                  # SQLite database (authoritative)
    config.json             # Configuration
    snapshots/              # JSONL audit logs
  AGENTS.md                 # This file (rendered from DB)
```

### Data Model

**Core Tables:**
- `knowledge_items` - Curated facts, patterns, procedures, decisions
- `insights` - Extracted patterns from traces (pre-curation)
- `traces` - Execution results (build/test/lint)
- `runs` - Learning cycle executions
- `branches` - Temp branch tracking
- `threads` - Amp thread → bead associations
- `metrics` - Performance/quality metrics
- `retrieval_cache` - Diff-based analysis cache

### Subagents (Custom-Subagent MCP)

AF uses specialized subagents via custom-subagent MCP:

**Generator** (`ace-generator`)
- Executes coding tasks with playbook context
- Marks bullets helpful/harmful
- Records execution traces
- Permissions: Read, Grep, glob, Bash, edit_file (ask), create_file (ask)

**Reflector** (`ace-reflector`)
- Analyzes traces to extract insights
- Calculates confidence scores (0.0-1.0)
- Identifies error patterns
- Read-only permissions: Read, Grep

**Curator** (`ace-curator`)
- Validates and deduplicates insights
- Routes to AGENTS.md sections
- Maintains knowledge quality
- Write-scoped permissions: Read, edit_file (AGENTS.md only)

**Review Agent** (`ace-review`) [P2]
- Validates curated items
- Enforces checklist compliance
- Writes PR notes

**Cleanup Agent** (`ace-cleanup`) [P2]
- Removes stale/duplicate knowledge
- Marks superseded items

**Bug Sweeper Agent** (`ace-bug-sweeper`) [P2]
- Scans for flaky tests and common bugs
- Creates knowledge items for defects

---

## CLI Reference

### Initialization

```bash
af init [--quiet]
```
Ensures `.git`, runs `bd init`, creates `.ace/ace.db`, applies migrations, renders baseline AGENTS.md.

### Learning Loop

```bash
# Capture execution trace
af capture [--json]

# Reflect on recent traces
af reflect [--json]

# Curate insights into knowledge
af curate [--json]

# Apply curated changes
af apply [--json]

# Run full pipeline
af learn [--beads <id>] [--min-confidence 0.8] [--json]
```

### Knowledge Management

```bash
# Add knowledge manually
af knowledge add --type <fact|pattern|procedure|decision> --text "..." [--json]

# List knowledge items
af knowledge list [--scope <repo>] [--module <module>] [--json]

# Search knowledge
af knowledge search <query> [--json]

# Render AGENTS.md
af knowledge render [--json]
```

### Database

```bash
# Run migrations
af db migrate [--json]

# Check migration status
af db status [--json]
```

### Branching

```bash
# Create temp branch with plan
af branch plan <summary> [--json]

# Cleanup completed temp branches
af branch cleanup [--json]
```

### CI/CD

```bash
# Run checks with diff-based caching
af ci run [--diff-with <base>] [--json]
```

### MCP Server

```bash
# Start MCP server
af mcp serve [--port 8765]
```

### Utilities

```bash
# Compute deterministic ID
af id compute < input.json

# Run diagnostics
af doctor

# Emit JSON Schema for command
af schema <command>
```

---

## Deterministic IDs

All entities use content-addressed IDs:
1. Canonicalize JSON via RFC8785 (deterministic field ordering, number normalization)
2. Compute SHA-256 hash → 64-character hex
3. Display 8-character prefix for humans

**Example:**
```typescript
const obj = { type: "pattern", text: "Always use .js extensions" };
const canonical = canonicalize(obj); // RFC8785
const id = sha256(canonical);         // "a3f8b2c1..."
const shortId = id.slice(0, 8);       // "a3f8b2c1"
```

**Invariant:** Same content → same ID, always.

---

## Branching Discipline

### Temp Branch Naming

```
amp/tmp/<bead-id>-<8hex>-<task>
```

Examples:
- `amp/tmp/amp_framework-42-a3f8b2c1-mcp-server`
- `amp/tmp/amp_framework-15-d9e4f1a2-sqlite-schema`

### Rules

1. **Record on creation**: Insert into `branches` table
2. **Mark for deletion**: Set `marked_for_deletion=true` on plan completion
3. **Enforce cleanup**: `af branch cleanup` deletes marked branches
4. **Prohibit unrecorded merges**: Git adapter refuses merges from unlisted branches

### Workspace Isolation

Ephemeral artifacts go in `.ace/work/<shortid>/`

---

## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs or task lists.

### Quick Start

```bash
# Check for ready work
bd ready --json

# Create new issue
bd create "Issue title" -t bug|feature|task -p 0-4 --json

# Claim and update
bd update bd-42 --status in_progress --json

# Complete work
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim task**: `bd update <id> --status in_progress`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue: `bd create "Found bug" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"` (auto-learns if ACE enabled)

### Auto-Sync

bd automatically syncs with git:
- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)

---

## Thread Tracking

AF maintains associations between Amp threads and beads:

```bash
# Tracked automatically during capture
# View thread associations
sqlite3 .ace/ace.db "SELECT * FROM threads WHERE bead_id='amp_framework-42'"
```

**Schema:**
```sql
CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,          -- T-uuid from Amp
  bead_id TEXT,
  url TEXT,
  created_at TEXT NOT NULL
);
```

This enables queries like:
- "Which thread worked on this bead?"
- "What beads were addressed in this thread?"
- "Show me the conversation context for this fix"

---

## Principles

### 1. Offline-First Default
- SQLite is the authoritative store
- JSONL snapshots for audit and git
- Optional connectors never block local writes
- Redaction enabled by default

### 2. Deterministic Everywhere
- Canonical JSON before hashing
- Reproducible IDs across machines
- Same inputs → identical outputs
- Snapshot tests for stability

### 3. Test-First for Beads
- Forbid editing tests to make them pass
- Commit suggestion after each green test
- Record coverage deltas
- Auto-capture on test runs

### 4. Partition and Label
- Explicit scope for every knowledge item
- Module paths in descriptions
- Directory/repo/branch namespacing
- Never cross streams

### 5. Accumulate, Don't Replace
- Minimal deltas with metadata
- Track helpful/harmful counters
- Prune only when net harmful
- Preserve valuable patterns

### 6. Modular Architecture
- **Single responsibility**: Each module does one thing well
- **Clear boundaries**: Use directory structure to enforce separation
- **Descriptive naming**: Module names reflect their purpose
- **Isolated workspaces**: Multiple agents work on different modules simultaneously
- **Explicit dependencies**: Document module relationships in code

**Module Organization**:
```
src/
  cli/           # Command-line interface (single entry point)
  commands/      # Individual CLI commands (init, capture, learn, etc.)
  agents/        # Subagent manifests (generator, reflector, curator)
  adapters/      # External integrations (beads, git, threads, jsonl)
  store/         # Database layer (repository, migrations, schema)
  schemas/       # Type definitions and validators (Zod)
  utils/         # Pure utilities (canonicalize, id, time)
  workflows/     # Multi-step processes (inner/middle/outer loops)
  ci/            # CI/CD logic (checks, caching)
```

**Ownership Rules**:
- One agent per module at a time
- Shared files (AGENTS.md, package.json) require coordination
- Cross-module changes split into separate beads

### 7. Branch Discipline
- **Temp branch naming**: `amp/tmp/<bead-id>-<8hex>-<task>`
- **Record on creation**: Insert into SQLite `branches` table
- **Mark for deletion**: Set `marked_for_deletion=true` on plan completion
- **Enforce cleanup**: `af branch cleanup` deletes marked branches
- **Prohibit unrecorded merges**: Git adapter refuses merges from unlisted branches

**Workspace Isolation**:
- Ephemeral artifacts: `.ace/work/<shortid>/`
- One DB per repo: `.ace/ace.db`
- Thread-safe writes: WAL mode enabled

---

## Coding Conventions

### TypeScript

- **Module imports**: Use `.js` extensions even for `.ts` files (ESM)
- **Type safety**: 
  - Never use `any` - use `unknown` and validate with type guards or Zod
  - Avoid `@ts-expect-error` - fix the type issue instead
  - Use exported type enums (e.g., `KnowledgeType`) over string literals in function signatures
  - Leverage TypeScript inference - don't over-annotate obvious types
- **Zod schemas**: All external data validated at boundaries (API, DB, file I/O)
- **Async/await**: Prefer over promises/callbacks
- **Nullable handling**: Guard `JSON.parse()` on nullable DB columns with fallbacks

### Database

- **WAL mode**: Always enabled for concurrency with `foreign_keys = ON`
- **Transactions**: Wrap multi-step writes in `db.transaction()`
- **Prepared statements**: Use for all queries to prevent SQL injection
- **Migrations**: 
  - Never modify existing migrations; add new ones
  - Migrations are self-recording (no need to manually insert into `schema_version`)
- **Idempotent operations**: Use `INSERT OR IGNORE` for deterministic IDs
- **Incremental updates**: Use `SET counter = counter + ?` not `SET counter = ?` to avoid races

### CLI

- **--json everywhere**: Machine-readable output
- **Stderr for humans**: Progress/logs to stderr
- **Envelope format**: `{apiVersion, cmd, ok, data, errors?}`
- **Idempotent**: Safe to re-run commands

### Testing

- **Vitest**: Framework of choice
- **--run flag**: Always use `npm test` (which includes `--run` in package.json)
- **Golden snapshots**: For --json outputs and deterministic behavior
- **Contract tests**: For interfaces and API boundaries
- **Test determinism**: IDs, timestamps, and order must be deterministic or mocked

### Code Quality

- **Self-documenting code**: Function and variable names should explain purpose
- **Minimal comments**: 
  - Remove "what" comments that restate the code
  - Keep "why" comments for non-obvious decisions
  - Document edge cases and gotchas (e.g., "undefined in arrays → 'null', in objects → omitted")
- **Function size**: Keep functions focused on single responsibility
- **No excess docstrings**: Don't add JSDoc that just repeats the function signature
- **Explainability over cleverness**: Prefer clear code over clever one-liners

---

## Design Rules

1. **Single binary**: No split client/server
2. **CLI drives everything**: MCP calls CLI commands
3. **Subagents are stateless**: Pass context explicitly
4. **Cache by content**: Diff-based invalidation
5. **Minimal schema**: Resist over-modeling
6. **Audit everything**: JSONL snapshots for all mutations
7. **Idempotent by default**: Operations with deterministic IDs should return existing records
8. **Validate at boundaries**: Use Zod schemas at all external interfaces
9. **Safety over convenience**: Reject invalid input early (e.g., non-plain objects in canonicalize)

---

## Review Checklist

Before closing any bead:

- [ ] Tests pass (`npm test`)
- [ ] Type check passes (`npm run build` or `tsc --noEmit`)
- [ ] Lint passes (`npm run lint`)
- [ ] No `any` types introduced without justification
- [ ] Excess comments removed (code should be self-documenting)
- [ ] DB operations are idempotent where applicable
- [ ] Validation added at module boundaries (Zod schemas)
- [ ] Changes captured (`af capture` or auto-hook)
- [ ] Documentation updated if public API changed
- [ ] AGENTS.md rendered if knowledge changed (`af knowledge render`)
- [ ] Branch marked for deletion if temp branch

---

## Ready Work

Use `bd ready --json` to find unblocked work.

Current focus: **E1 (Core persistence) and E2 (CLI foundation)**

---

## Invariants

1. `.ace/ace.db` is always the source of truth
2. JSONL snapshots are append-only audit logs
3. Deterministic IDs are immutable once created
4. AGENTS.md is rendered from DB, never edited manually
5. Temp branches must be recorded in DB before use
6. All CLI commands support `--json` output
7. All mutations write JSONL audit entries

---

## Failure Modes

### Common Issues

**Database locked**
- Cause: Multiple writers without WAL mode
- Fix: Ensure WAL enabled in all connections

**Non-deterministic IDs**
- Cause: Skipped canonicalization or floating-point precision
- Fix: Always use RFC8785; round floats to fixed precision

**Cache misses in CI**
- Cause: Input hash doesn't capture all material inputs
- Fix: Include tool version, config, env vars in cache key

**Temp branch leaks**
- Cause: Not marking for deletion on completion
- Fix: Run `af branch cleanup` regularly; add pre-push hook

---

## Learned Patterns

*This section is automatically maintained by the AF learning loop. Patterns accumulate based on execution feedback.*

### TypeScript Patterns

**Critical Bug Fixes (2025-11-03)**:
- Use `dirname(path)` not `join(path, '..')` for parent directory
- Guard `JSON.parse()` on nullable DB columns: `row.field ? JSON.parse(row.field) : []`
- Use exported enum types in function signatures (`KnowledgeType` not `string`)
- Map DB nulls to `undefined` for optional fields: `row.field ?? undefined`

**Best Practices**:
- Canonicalization: Omit `undefined` from object keys, reject non-plain objects (Date, Map, Buffer)
- Number canonicalization: Normalize `-0` to `"0"` for determinism
- Helper functions internal to module don't need docstrings if name is clear

### Database Patterns

**Idempotent Operations**:
- Use `INSERT OR IGNORE` for records with deterministic IDs
- Return existing record when `info.changes === 0`
- Enables concurrent/retry safety without duplicates

**Race Condition Prevention**:
- Incremental updates: `UPDATE SET count = count + ?` not `SET count = ?`
- Wrap related writes in `db.transaction()`

**Self-Recording Migrations**:
- Migrations auto-create `schema_version` table and insert their version
- No need for migrations to manually track themselves in SQL

### Build & Test Patterns

*(Auto-populated by curator)*

### Dependency Patterns

*(Auto-populated by curator)*

### Architecture Patterns

**Modularity** (2025-11-03):
- Single responsibility per file/module
- Clear boundaries enforced by directory structure
- Minimal, focused functions (avoid God objects)

**Code Quality**:
- Self-documenting code > comments
- Remove "what" comments, keep "why" comments
- Function/variable names should be descriptive enough to understand without docs

---

## Changelog

### 2025-11-03 - Core Persistence Complete
- Implemented deterministic ID system (canonicalize + SHA-256)
- Built SQLite layer with WAL mode and connection pooling
- Created migration framework with self-recording
- Implemented repository pattern with idempotent operations
- Added JSONL audit appender for version control
- Applied oracle code review recommendations:
  - Fixed critical bugs (dirname, foreign_keys, pool.close)
  - Improved canonicalization (omit undefined, reject non-plain objects)
  - Made all add operations idempotent with `INSERT OR IGNORE`
  - Changed counter updates to incremental to prevent races
  - Added Zod validation at repository boundaries
  - Removed 190+ lines of excess comments
  - Strengthened types (use enums over strings)
- All 142 tests passing
- Production-ready core persistence layer

---

*This file is rendered from the database by `af knowledge render`. Do not edit manually.*
