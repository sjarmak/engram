# Engram Architecture: bBoN + Memory + Retrieval + GUI Agents

## Overview

Engram is an agentic memory and learning system implementing the **Best-of-N (bBoN)** comparative judgment pattern for code generation agents. It combines multi-trajectory rollouts, narrative-based judging, three-tier memory, hybrid retrieval, and GUI automation capabilities.

## Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     bBoN Orchestrator                        │
│  Multi-trajectory rollout with comparative judging          │
└────────────┬────────────────────────────────┬───────────────┘
             │                                │
             ▼                                ▼
    ┌────────────────┐              ┌────────────────┐
    │  Memory Tiers  │              │    Retrieval   │
    │                │              │   (BM25+RRF)   │
    │ • Short-term   │              │                │
    │ • Working      │◄────────────►│ • Chunkers     │
    │ • Archival     │              │ • FTS5         │
    └────────┬───────┘              │ • Embeddings   │
             │                      └────────────────┘
             ▼
    ┌────────────────┐
    │   GUI Agents   │
    │                │
    │ • AppleScript  │
    │ • SikuliX      │
    │ • Playwright   │
    └────────────────┘
```

## Components

### 1. bBoN Orchestrator (E10: engram-g9i)

**Purpose**: Run N parallel attempts at solving a task, then use comparative judging to select the best outcome.

**Key files**:
- `src/store/migrations/00XX_bbon_core.sql` - Database schema
- `src/schemas/bbon.ts` - TypeScript types
- `src/store/repository/bbonRepository.ts` - Data access
- `src/cli/commands/bbon/run.ts` - Orchestration
- `src/agents/judge/comparativeJudge.ts` - Pairwise judge
- `src/agents/judge/narrativeDiff.ts` - Narrative diff generation
- `src/cli/commands/bbon/judge.ts` - Judge CLI
- `src/cli/commands/bbon/adopt.ts` - Apply winner

**Database tables**:
```sql
tasks (id, bead_id, spec_json, created_at)
runs (id, task_id, n, seed, config_json, created_at)
attempts (id, run_id, ordinal, status, result_json, created_at)
  UNIQUE(run_id, ordinal)
attempt_steps (id, attempt_id, step_index, kind, input_json, output_json, observation_json, created_at)
judge_pairs (id, run_id, left_attempt_id, right_attempt_id, prompt_version, created_at)
  UNIQUE(run_id, left_attempt_id, right_attempt_id)
judge_outcomes (id, pair_id, winner_attempt_id, confidence, rationale_text, narrative_diff_json, model, created_at)
```

**Workflow**:
1. `en bbon run --task <spec> --n 3` → creates run, spawns 3 attempts
2. Each attempt executes existing reflect/curate/apply cycle
3. `en bbon judge --run <id>` → pairwise comparisons, narrative diffs
4. `en bbon adopt --run <id>` → apply winner's knowledge deltas

**Comparative Judge**:
- Takes two attempt results
- Generates narrative diff (aligned steps, deltas, pros/cons)
- LLM picks winner with rationale
- Cached by content_hash of (pair + prompt_version + model)

### 2. Memory Tiers (E11: engram-ku7)

**Purpose**: Three-tier memory hierarchy inspired by Letta/MemGPT.

**Key files**:
- `src/store/migrations/00XX_memory_tiers.sql` - Schema
- `src/schemas/memory.ts` - Types
- `src/store/repository/memoryRepository.ts` - Repository
- `src/adapters/beads/archival.ts` - Archival integration
- `src/adapters/renderer/agentsMd.ts` - Extended rendering

**Tiers**:

| Tier | Scope | Storage | Lifetime | Examples |
|------|-------|---------|----------|----------|
| **Short-term** | Per-run scratchpad | `memory_short_term` table | Cleared at run end | Intermediate state, temp context |
| **Working** | Project-level knowledge | `working_memory` table | Persistent, updated | Summaries, invariants, decisions |
| **Archival** | Long-term immutable | Beads issues (`.beads/`) | Permanent | Closed tasks, postmortems |

**Database tables**:
```sql
memory_short_term (id, run_id, key, value_json, created_at)
  UNIQUE(run_id, key)
  
working_memory (id, project_id, type, content_text, provenance_json, updated_at)
  type CHECK(type IN ('summary','invariant','decision'))
  
