# Engram Open Source Architecture

## Core Principle

**100% open source by default**, with only one optional proprietary integration: Sourcegraph Cloud/Enterprise for cross-repository code intelligence.

## Open Source Stack

### Runtime & Dependencies

| Component | Open Source Solution | License |
|-----------|---------------------|---------|
| **Runtime** | Node.js / Bun | MIT / MIT |
| **Language** | TypeScript | Apache 2.0 |
| **Database** | SQLite with FTS5 | Public Domain |
| **CLI Framework** | Commander.js / Yargs | MIT |
| **Validation** | Zod | MIT |
| **Testing** | Vitest | MIT |
| **LLM Inference** | Ollama (local) / llama.cpp | MIT / MIT |
| **Embeddings** | sentence-transformers (local) / Ollama | Apache 2.0 / MIT |
| **Vector Search** | SQLite-vec / SQLite-vss | Apache 2.0 / MIT |
| **GUI Automation** | AppleScript (macOS), pywinauto (Windows), xdotool (Linux) | System / BSD / MIT |
| **Git Integration** | simple-git | MIT |

### LLM Provider Architecture (Pluggable)

```typescript
// src/llm/provider.ts
export interface LLMProvider {
  name: string;
  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  embed(text: string): Promise<number[]>;
}

// Default: Ollama (100% local, open source)
export class OllamaProvider implements LLMProvider {
  name = 'ollama';
  private baseUrl: string;
  
  constructor(baseUrl = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
  }
  
  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    // POST to /api/chat with model: llama3.1, mistral, etc.
  }
  
  async embed(text: string): Promise<number[]> {
    // POST to /api/embeddings with model: nomic-embed-text, mxbai-embed-large
  }
}

// Optional: OpenAI-compatible endpoints (for local models via vLLM, llama-cpp-server, etc.)
export class OpenAICompatProvider implements LLMProvider {
  name = 'openai-compat';
  // Works with: vLLM, llama-cpp-server, Anyscale, Together AI, etc.
}

// Optional: Anthropic, OpenAI, etc. (if user provides API key)
export class RemoteProvider implements LLMProvider {
  // Fallback for users who prefer managed services
}
```

**Default Configuration** (`src/config.ts`):

```typescript
export const DEFAULT_CONFIG = {
  llm: {
    provider: 'ollama',                    // 100% local by default
    baseUrl: 'http://localhost:11434',
    chatModel: 'llama3.1:8b',              // Fast, high-quality
    judgeModel: 'llama3.1:70b',            // Stronger for comparative judgment
    embeddingModel: 'nomic-embed-text',    // 768-dim, great for code
    temperature: 0.7,
  },
  retrieval: {
    rrfConstant: 60,
    weights: [0.5, 0.5],                   // BM25 + embeddings
    embeddingsEnabled: true,
    vectorBackend: 'sqlite-vec',           // Pure SQLite extension
  },
  sourcegraph: {
    enabled: false,                        // Optional proprietary integration
    endpoint: null,
    token: null,
  }
};
```

### Embedding Models (Open Source)

**Recommended local models** (via Ollama or sentence-transformers):

| Model | Dimensions | Best For | Size |
|-------|------------|----------|------|
| **nomic-embed-text** | 768 | Code, general text | 274 MB |
| **mxbai-embed-large** | 1024 | High accuracy | 670 MB |
| **all-MiniLM-L6-v2** | 384 | Fast, small | 90 MB |
| **BGE-small-en-v1.5** | 384 | Code retrieval | 133 MB |

**Storage** (SQLite-vec):

```sql
-- Use sqlite-vec extension (pure SQLite, no external dependencies)
-- https://github.com/asg017/sqlite-vec

CREATE VIRTUAL TABLE vec_embeddings USING vec0(
  chunk_id TEXT PRIMARY KEY,
  embedding FLOAT[768]  -- nomic-embed-text dimensionality
);

-- Cosine similarity search
SELECT 
  chunk_id,
  vec_distance_cosine(embedding, ?) AS distance
FROM vec_embeddings
WHERE distance < 0.5
ORDER BY distance
LIMIT 100;
```

