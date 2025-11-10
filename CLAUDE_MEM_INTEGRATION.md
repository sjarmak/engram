# Claude-Mem Integration: Agent-Agnostic Patterns for Engram

## Overview

[claude-mem](https://github.com/thedotmack/claude-mem) provides several innovative patterns for persistent memory that can be adapted for Engram in an agent-agnostic way.

## Key Adoptable Patterns

### 1. Progressive Disclosure (Critical Innovation)

**Problem**: Traditional RAG dumps 35K tokens upfront (94% waste ratio)

**Solution**: Three-layer retrieval model

```typescript
// Layer 1: Index (always shown) - ~800 tokens for 50 items
interface ObservationIndex {
  id: string;
  title: string;              // ~10 words, semantic compression
  type: ObservationType;
  source: string;             // "amp://T-abc123" or "bd://bd-xyz"
  token_cost: number;         // Estimated retrieval cost
  created_at: number;
  icon: string;               // Visual quick-scan (🔴🟣🔵🟢)
}

// Layer 2: Details (fetch on-demand) - ~155 tokens per item
interface ObservationDetails {
  subtitle: string;           // One sentence (max 24 words)
  facts: string[];            // Self-contained statements
  narrative: string;          // Full context (1-3 paragraphs)
  concepts: ConceptTag[];
  artifacts: Artifact[];
}

// Layer 3: Source (read original)
// Read full Amp thread, Beads issue, or file
```

**Implementation in Engram**:

```typescript
// src/adapters/observations/index.ts
export class ObservationManager {
  async getIndex(filters?: {
    project?: string;
    recency_days?: number;
    limit?: number;
  }): Promise<ObservationIndex[]> {
    // Returns lightweight index with titles + token costs
    // Default: last 50 observations from 90-day window
  }
  
  async getDetails(ids: string[]): Promise<ObservationDetails[]> {
    // Hydrate full details for selected observations
  }
}
```

**CLI Commands**:
```bash
# Show index (Layer 1)
en observations list --format index --limit 50
# Output: Markdown table with titles, costs, sources

# Fetch details (Layer 2)
en observations get obs-123 obs-456 --format full
# Output: Full narrative + facts + artifacts

# Read source (Layer 3)
en thread read T-abc123  # Existing command
bd show bd-xyz           # Existing command
```

---

### 2. Hierarchical Observation Model

**Key Innovation**: Semantic hierarchy instead of flat text chunks

**Schema**:

```typescript
// src/schemas/observation.ts
export interface Observation {
  id: string;
  
  // Hierarchical structure (progressive detail)
  title: string;              // ~10 words, semantic compression
  subtitle: string;           // One sentence explanation
  facts: string[];            // Standalone statements (searchable)
  narrative: string;          // Full context (1-3 paragraphs)
  
  // Classification (dual dimensions)
  type: ObservationType;      // WHAT happened
  concepts: ConceptTag[];     // WHY it matters
  
  // Provenance (agent-agnostic)
  source_type: 'amp_thread' | 'beads_issue' | 'bbon_attempt' | 'gui_observation';
  source_id: string;          // Thread ID, issue ID, run ID
  turn_number?: number;       // Which turn/prompt in source
  
  // Artifacts
  artifacts: {
    type: 'file' | 'issue' | 'pr' | 'commit' | 'url';
    path: string;
    action?: 'read' | 'modified' | 'created' | 'deleted';
  }[];
  
  // Timestamps
  created_at: number;         // Epoch milliseconds
  token_cost: number;         // Estimated retrieval cost
}

export type ObservationType =
  | 'decision'    // Architectural/design choice with rationale
  | 'bugfix'      // Something broken, now fixed
  | 'feature'     // New capability added
  | 'refactor'    // Code restructured, behavior unchanged
  | 'discovery'   // Learning about existing system
  | 'change';     // Generic modification (docs, config)

export type ConceptTag =
  | 'how-it-works'      // Understanding mechanisms
  | 'why-it-exists'     // Purpose or rationale
  | 'what-changed'      // Modifications made
  | 'problem-solution'  // Issues and fixes
  | 'gotcha'            // Traps or edge cases
  | 'pattern'           // Reusable approach
  | 'trade-off';        // Pros/cons of decision
```

**Database Schema**:

```sql
-- src/store/migrations/00XX_observations.sql
CREATE TABLE observations (
  id TEXT PRIMARY KEY,
  
  -- Hierarchical content
  title TEXT NOT NULL,
  subtitle TEXT,
  facts TEXT,              -- JSON array
  narrative TEXT,
  
  -- Classification
  type TEXT NOT NULL CHECK(type IN ('decision','bugfix','feature','refactor','discovery','change')),
  concepts TEXT,           -- JSON array of ConceptTag
  
  -- Provenance
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  turn_number INTEGER,
  
  -- Artifacts
  artifacts TEXT,          -- JSON array
  
  -- Metadata
  token_cost INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- FTS5 for full-text search
CREATE VIRTUAL TABLE observations_fts USING fts5(
  title, subtitle, narrative, facts, concepts,
  content='observations',
  content_rowid='rowid'
);

-- Triggers to keep FTS5 in sync
CREATE TRIGGER observations_ai AFTER INSERT ON observations BEGIN
  INSERT INTO observations_fts(rowid, title, subtitle, narrative, facts, concepts)
  VALUES (new.rowid, new.title, new.subtitle, new.narrative, new.facts, new.concepts);
END;

CREATE TRIGGER observations_ad AFTER DELETE ON observations BEGIN
  DELETE FROM observations_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER observations_au AFTER UPDATE ON observations BEGIN
  UPDATE observations_fts 
  SET title = new.title, subtitle = new.subtitle, narrative = new.narrative,
      facts = new.facts, concepts = new.concepts
  WHERE rowid = new.rowid;
END;

-- Indexes for filtering
CREATE INDEX idx_observations_source ON observations(source_type, source_id);
CREATE INDEX idx_observations_type ON observations(type);
CREATE INDEX idx_observations_created ON observations(created_at DESC);
```

---

### 3. Semantic Compression via LLM

**Pattern**: Extract observations from tool outputs asynchronously

**Worker Pattern** (adapted from claude-mem's async processing):

```typescript
// src/services/observationExtractor.ts
export class ObservationExtractor {
  async extractFromAttempt(attemptId: string): Promise<void> {
    const steps = await bbonRepo.getAttemptSteps(attemptId);
    
    for (const step of steps) {
      // Skip low-value steps
      if (this.shouldSkip(step)) continue;
      
      // Build extraction prompt
      const prompt = this.buildPrompt(step);
      
      // Call local LLM (Ollama)
      const response = await this.llm.chat([
        { role: 'system', content: OBSERVATION_EXTRACTION_SYSTEM },
        { role: 'user', content: prompt }
      ]);
      
      // Parse XML response
      const parsed = this.parser.parseObservations(response);
      
      // Store observations
      for (const obs of parsed) {
        await observationRepo.create({
          ...obs,
          source_type: 'bbon_attempt',
          source_id: attemptId,
          turn_number: step.step_index
        });
        
        // Optional: Sync to vector DB
        if (config.embeddings.enabled) {
          await this.syncToVectorDB(obs);
        }
      }
    }
  }
  
  private shouldSkip(step: AttemptStep): boolean {
    // Skip empty outputs, simple file listings, package installs
    const output = JSON.parse(step.output_json);
    return output.stdout?.length < 50 || 
           step.kind === 'capture' && output.status === 'pass';
  }
}
```

**Extraction Prompt** (XML-based, similar to claude-mem):

```typescript
const OBSERVATION_EXTRACTION_SYSTEM = `You are analyzing code development activities to extract memorable observations.

For each significant event, create an <observation> with:
- <title>: ~10 words, semantic compression of the event
- <subtitle>: One sentence explanation (max 24 words)
- <facts>: Self-contained statements (each a <fact>)
- <narrative>: Full context in 1-3 paragraphs
- <type>: decision|bugfix|feature|refactor|discovery|change
- <concepts>: Zero or more: how-it-works|why-it-exists|what-changed|problem-solution|gotcha|pattern|trade-off
- <files_modified>: Files changed (each a <file>)

Skip observations for:
- Empty status checks
- Simple file listings
- Package installations with no errors
- Repetitive operations already documented

Output format:
<observations>
  <observation>
    <type>bugfix</type>
    <title>Fixed async race in retrieval cache</title>
    <subtitle>Cache reads weren't awaited, causing stale results</subtitle>
    <facts>
      <fact>retrievalCache.get() was missing await keyword</fact>
      <fact>Caused intermittent stale results under load</fact>
      <fact>Added await and test case for concurrent reads</fact>
    </facts>
    <narrative>
    During bBoN attempt #2, discovered that the retrieval cache...
    </narrative>
    <concepts>
      <concept>problem-solution</concept>
      <concept>gotcha</concept>
    </concepts>
    <files_modified>
      <file>src/adapters/retrieval/cache.ts</file>
      <file>tests/retrieval/cache.test.ts</file>
    </files_modified>
  </observation>
</observations>`;

const buildPrompt = (step: AttemptStep) => `
Analyze this development step and extract observations:

**Step**: ${step.kind}
**Input**: ${step.input_json}
**Output**: ${step.output_json}

Extract 0-3 observations (most steps have 0-1, complex steps may have 2-3).
`;
```

**XML Parser** (adapted from claude-mem):

```typescript
// src/services/observationParser.ts
export class ObservationParser {
  parseObservations(xmlText: string): ParsedObservation[] {
    const observations: ParsedObservation[] = [];
    const obsRegex = /<observation>([\s\S]*?)<\/observation>/g;
    
    let match;
    while ((match = obsRegex.exec(xmlText)) !== null) {
      const content = match[1];
      observations.push({
        type: this.extractField(content, 'type') as ObservationType,
        title: this.extractField(content, 'title'),
        subtitle: this.extractField(content, 'subtitle'),
        facts: this.extractArray(content, 'facts', 'fact'),
        narrative: this.extractField(content, 'narrative'),
        concepts: this.extractArray(content, 'concepts', 'concept') as ConceptTag[],
        artifacts: this.extractArray(content, 'files_modified', 'file').map(path => ({
          type: 'file',
          path,
          action: 'modified'
        }))
      });
    }
    
    return observations;
  }
  
  private extractField(content: string, field: string): string {
    const regex = new RegExp(`<${field}>([\\s\\S]*?)<\/${field}>`, 'i');
    const match = regex.exec(content);
    return match ? match[1].trim() : '';
  }
  
  private extractArray(content: string, container: string, element: string): string[] {
    const containerRegex = new RegExp(`<${container}>([\\s\\S]*?)<\/${container}>`, 'i');
    const containerMatch = containerRegex.exec(content);
    if (!containerMatch) return [];
    
    const elementRegex = new RegExp(`<${element}>([\\s\\S]*?)<\/${element}>`, 'gi');
    const items: string[] = [];
    let match;
    while ((match = elementRegex.exec(containerMatch[1])) !== null) {
      items.push(match[1].trim());
    }
    return items;
  }
}
```

---

### 4. Multi-Turn Thread Tracking

**Pattern**: Associate observations with specific turns in a conversation

**Schema**:

```typescript
// src/schemas/thread.ts
export interface Thread {
  id: string;
  source_type: 'amp_thread' | 'beads_issue';
  source_id: string;          // Amp thread ID or Beads issue ID
  project: string;
  turn_counter: number;       // How many turns in this thread
  status: 'active' | 'completed' | 'abandoned';
  started_at: number;
  completed_at?: number;
}
```

**Database**:

```sql
CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  project TEXT NOT NULL,
  turn_counter INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK(status IN ('active','completed','abandoned')),
  started_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE UNIQUE INDEX idx_threads_source ON threads(source_type, source_id);
```

**Integration with Amp Threads**:

```typescript
// src/adapters/threads/ampThreadAdapter.ts
export class AmpThreadAdapter {
  async syncThread(threadId: string): Promise<void> {
    const ampThread = await this.fetchThread(threadId);
    
    // Create or update thread
    const thread = await threadRepo.upsert({
      source_type: 'amp_thread',
      source_id: threadId,
      project: ampThread.workspace,
      turn_counter: ampThread.messages.length,
      status: ampThread.completed ? 'completed' : 'active'
    });
    
    // Extract observations from thread messages
    for (let i = 0; i < ampThread.messages.length; i++) {
      const message = ampThread.messages[i];
      if (message.role === 'assistant' && message.tool_uses) {
        await this.extractObservationsFromToolUses(
          thread.id,
          i + 1,  // turn_number
          message.tool_uses
        );
      }
    }
  }
  
  private async extractObservationsFromToolUses(
    threadId: string,
    turnNumber: number,
    toolUses: ToolUse[]
  ): Promise<void> {
    for (const tool of toolUses) {
      const prompt = this.buildObservationPrompt(tool);
      const response = await this.llm.chat([
        { role: 'system', content: OBSERVATION_EXTRACTION_SYSTEM },
        { role: 'user', content: prompt }
      ]);
      
      const observations = this.parser.parseObservations(response);
      
      for (const obs of observations) {
        await observationRepo.create({
          ...obs,
          source_type: 'amp_thread',
          source_id: threadId,
          turn_number: turnNumber
        });
      }
    }
  }
}
```

**CLI**:

```bash
# Sync Amp thread to observations
en thread sync T-abc123

# View observations from thread
en observations list --source-id T-abc123 --format index

# Get observations from specific turn
en observations list --source-id T-abc123 --turn 5 --format full
```

---

### 5. Citation URIs

**Pattern**: Stable, navigable identifiers

**Format**:

```
engram://observation/{id}
engram://thread/{source_id}/observation/{id}
engram://thread/{source_id}/turn/{turn_number}
engram://issue/{issue_id}
engram://attempt/{attempt_id}/step/{step_index}
```

**Implementation**:

```typescript
// src/utils/citations.ts
export function buildObservationURI(obs: Observation): string {
  return `engram://observation/${obs.id}`;
}

export function buildThreadURI(sourceId: string, turnNumber?: number): string {
  const base = `engram://thread/${sourceId}`;
  return turnNumber ? `${base}/turn/${turnNumber}` : base;
}

export function parseURI(uri: string): {
  type: string;
  id: string;
  turn?: number;
} | null {
  const match = uri.match(/^engram:\/\/(\w+)\/([^\/]+)(?:\/turn\/(\d+))?$/);
  if (!match) return null;
  
  return {
    type: match[1],
    id: match[2],
    turn: match[3] ? parseInt(match[3]) : undefined
  };
}
```

**Usage in Observations**:

```typescript
// Observations can reference other observations
interface Observation {
  // ...
  related_observations?: string[];  // URIs to related observations
}

// Example
{
  id: "obs-456",
  title: "Extended timeout fix to handle large npm installs",
  related_observations: [
    "engram://observation/obs-123"  // Original timeout fix
  ]
}
```

---

### 6. Hybrid Search (FTS5 + Optional Semantic)

**Pattern**: SQLite FTS5 first, optional vector DB fallback

```typescript
// src/services/observationSearch.ts
export class ObservationSearch {
  constructor(
    private fts5: FTS5Search,
    private vectorDB?: VectorDBAdapter
  ) {}
  
  async search(query: string, options: {
    format?: 'index' | 'full';
    limit?: number;
    filters?: {
      type?: ObservationType[];
      concepts?: ConceptTag[];
      source_type?: string;
      recency_days?: number;
    };
  }): Promise<SearchResult> {
    // Step 1: Try semantic search if available
    let candidateIds: string[];
    
    if (this.vectorDB?.available) {
      const semanticResults = await this.vectorDB.search(query, 100);
      
      // Filter by recency (90-day window)
      const cutoff = Date.now() - (options.filters?.recency_days || 90) * 86400000;
      candidateIds = semanticResults.filter(r => r.created_at > cutoff).map(r => r.id);
    } else {
      // Fallback to FTS5
      const fts5Results = await this.fts5.search(query, 100);
      candidateIds = fts5Results.map(r => r.id);
    }
    
    // Step 2: Apply metadata filters
    if (options.filters?.type || options.filters?.concepts || options.filters?.source_type) {
      candidateIds = await this.applyMetadataFilters(candidateIds, options.filters);
    }
    
    // Step 3: Hydrate from SQLite
    const results = await observationRepo.getByIds(
      candidateIds.slice(0, options.limit || 20),
      { format: options.format || 'index' }
    );
    
    return {
      index: results.map(r => this.toIndex(r)),
      details: options.format === 'full' ? results : undefined
    };
  }
  
  private toIndex(obs: Observation): ObservationIndex {
    return {
      id: obs.id,
      title: obs.title,
      type: obs.type,
      source: this.buildSourceLink(obs),
      token_cost: obs.token_cost,
      created_at: obs.created_at,
      icon: this.getTypeIcon(obs.type)
    };
  }
  
  private getTypeIcon(type: ObservationType): string {
    const icons = {
      decision: '🔴',
      bugfix: '🟢',
      feature: '🔵',
      refactor: '🟣',
      discovery: '🟤',
      change: '⚪'
    };
    return icons[type];
  }
}
```

---

### 7. Token Cost Estimation

**Pattern**: Show estimated retrieval cost in index

```typescript
// src/utils/tokenCounter.ts
export class TokenCounter {
  estimateObservationCost(obs: Observation, format: 'index' | 'full'): number {
    if (format === 'index') {
      // Just the title
      return this.countTokens(obs.title);
    }
    
    // Full format: subtitle + facts + narrative
    return (
      this.countTokens(obs.subtitle) +
      obs.facts.reduce((sum, fact) => sum + this.countTokens(fact), 0) +
      this.countTokens(obs.narrative)
    );
  }
  
  private countTokens(text: string): number {
    // Simple approximation: 1 token ≈ 4 characters
    // For production, use tiktoken library
    return Math.ceil(text.length / 4);
  }
}
```

**Store token cost in database**:

```typescript
// When creating observation
const tokenCost = tokenCounter.estimateObservationCost(obs, 'full');
await observationRepo.create({
  ...obs,
  token_cost: tokenCost
});
```

---

## Integration with Existing Engram Components

### Observations ↔ bBoN Attempts

```typescript
// After each bBoN attempt completes
async function processAttemptObservations(attemptId: string): Promise<void> {
  const extractor = new ObservationExtractor(llmProvider);
  await extractor.extractFromAttempt(attemptId);
}

// Link observations to attempt
CREATE TABLE attempt_observations (
  attempt_id TEXT NOT NULL,
  observation_id TEXT NOT NULL,
  PRIMARY KEY (attempt_id, observation_id),
  FOREIGN KEY (attempt_id) REFERENCES attempts(id),
  FOREIGN KEY (observation_id) REFERENCES observations(id)
);
```

### Observations ↔ Memory Tiers

```typescript
// Promote observations to working memory
async function promoteToWorkingMemory(observationId: string): Promise<void> {
  const obs = await observationRepo.getById(observationId);
  
  await memoryRepo.upsertWorkingMemory({
    type: 'summary',  // or 'invariant', 'decision' based on obs.concepts
    content: obs.narrative,
    provenance: {
      observation_id: observationId,
      source_type: obs.source_type,
      source_id: obs.source_id
    }
  });
}
```

### Observations → AGENTS.md Rendering

```typescript
// Render observations to AGENTS.md
async function renderObservationsToAgentsMd(): Promise<string> {
  const recent = await observationRepo.getRecent(50, {
    recency_days: 90
  });
  
  // Group by type
  const byType = groupBy(recent, 'type');
  
  let markdown = '## Recent Observations\n\n';
  
  for (const [type, observations] of Object.entries(byType)) {
    markdown += `### ${capitalize(type)}s\n\n`;
    
    for (const obs of observations) {
      markdown += `**${obs.title}** ([${obs.id}](${buildObservationURI(obs)}))\n`;
      markdown += `${obs.subtitle}\n\n`;
    }
  }
  
  return markdown;
}
```

---

## New Epics and Tasks

### E14: Observations & Progressive Disclosure

**Epic**: `engram-obs` - Hierarchical observations with progressive disclosure

**Tasks**:

1. **Migration: observations tables** (P0)
   - `observations` table with hierarchical fields
   - `observations_fts` FTS5 virtual table
   - `threads` table for multi-turn tracking
   - Indexes and triggers

2. **Schemas and repository** (P0)
   - `src/schemas/observation.ts` - TypeScript types
   - `src/store/repository/observationRepository.ts` - CRUD + search

3. **Observation extractor service** (P0)
   - `src/services/observationExtractor.ts` - LLM-based extraction
   - `src/services/observationParser.ts` - XML parser
   - Integration with Ollama provider

4. **CLI: observations commands** (P0)
   - `en observations list --format index|full`
   - `en observations get <id>`
   - `en observations search <query>`
   - `en observations extract --attempt <id>` (manual extraction)

5. **Amp thread sync** (P1)
   - `src/adapters/threads/ampThreadAdapter.ts`
   - `en thread sync <thread_id>` - Extract observations from Amp thread

6. **Progressive disclosure context packer** (P1)
   - `src/adapters/observations/contextPacker.ts`
   - Generate index markdown for session start
   - Token budgeting for Layer 1 + Layer 2

7. **Citation URIs** (P1)
   - `src/utils/citations.ts` - URI builders and parsers
   - Add `related_observations` field

8. **Tests** (P1)
   - Unit tests for extractor, parser, search
   - E2E test: extract observations from bBoN attempt

---

## Configuration

```typescript
// src/config.ts
export const DEFAULT_CONFIG = {
  observations: {
    enabled: true,
    autoExtract: true,              // Extract after each bBoN attempt
    indexLimit: 50,                 // How many to show in index
    recencyDays: 90,                // Filter to last N days
    tokenBudget: {
      index: 800,                   // Max tokens for Layer 1
      details: 3000,                // Max tokens for Layer 2
    }
  }
};
```

---

## Summary

**Key Patterns Adopted from claude-mem**:

✅ **Progressive Disclosure** - 3-layer retrieval (index → details → source)  
✅ **Hierarchical Observations** - Title/subtitle/facts/narrative structure  
✅ **Semantic Compression** - Good titles are 10:1 compression  
✅ **Type + Concept Classification** - Dual dimensions for flexible search  
✅ **Multi-Turn Tracking** - Associate observations with conversation turns  
✅ **FTS5 + Optional Semantic** - SQLite first, vector DB optional  
✅ **Citation URIs** - Stable identifiers for cross-referencing  
✅ **Token Cost Estimation** - Show retrieval costs in index  
✅ **Agent-Agnostic Provenance** - Works with Amp, Beads, any source  

**New Capabilities for Engram**:

1. **Amp Thread Memory** - Extract observations from Amp threads
2. **Beads Issue Context** - Link observations to Beads issues
3. **Cost-Conscious Retrieval** - Show token costs, fetch on-demand
4. **Smart Context Injection** - Progressive disclosure at session start
5. **Cross-Reference Network** - Citation URIs enable knowledge graphs

**Estimated Effort**: 3-4 days

**Priority**: P0 (critical path) - Progressive disclosure dramatically improves context efficiency