memory_events (id, subject_id, subject_kind, event, data_json, created_at)
```

**Promotion flow**:
1. `curate/apply` produces insight candidates
2. Deduplicate by `deterministicId` over `{type, normalized_content}`
3. Promote to `working_memory` with provenance
4. Render to `AGENTS.md` sections: Summaries, Invariants, Decisions
5. On bead close, snapshot delta to archival (Beads issue)

### 3. Hybrid Retrieval (E12: engram-akm)

**Purpose**: BM25 (lexical) + embeddings (semantic) + RRF (reciprocal rank fusion) for context packing.

**Key files**:
- `src/store/migrations/00XX_retrieval.sql` - Schema with FTS5
- `src/schemas/retrieval.ts` - Types
- `src/store/repository/retrievalRepository.ts` - Repository
- `src/adapters/retrieval/bm25.ts` - FTS5 search
- `src/adapters/retrieval/embeddings.ts` - Vector search (optional)
- `src/adapters/retrieval/rrf.ts` - Reciprocal rank fusion
- `src/adapters/retrieval/chunkers/*.ts` - Content extraction
- `src/cli/commands/retrieve/pack.ts` - Context packer

**Database tables**:
```sql
chunks (id, source_type, source_ref, content_text, meta_json, created_at)
chunk_fts (FTS5 virtual table: content_text, source_type, source_ref)
  tokenize='unicode61'
embeddings (chunk_id, provider, dim, vector BLOB, created_at)
context_packs (id, run_id, attempt_id, items_json, strategy, created_at)
retrieval_logs (id, query_text, bm25_hits_json, embedding_hits_json, rrf_items_json, created_at)
```

**Sources** (chunkers):
- `files.ts` - Code files, AST chunks
- `git.ts` - Git diffs, commit messages
- `knowledge.ts` - Working memory items
- `beads.ts` - Beads issues (descriptions, designs)
- `threads.ts` - Amp thread transcripts

**RRF Algorithm** (rank-based fusion):
```typescript
score(doc) = Σ weight_i / (rank_constant + rank_i)
// Default: rank_constant = 60, weights = [0.5, 0.5]
```

**BM25 Query** (SQLite FTS5):
```sql
SELECT rowid, content_text, bm25(chunk_fts) AS score 
FROM chunk_fts 
WHERE chunk_fts MATCH ?
ORDER BY score DESC 
LIMIT 100
```

**Embeddings** (optional):
- Pluggable provider (OpenAI API, local model)
- Store as BLOB in `embeddings` table
- Cosine similarity computed in TypeScript
- Row-scan for small corpora; cap candidate set for scale

**Context Packing**:
```bash
en retrieve pack --query "fix parser bug" --top-k 50 --out context.json
```
- Token budgeting per section (code, tests, diffs, knowledge)
- Outputs structured JSON for LLM consumption

### 4. GUI Agent Adapters (E13: engram-tyr)

**Purpose**: Pluggable GUI automation for observing and controlling applications.

**Key files**:
- `src/adapters/gui/types.ts` - Protocol interface
- `src/adapters/gui/registry.ts` - Capability detection
- `src/adapters/gui/applescript.ts` - macOS automation
- `src/adapters/gui/sikulix.ts` - Image-based automation (stub)
- `src/adapters/gui/playwrightCompat.ts` - Web automation (stub)
- `src/cli/commands/gui/exec.ts` - Execution wrapper

**Protocol**:
```typescript
interface GuiAgent {
  exec(action: Action): Promise<Observation>;
}

interface Action {
  type: 'click' | 'type' | 'screenshot' | 'run_script';
  target?: string;
  params?: Record<string, unknown>;
}

interface Observation {
  kind: 'output' | 'screenshot' | 'error';
  data: Record<string, unknown>;
  timestamp: string;
  artifacts?: string[]; // paths to .engram/artifacts/<run>/<attempt>/<step>.*
}
```

**AppleScript Adapter**:
```bash
en gui exec --adapter applescript --script path/to/script.applescript
en gui exec --adapter applescript --inline "tell app 'Xcode' to build"
```
- Spawns `osascript`
- Captures stdout/stderr
- Optional screenshots via `screencapture`
- Logs artifacts in `attempt_steps.observation_json`

**Platform Support**:
- macOS: AppleScript (priority 1)
- Cross-platform: SikuliX (priority 2, Java dependency)
- Web: Playwright compat layer (priority 2)

## Data Flow

### bBoN Execution Flow

```
1. User: en bbon run --task task.json --n 3
   ↓
2. Create run record (id, task_id, n=3, seed)
   ↓
3. For i in [0, 1, 2]:
     - Create attempt (run_id, ordinal=i)
     - Execute reflect/curate/apply
     - Log each step (attempt_steps)
   ↓
4. User: en bbon judge --run <id>
   ↓
5. Create judge_pairs (all pairwise comparisons)
   ↓
6. For each pair:
     - Generate narrative_diff (aligned steps, deltas)
     - LLM comparative judgment → winner + rationale
     - Save judge_outcome
   ↓
7. User: en bbon adopt --run <id>
   ↓
8. Load winner attempt
   ↓
9. Apply knowledge deltas to AGENTS.md
   ↓
10. Promote to working_memory
```

### Memory Promotion Flow

```
1. Attempt completes with insights
   ↓
2. curate/apply generates candidates
   ↓
3. Deduplicate by content_hash
   ↓
4. Insert/update working_memory
   - type: summary | invariant | decision
   - provenance: {attempt_id, run_id, confidence}
   ↓
5. Render to AGENTS.md sections
   ↓
6. (Later) On bead close:
     - Snapshot working_memory delta
     - Create archival entry in Beads
     - Link via provenance_json.bead_id
```

### Retrieval + Context Packing Flow

```
1. User/Agent: en retrieve pack --query "auth bug"
   ↓
2. BM25 search (FTS5):
     SELECT * FROM chunk_fts WHERE MATCH 'auth bug' LIMIT 100
   ↓
3. (Optional) Embedding search:
     - Embed query
     - Cosine similarity against embeddings.vector
   ↓
4. RRF fusion:
     score = Σ weight_i / (rank_constant + rank_i)
   ↓
5. Token budgeting:
     - Allocate quotas: code (40%), tests (20%), diffs (20%), knowledge (20%)
     - Pack items until budget exhausted
   ↓
6. Output context.json:
     {
       "query": "auth bug",
       "items": [
         {"source": "file:auth.ts", "content": "...", "score": 0.95},
         {"source": "bead:bd-123", "content": "...", "score": 0.87},
         ...
       ],
       "strategy": "rrf",
       "total_tokens": 4000
     }
```

## Integration Points

### Beads Integration

Beads provides:
- Issue tracking with dependency graph
- Archival tier for memory
- JSONL persistence for git-friendly sync

Engram uses Beads for:
1. **Archival memory**: Closed beads = immutable history
2. **Task specs**: `tasks.bead_id` links bBoN runs to Beads issues
3. **Provenance**: `working_memory.provenance_json.bead_id`

```bash
# Create bBoN run linked to bead
en bbon run --task bd-xyz --n 3

# On bead close, snapshot memory
bd close bd-xyz --reason "Completed"
# → triggers archival adapter → snapshot working_memory delta
```

### MCP Server Integration

The MCP server (E5: engram-3) exposes tools wrapping CLI commands:

```typescript
// mcp/tools.ts
{
  "list_knowledge": () => exec("en knowledge list --json"),
  "bbon_run": (task, n) => exec(`en bbon run --task ${task} --n ${n} --json`),
  "bbon_judge": (run_id) => exec(`en bbon judge --run ${run_id} --json`),
  "retrieve_pack": (query, k) => exec(`en retrieve pack --query "${query}" --top-k ${k} --json`)
}
```

Agents (Amp, Claude Code, etc.) call MCP tools → CLI → SQLite → results.

### Git/Thread Adapters

- **Git adapter** (`src/adapters/git`): Extract diffs, commit messages → chunks
- **Thread adapter** (`src/adapters/threads`): Index Amp thread transcripts → retrieval

## Schema Patterns

### Deterministic IDs

All entities use deterministic IDs via canonical JSON hashing:

```typescript
import { deterministicId } from './utils/id.js';

const runId = deterministicId({ task_id, n, seed, created_at });
const pairId = deterministicId({ run_id, left_attempt_id, right_attempt_id });
```

### JSONL Mirroring

Key tables mirror to JSONL for git-friendly auditing:
- `logs/insights.jsonl` (current)
- `logs/runs.jsonl` (new)
- `logs/memory_events.jsonl` (new)

### Provenance Tracking

All derived knowledge includes provenance:

```json
{
  "id": "mem-abc123",
  "type": "invariant",
  "content": "Always run tsc before tests",
  "provenance": {
    "source": "bbon_run",
    "run_id": "run-xyz",
    "attempt_id": "attempt-2",
    "winner": true,
    "confidence": 0.92,
    "judge_rationale": "...",
    "bead_id": "bd-789"
  },
  "updated_at": "2025-11-05T12:00:00Z"
}
```

## Critical Path

**Priority 0 (Critical - implement first)**:
1. E10-T1: bBoN core migration
2. E10-T2/T3: Schemas + repository
3. E10-T4: `en bbon run` orchestrator
4. E10-T5/T6: Comparative judge + narrative diffs
5. E11-T1/T2: Memory tiers schema + repository
6. E11-T3: Working memory promotion
7. E12-T1: Retrieval schema with FTS5
8. E12-T3: BM25 search
9. E12-T4: RRF aggregator + context packer

**Priority 1 (Important - implement next)**:
10. E10-T7: `en bbon adopt`
11. E12-T5: Embeddings (optional, behind feature flag)
12. E12-T6: Content chunkers
13. E13-T1/T2: GUI adapter interface + AppleScript
14. E5: MCP tool wrappers

**Priority 2 (Polish - implement when stable)**:
15. E10-T8: bBoN E2E tests
16. E11-T4: Archival via Beads
17. E13-T3: SikuliX + Playwright stubs
18. E8: Documentation updates

## Testing Strategy

### Determinism

- Use fixed seeds for rollouts
- Store full prompts + responses in `attempt_steps`
- Assert structural outcomes (winner chosen, rationale present)
- Do NOT assert verbatim text (LLMs are non-deterministic)

### E2E Tests

```typescript
// tests/workflows/bbon.e2e.test.ts
test('bBoN orchestration with 3 attempts', async () => {
  const taskSpec = { goal: 'fix parser CRLF bug' };
  const run = await bbonRepository.createRun(taskSpec, 3, 42);
  
  // Run attempts
  await orchestrator.runAttempts(run.id);
  
  // Verify attempts logged
  const attempts = await bbonRepository.listAttempts(run.id);
  expect(attempts).toHaveLength(3);
  
  // Mock judge (or use real with fixed prompts)
  const outcome = await judge.compare(attempts[0], attempts[1]);
  expect(outcome.winner_attempt_id).toBeDefined();
  expect(outcome.rationale_text).toBeTruthy();
  
  // Verify structural narrative_diff
  expect(outcome.narrative_diff_json).toMatchObject({
    aligned_steps: expect.any(Array),
    deltas: expect.any(Array),
    pros_cons: expect.any(Object)
  });
});
```

### FTS5 Availability Check

```typescript
// src/store/sqlite/database.ts
export function checkFTS5(): void {
  const result = db.prepare("PRAGMA compile_options").all();
  const hasFTS5 = result.some(r => r.compile_option === 'ENABLE_FTS5');
  if (!hasFTS5) {
    throw new Error(
      'SQLite FTS5 not available. Please rebuild SQLite with --enable-fts5 or use a binary with FTS5 support.'
    );
  }
}
```

## Configuration

Environment variables:

```bash
# Retrieval
ENGRAM_RETRIEVAL_RRF_CONSTANT=60        # RRF rank constant (default: 60)
ENGRAM_RETRIEVAL_WEIGHTS="0.5,0.5"      # Lexical,semantic weights
ENGRAM_EMBEDDINGS_PROVIDER=openai       # openai | local | disabled
ENGRAM_EMBEDDINGS_MODEL=text-embedding-3-small

# bBoN
ENGRAM_BBON_DEFAULT_N=3                 # Default rollout count
ENGRAM_JUDGE_MODEL=gpt-4                # Judge LLM
ENGRAM_JUDGE_CACHE_TTL=86400            # 24h cache

# GUI
ENGRAM_GUI_ARTIFACTS_DIR=.engram/artifacts
ENGRAM_GUI_SCREENSHOT_FORMAT=png
```

## References

- **bBoN Research**: [arXiv:2510.02250](https://arxiv.org/html/2510.02250v1) - Behavior Best-of-N
- **Letta Memory**: [github.com/LettaAgent/Letta](https://github.com/letta-ai/letta)
- **Beads Issues**: [github.com/steveyegge/beads](https://github.com/steveyegge/beads)
- **OpenSearch RRF**: [opensearch.org/blog/introducing-reciprocal-rank-fusion](https://opensearch.org/blog/introducing-reciprocal-rank-fusion-hybrid-search/)
- **SikuliX**: [github.com/RaiMan/SikuliX1](https://github.com/RaiMan/SikuliX1)

## Next Steps

1. Implement critical path (E10 + E11 + E12 core)
2. Run E2E tests with deterministic seeds
3. Integrate MCP tools
4. Add GUI adapters (AppleScript first)
5. Write comprehensive documentation
6. Benchmark retrieval performance and tune RRF parameters
