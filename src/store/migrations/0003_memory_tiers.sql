-- Migration: Memory Tiers (Short-term, Working, Archival)
-- Epic: E11 (engram-ku7)
-- Implements three-tier memory hierarchy inspired by Letta/MemGPT

-- memory_short_term: Per-run scratchpad (cleared at run end)
CREATE TABLE IF NOT EXISTS memory_short_term (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(run_id, key),
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memory_short_term_run_id ON memory_short_term(run_id);

-- working_memory: Project-level persistent knowledge (summaries, invariants, decisions)
CREATE TABLE IF NOT EXISTS working_memory (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT '.',
  type TEXT NOT NULL CHECK(type IN ('summary', 'invariant', 'decision')),
  content_text TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_working_memory_project_id ON working_memory(project_id);
CREATE INDEX IF NOT EXISTS idx_working_memory_type ON working_memory(type);
CREATE INDEX IF NOT EXISTS idx_working_memory_updated_at ON working_memory(updated_at);

-- memory_events: Provenance tracking for memory operations
CREATE TABLE IF NOT EXISTS memory_events (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  subject_kind TEXT NOT NULL,
  event TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_events_subject ON memory_events(subject_id, subject_kind);
CREATE INDEX IF NOT EXISTS idx_memory_events_created_at ON memory_events(created_at);