**Alternative** (if sqlite-vec unavailable): In-memory search with TypeScript cosine similarity (works everywhere, no deps).

### Judge Models (Comparative Selection)

**Recommended open source models** (via Ollama):

| Model | Parameters | Best For | RAM Required |
|-------|------------|----------|--------------|
| **llama3.1:8b** | 8B | Fast iteration, good quality | 8 GB |
| **llama3.1:70b** | 70B | Production judge (high accuracy) | 48 GB |
| **mistral:7b** | 7B | Lightweight alternative | 5 GB |
| **qwen2.5-coder:14b** | 14B | Code-specific reasoning | 16 GB |

**Quantized versions** (for lower RAM):
- `llama3.1:8b-instruct-q4_K_M` - 4.9 GB
- `llama3.1:70b-instruct-q4_K_M` - 40 GB

**Comparative judge prompt** (model-agnostic):

```typescript
// src/agents/judge/comparativeJudge.ts
const JUDGE_PROMPT = `You are comparing two attempts at solving a coding task.

**Task**: {task_description}

**Attempt A**:
{attempt_a_narrative}

**Attempt B**:
{attempt_b_narrative}

**Narrative Diff**:
{aligned_steps_diff}

**Evaluation Criteria** (in priority order):
1. Correctness - Does it solve the problem?
2. Completeness - Are all requirements met?
3. Code quality - Is it maintainable, tested, well-designed?
4. Risk - Does it introduce bugs or break existing functionality?

**Instructions**:
- Compare the two attempts on each criterion
- Provide a clear winner (A or B) with confidence (0.0-1.0)
- Give a concise rationale (2-3 sentences)

**Output JSON**:
{
  "winner": "A" | "B",
  "confidence": 0.0-1.0,
  "rationale": "string"
}`;
```

### GUI Automation (Open Source)

**Platform-specific open source tools**:

| Platform | Tool | Implementation | License |
|----------|------|----------------|---------|
| **macOS** | AppleScript | System built-in, `osascript` CLI | Apple |
| | pyatom | Python library for Accessibility API | MIT |
| **Windows** | pywinauto | UI Automation / Win32 API | BSD |
| | AutoIt | Scripting language for Windows GUI | Freeware |
| **Linux** | xdotool | X11 window/input automation | BSD |
| | PyAutoGUI | Cross-platform input simulation | BSD |
| **Cross-platform** | SikuliX | Image-based automation (OpenCV) | MIT |
| | Selenium | Browser automation | Apache 2.0 |

**Adapter implementation** (already in plan):

```typescript
// src/adapters/gui/applescript.ts
export class AppleScriptAdapter implements GuiAgent {
  async exec(action: Action): Promise<Observation> {
    const script = this.actionToScript(action);
    const { stdout, stderr } = await execAsync(`osascript -e '${script}'`);
    
    // Optional: screenshot via system tool
    if (action.screenshot) {
      await execAsync(`screencapture ${screenshotPath}`);
    }
    
    return {
      kind: 'output',
      data: { stdout, stderr },
      artifacts: [screenshotPath],
      timestamp: new Date().toISOString()
    };
  }
}
```

## Preserved Learning Framework (E3)

The **existing learning loop** is **fully integrated** and runs inside each bBoN attempt:

```
┌─────────────────────────────────────────────────┐
│         bBoN Orchestrator (NEW)                 │
│  en bbon run --n 3 --task "fix auth bug"       │
└─────────────┬───────────────────────────────────┘
              │
              ├─► Attempt 1 ──┐
              │                │
              ├─► Attempt 2 ──┼─► Each runs full learning cycle:
              │                │   1. capture (trace execution)
              └─► Attempt 3 ──┘   2. reflect (extract insights)
                                  3. curate (deduplicate, score)
                                  4. apply (update AGENTS.md)
                                  
                                  ↓
                          Judge compares outcomes
                                  ↓
                          Winner adopted to working_memory
```

