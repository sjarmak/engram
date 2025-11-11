# Engram Framework (EF) - Agent Behavioral Map

**Purpose**: Self-improving AI coding agent framework with deterministic learning and memory.

**Core Loop**: capture → reflect → curate → apply

**Source of Truth**: `.engram/engram.db` (SQLite) with JSONL audit snapshots

---

## Quick Start

```bash
bd ready                              # Find unblocked work
bd update <id> --status in_progress   # Claim bead
# Write tests first (if testable spec)
# Make minimal changes
npm test                              # Auto-captures traces
# Propose commit after green test
bd close <id> --reason "Done"         # Auto-learns
```

---

## CLI Commands

### Command Pattern

Commands are async handlers returning plain data. Router handles envelopes.

```typescript
export async function myCommand(ctx: CommandContext): Promise<MyResult> {
  // 1. Validate input (Zod at boundary)
  // 2. Check preconditions (throw Error if failed)
  // 3. Open DB via getDatabase (not initDatabase)
  // 4. Perform work via Repository
  // 5. Log to stderr when !ctx.options.json
  // 6. Return plain result object (no envelope)
}
```

**Registration**: Add to `bin/en`:
```typescript
import { myCommand } from '../dist/cli/commands/my.js';
registerCommand('my', myCommand);
```

### Input Handling

Prefer: file path → stdin → JSON literal

```typescript
if (arg0 && existsSync(arg0)) raw = readFileSync(arg0, 'utf8');
else if (!arg0 && !process.stdin.isTTY) raw = await readAllStdin();
else if (arg0) raw = arg0;
else throw new Error('No input. Provide JSON via stdin, file path, or literal.');
```

### Output Conventions

- **Stderr for humans**: Progress, status, errors when `!ctx.options.json`
- **Return data**: Plain objects; router wraps in envelope for `--json`
- **Envelope format**: `{apiVersion: 'v1', cmd, ok, data?, errors?}`

---

## Database

### Lifecycle

Use `getDatabase({ path })` for existing DB. Validate existence first:

```typescript
const dbPath = join(process.cwd(), '.engram', 'engram.db');
if (!existsSync(dbPath)) throw new Error('Database not initialized (run: en init)');
const db = getDatabase({ path: dbPath });
```

### Patterns

- **WAL mode**: Always enabled with `foreign_keys = ON`
- **Idempotent writes**: Use `INSERT OR IGNORE` for deterministic IDs; return existing when `info.changes === 0`
- **Incremental updates**: `SET counter = counter + ?` (not `SET counter = ?`)
- **Transactions**: Wrap multi-step writes in `db.transaction()`
- **Migrations**: Never modify existing; add new ones. Self-recording (no manual tracking).

### Nullable Handling

Guard `JSON.parse()` on nullable columns:

```typescript
const tags = row.meta_tags ? JSON.parse(row.meta_tags) : [];
const module = row.module ?? undefined; // Map NULL to undefined for optional fields
```

---

## TypeScript

### Imports

Always use `.js` extensions for ESM:

```typescript
import { foo } from './bar.js';  // Correct (even for .ts files)
```

### Types

- Use `unknown` and validate with Zod (not `any`)
- Use exported enums in signatures (`KnowledgeType` not `string`)
- Leverage inference; don't over-annotate obvious types
- Avoid `@ts-expect-error`; fix the type issue

### Zod Validation

Validate all external data at boundaries:

```typescript
const result = MySchema.safeParse(input);
if (!result.success) {
  const errors = result.error.issues.map((e: z.ZodIssue) => 
    `${e.path.join('.')}: ${e.message}`
  );
  throw new Error(`Validation failed: ${errors.join(', ')}`);
}
```

---

## Testing

### Framework

Vitest with `--run` flag (no watch mode):

```bash
npm test  # Already includes --run in package.json
```

### Strategy

- **Write tests first** for code changes with testable specs
- **Never edit tests to pass**; fix the implementation
- **Propose commit** after each green test (wait for approval)
- **Deterministic**: Mock timestamps, IDs, or use fixed seeds

---

## Code Quality

### Clarity Over Cleverness

- Self-documenting code: Function/variable names explain purpose
- Minimal comments: Remove "what", keep "why"
- Single responsibility: Functions focused on one task
- No excess docstrings: Skip JSDoc that repeats signature

### Canonicalization