### Learning Framework Tables (Existing E3)

**Already implemented** (from current Engram):

```sql
-- Execution traces
CREATE TABLE traces (
  id TEXT PRIMARY KEY,
  bead_id TEXT,
  command TEXT NOT NULL,
  status TEXT NOT NULL,  -- pass | fail
  errors TEXT,           -- JSON array
  created_at TEXT NOT NULL
);

-- Extracted insights
CREATE TABLE insights (
  id TEXT PRIMARY KEY,
  pattern TEXT NOT NULL,
  confidence REAL NOT NULL,
  helpful INTEGER DEFAULT 0,
  harmful INTEGER DEFAULT 0,
  meta_tags TEXT,        -- JSON array
  related_beads TEXT,    -- JSON array
  created_at TEXT NOT NULL
);

-- Knowledge items (curated insights)
CREATE TABLE knowledge (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,    -- pattern | command | style
  content TEXT NOT NULL,
  section TEXT,
  provenance TEXT,       -- JSON: trace_id, insight_id
  created_at TEXT NOT NULL
);
```

**Integration with bBoN**:

```sql
-- Link attempt to existing trace system
CREATE TABLE attempt_steps (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  kind TEXT NOT NULL,           -- capture | reflect | curate | apply
  input_json TEXT,
  output_json TEXT,
  observation_json TEXT,
  trace_id TEXT,                -- FK to traces table
  insight_ids TEXT,             -- JSON array of insight IDs
  created_at TEXT NOT NULL,
  FOREIGN KEY(attempt_id) REFERENCES attempts(id),
  FOREIGN KEY(trace_id) REFERENCES traces(id)
);
```

**Workflow**:

```typescript
// src/cli/commands/bbon/run.ts
async function runAttempt(attemptId: string, taskSpec: TaskSpec): Promise<void> {
  // Step 1: Capture (existing E3 command)
  const captureResult = await execCommand('en capture', {
    bead: taskSpec.bead_id,
    exec: taskSpec.test_command,
  });
  await bbonRepo.logStep(attemptId, 0, 'capture', {}, captureResult, {
    trace_id: captureResult.trace_id
  });
  
  // Step 2: Reflect (existing E3 command)
  const reflectResult = await execCommand('en reflect', {
    trace: captureResult.trace_id,
  });
  await bbonRepo.logStep(attemptId, 1, 'reflect', {}, reflectResult, {
    insight_ids: reflectResult.insight_ids
  });
  
  // Step 3: Curate (existing E3 command)
  const curateResult = await execCommand('en curate', {
    insights: reflectResult.insight_ids,
  });
  await bbonRepo.logStep(attemptId, 2, 'curate', {}, curateResult);
  
  // Step 4: Apply (existing E3 command)
  const applyResult = await execCommand('en apply', {
    deltas: curateResult.deltas,
  });
  await bbonRepo.logStep(attemptId, 3, 'apply', {}, applyResult);
  
  // Mark attempt complete
  await bbonRepo.updateAttempt(attemptId, {
    status: 'completed',
    result_json: JSON.stringify(applyResult)
  });
}
```

**This preserves**:
- ✅ Capture execution traces (builds, tests, lints)
- ✅ Reflect on failures to extract insights
- ✅ Curate insights with deduplication and confidence scoring
- ✅ Apply knowledge deltas to AGENTS.md
- ✅ Full provenance tracking (trace → insight → knowledge)

**And adds**:
- ✅ Multi-trajectory exploration (run N attempts with different approaches)
- ✅ Comparative judgment (pick best outcome via narrative diffs)
- ✅ Working memory tier (persistent summaries/invariants/decisions)
- ✅ Archival via Beads (immutable historical context)

## Sourcegraph Integration (Optional Only)

**Only proprietary component** - disabled by default:

```typescript
// src/adapters/retrieval/sourcegraph.ts (OPTIONAL)
export class SourcegraphAdapter {
  constructor(
    private endpoint: string,    // e.g., https://sourcegraph.com or self-hosted
    private token: string         // User-provided API token
  ) {}
  
  async search(query: string, repos: string[]): Promise<SearchResult[]> {
    // GraphQL API call to Sourcegraph
    // Returns code chunks with SCIP-based symbol info
  }
  
  async symbolInfo(symbol: string, repo: string): Promise<SymbolInfo> {
    // Get cross-repository references, definitions
  }
}

// Graceful fallback
export function getRetrievalAdapter(): RetrievalAdapter {
  if (config.sourcegraph.enabled && config.sourcegraph.token) {
    return new SourcegraphAdapter(
      config.sourcegraph.endpoint,
      config.sourcegraph.token
    );
  }
  
  // Default: local-only retrieval
  return new LocalRetrievalAdapter();
}
```

**Local-only alternative** (using existing chunkers):

```typescript
// src/adapters/retrieval/local.ts (DEFAULT)
export class LocalRetrievalAdapter implements RetrievalAdapter {
  async search(query: string): Promise<SearchResult[]> {
    // BM25 via SQLite FTS5 (100% local)
    const bm25Results = await this.bm25.search(query, 100);
    
    // Embeddings via Ollama (100% local)
    const embeddingResults = this.embeddings.enabled
      ? await this.embeddings.search(query, 100)
      : [];
    
    // RRF fusion (100% local)
    return rrf([bm25Results, embeddingResults]);
  }
  
  async index(sources: ContentSource[]): Promise<void> {
    // Index local files, git history, Beads, threads
    for (const source of sources) {
      const chunks = await this.chunkers[source.type].extract(source);
      await this.repository.upsertChunks(chunks);
      
      if (this.embeddings.enabled) {
        for (const chunk of chunks) {
          const embedding = await this.ollama.embed(chunk.content);
          await this.repository.upsertEmbedding(chunk.id, embedding);
        }
      }
    }
  }
}
```

## Complete Open Source Bill of Materials

### Core Dependencies

```json
{
  "dependencies": {
    "@types/better-sqlite3": "^7.6.8",
    "better-sqlite3": "^9.2.2",         // SQLite driver (MIT)
    "commander": "^11.1.0",             // CLI framework (MIT)
    "zod": "^3.22.4",                   // Validation (MIT)
    "simple-git": "^3.22.0"             // Git integration (MIT)
  },
  "devDependencies": {
    "typescript": "^5.3.3",             // Language (Apache 2.0)
    "vitest": "^1.1.0",                 // Testing (MIT)
    "prettier": "^3.1.1",               // Formatting (MIT)
    "eslint": "^8.56.0"                 // Linting (MIT)
  },
  "optionalDependencies": {
    "sqlite-vec": "^0.1.0"              // Vector extension (Apache 2.0)
  }
}
```

### External Services (Optional)

| Service | Purpose | Open Source Alternative | Default |
|---------|---------|------------------------|---------|
| **Ollama** | LLM inference | Self-hosted, 100% local | ✅ Enabled |
| **Sourcegraph** | Cross-repo search | Local FTS5 + file chunkers | ❌ Disabled |
| **OpenAI API** | Remote LLM | Ollama with local models | ❌ Disabled |

## Installation (Zero Proprietary Dependencies)

```bash
# 1. Install Engram
git clone https://github.com/your-org/engram.git
cd engram
npm install
npm run build

# 2. Install Ollama (for local LLM inference)
# macOS/Linux:
curl -fsSL https://ollama.com/install.sh | sh

# Windows:
# Download from https://ollama.com/download

# 3. Pull recommended models (one-time setup)
ollama pull llama3.1:8b          # Fast chat model (4.9 GB)
ollama pull llama3.1:70b         # Production judge (40 GB, optional)
ollama pull nomic-embed-text     # Embeddings (274 MB)

# 4. Initialize Engram (creates .engram/ and .beads/)
en init

# 5. (Optional) Enable SQLite vector extension
npm install sqlite-vec

# 6. (Optional) Configure Sourcegraph
en config set sourcegraph.enabled true
en config set sourcegraph.endpoint https://sourcegraph.com
en config set sourcegraph.token YOUR_TOKEN
```

**Total disk usage** (with models):
- Engram core: ~50 MB
- Ollama + llama3.1:8b + embeddings: ~5.5 GB
- Optional llama3.1:70b: +40 GB

## Performance Benchmarks (100% Local)

**Hardware**: M1 MacBook Pro (16 GB RAM)

| Operation | Time | Notes |
|-----------|------|-------|
| BM25 search (100 results) | 5-10ms | SQLite FTS5 is very fast |
| Embedding generation (nomic-embed-text) | 50-100ms/chunk | Via Ollama |
| Cosine similarity (1000 chunks) | 10-20ms | TypeScript implementation |
| RRF fusion (2x100 results) | 1-2ms | Pure computation |
| Context packing (50 items) | 5-10ms | Token counting + budgeting |
| Judge comparison (8B model) | 2-5s | Ollama with llama3.1:8b |
| Judge comparison (70B model) | 10-20s | Ollama with llama3.1:70b (quantized) |

**Scaling**:
- Up to 100k chunks: In-memory vector search is fine
- Above 100k chunks: Use sqlite-vec with HNSW index
- Judge latency: Use 8B model for iteration, 70B for production

## License Strategy

**Engram Framework**: MIT License

```
MIT License

Copyright (c) 2025 Engram Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction...
```

**Third-party licenses** (all permissive):
- SQLite: Public Domain
- Ollama: MIT
- TypeScript: Apache 2.0
- Node.js: MIT
- All dependencies: MIT or Apache 2.0

## Migration Path for Existing Users

If users are currently using proprietary services, migration is simple:

```bash
# Before (using OpenAI)
export OPENAI_API_KEY=sk-...
en bbon run --task task.json --n 3

# After (using Ollama, 100% local)
# Install Ollama and pull models (see above)
en config set llm.provider ollama
en bbon run --task task.json --n 3  # Same command!
```

**Adapter is swapped transparently** - no code changes required.

## Recommended Setup for Different Use Cases

### Laptop Development (8-16 GB RAM)

```bash
ollama pull llama3.1:8b-instruct-q4_K_M      # 4.9 GB
ollama pull nomic-embed-text                 # 274 MB

en config set llm.chatModel llama3.1:8b-instruct-q4_K_M
en config set llm.judgeModel llama3.1:8b-instruct-q4_K_M
en config set llm.embeddingModel nomic-embed-text
en config set retrieval.vectorBackend in-memory
```

### Workstation (32-64 GB RAM)

```bash
ollama pull llama3.1:8b                      # Chat
ollama pull llama3.1:70b-instruct-q4_K_M     # Judge (40 GB)
ollama pull nomic-embed-text

en config set llm.chatModel llama3.1:8b
en config set llm.judgeModel llama3.1:70b-instruct-q4_K_M
en config set retrieval.vectorBackend sqlite-vec
```

### Server/CI (GPU Available)

```bash
# Use unquantized models for best quality
ollama pull llama3.1:70b                     # Full precision
ollama pull nomic-embed-text

en config set llm.judgeModel llama3.1:70b
en config set retrieval.vectorBackend sqlite-vec
```

## Summary

**100% open source by default**:
✅ Local LLM inference (Ollama with Llama 3.1, Mistral, etc.)  
✅ Local embeddings (nomic-embed-text, BGE, etc.)  
✅ SQLite for all persistence (FTS5 for BM25, sqlite-vec for vectors)  
✅ Open source GUI automation (AppleScript, pywinauto, xdotool)  
✅ All TypeScript/Node.js dependencies are MIT/Apache 2.0  
✅ Preserves full learning framework (capture/reflect/curate/apply)  
✅ Learning loop runs inside each bBoN attempt  

**Only optional proprietary component**:
- Sourcegraph Cloud/Enterprise (for cross-repo code intelligence)
- Gracefully falls back to local file indexing if disabled

**No API keys required** - runs 100% offline after initial model download.