- Omit `undefined` from object keys
- Reject non-plain objects (Date, Map, Buffer)
- Normalize `-0` to `"0"` for determinism

---

## Beads (Issue Tracking)

**Rule**: Use `bd` for ALL task tracking. No markdown TODOs.

### Workflow

```bash
bd create "Title" -t bug|feature|task -p 0-4    # Create
bd update <id> --status in_progress             # Claim
# Work...
bd close <id> --reason "Done"                   # Complete
```

### Priorities

- `0` Critical (security, data loss, broken builds)
- `1` High (major features, important bugs)
- `2` Medium (default)
- `3` Low (polish)
- `4` Backlog (future ideas)

### Landing the Plane

**When the user says "let's land the plane"**, follow this clean session-ending protocol:

1. **File beads issues for any remaining work** that needs follow-up
2. **Ensure all quality gates pass** (only if code changes were made) - run tests, linters, builds (file P0 issues if broken)
3. **Update beads issues** - close finished work, update status
4. **Sync the issue tracker carefully** - Work methodically to ensure both local and remote issues merge safely. This may require pulling, handling conflicts (sometimes accepting remote changes and re-importing), syncing the database, and verifying consistency. Be creative and patient - the goal is clean reconciliation where no issues are lost.
5. **Clean up git state** - Clear old stashes and prune dead remote branches:
   ```bash
   git stash clear                    # Remove old stashes
   git remote prune origin            # Clean up deleted remote branches
   ```
6. **Verify clean state** - Ensure all changes are committed and pushed, no untracked files remain
7. **Choose a follow-up issue for next session**
   - Provide a prompt for the user to give to you in the next session
   - Format: "Continue work on bd-X: [issue title]. [Brief context about what's been done and what's next]"

**Example "land the plane" session:**

```bash
# 1. File remaining work
bd create "Add integration tests" -t task -p 2

# 2. Run quality gates (only if code changes were made)
npm test
npm run build

# 3. Close finished issues
bd close bd-42 bd-43 --reason "Completed"

# 4. Sync carefully - example workflow (adapt as needed):
git pull --rebase
# If conflicts in .beads/issues.jsonl, resolve thoughtfully:
#   - Accept remote if needed
#   - Re-import if changed
bd sync

# 5. Verify clean state
git status

# 6. Choose next work
bd ready
```

Then provide the user with:

- Summary of what was completed this session
- What issues were filed for follow-up
- Status of quality gates (all passing / issues filed)
- Recommended prompt for next session

---

## Architecture Principles

### 1. Offline-First

SQLite is authoritative. JSONL snapshots for audit/git.

### 2. Deterministic IDs

Canonical JSON (RFC8785) → SHA-256 → 64-char hex

```typescript
const id = deterministicId(obj);  // Same content → same ID
```

### 3. Modular Boundaries

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

**One agent per module at a time.** Cross-module changes split into separate beads.

### 4. CLI Drives Everything

Single binary. MCP calls CLI commands. Subagents are stateless.

### 5. Validate at Boundaries

Use Zod schemas at all external interfaces (API, DB, file I/O).

---

## Pre-Commit Checklist

Run before proposing commit:

- [ ] `npm test`
- [ ] `npm run build` (typecheck)
- [ ] No `any` types introduced
- [ ] Excess comments removed
- [ ] Validation added at boundaries
- [ ] DB operations idempotent where applicable

---

<!-- BEGIN: LEARNED_PATTERNS -->
## Learned Patterns

*Auto-maintained by learning loop. Patterns accumulate from execution feedback.*

---

<!-- END: LEARNED_PATTERNS -->

## Common Failures & Fixes

**Database locked**: Enable WAL mode in all connections

**Non-deterministic IDs**: Always canonicalize before hashing; round floats to fixed precision

**Command not found**: Register in `bin/en` and rebuild (`npm run build`)

**Type errors on Zod**: Use `err.issues` (not `err.errors`) and type as `z.ZodIssue`

---

## Invariants

1. `.engram/engram.db` is source of truth
2. JSONL snapshots are append-only audit logs
3. Deterministic IDs are immutable once created
4. AGENTS.md rendered from DB (do not edit manually)
5. Temp branches recorded in DB before use
6. All CLI commands support `--json`
7. All mutations write JSONL audit entries

---

*This file is rendered from the database by `en knowledge render`. Do not edit manually.*
