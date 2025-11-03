-- Initial schema for Amp Framework
-- Version: 0001
-- Description: Core tables for knowledge items, insights, traces, and metadata

-- Knowledge items (curated facts, patterns, procedures, decisions)
CREATE TABLE IF NOT EXISTS knowledge_items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('fact', 'pattern', 'procedure', 'decision')),
  text TEXT NOT NULL,
  scope TEXT NOT NULL,
  module TEXT,
  meta_tags TEXT NOT NULL DEFAULT '[]', -- JSON array
  confidence REAL NOT NULL DEFAULT 1.0 CHECK(confidence >= 0 AND confidence <= 1),
  helpful INTEGER NOT NULL DEFAULT 0 CHECK(helpful >= 0),
  harmful INTEGER NOT NULL DEFAULT 0 CHECK(harmful >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_type ON knowledge_items(type);
CREATE INDEX IF NOT EXISTS idx_knowledge_scope ON knowledge_items(scope);
CREATE INDEX IF NOT EXISTS idx_knowledge_module ON knowledge_items(module);
CREATE INDEX IF NOT EXISTS idx_knowledge_confidence ON knowledge_items(confidence);

-- Insights (extracted patterns awaiting curation)
CREATE TABLE IF NOT EXISTS insights (
  id TEXT PRIMARY KEY,
  pattern TEXT NOT NULL,
  description TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  frequency INTEGER NOT NULL DEFAULT 1 CHECK(frequency >= 1),
  related_beads TEXT NOT NULL DEFAULT '[]', -- JSON array
  meta_tags TEXT NOT NULL DEFAULT '[]', -- JSON array
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_insights_confidence ON insights(confidence);
CREATE INDEX IF NOT EXISTS idx_insights_frequency ON insights(frequency);

-- Execution traces (build/test/lint results)
CREATE TABLE IF NOT EXISTS traces (
  id TEXT PRIMARY KEY,
  bead_id TEXT NOT NULL,
  task_description TEXT,
  thread_id TEXT,
  executions TEXT NOT NULL, -- JSON array of execution results
  outcome TEXT NOT NULL CHECK(outcome IN ('success', 'failure', 'partial')),
  discovered_issues TEXT NOT NULL DEFAULT '[]', -- JSON array
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_traces_bead_id ON traces(bead_id);
CREATE INDEX IF NOT EXISTS idx_traces_outcome ON traces(outcome);
CREATE INDEX IF NOT EXISTS idx_traces_created_at ON traces(created_at);

-- Learning runs (track learning loop executions)
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  run_type TEXT NOT NULL CHECK(run_type IN ('reflect', 'curate', 'learn', 'ci')),
  bead_ids TEXT NOT NULL DEFAULT '[]', -- JSON array
  insights_generated INTEGER NOT NULL DEFAULT 0,
  knowledge_added INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL CHECK(status IN ('running', 'success', 'failure')),
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_type ON runs(run_type);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at);

-- Temp branches (track ephemeral work branches)
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  branch_name TEXT NOT NULL UNIQUE,
  bead_id TEXT,
  plan TEXT NOT NULL,
  marked_for_deletion INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  closed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_branches_bead_id ON branches(bead_id);
CREATE INDEX IF NOT EXISTS idx_branches_marked ON branches(marked_for_deletion);

-- Thread tracking (Amp thread to bead associations)
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  bead_id TEXT,
  url TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_threads_thread_id ON threads(thread_id);
CREATE INDEX IF NOT EXISTS idx_threads_bead_id ON threads(bead_id);

-- Metrics (performance and quality tracking)
CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  metric_type TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value REAL NOT NULL,
  bead_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_metrics_type ON metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_metrics_bead_id ON metrics(bead_id);

-- Retrieval cache (diff-based analysis caching for CI)
CREATE TABLE IF NOT EXISTS retrieval_cache (
  id TEXT PRIMARY KEY,
  file_hash TEXT NOT NULL,
  tool TEXT NOT NULL,
  result TEXT NOT NULL, -- JSON
  created_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_file_tool ON retrieval_cache(file_hash, tool);
CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON retrieval_cache(expires_at);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

INSERT INTO schema_version (version, applied_at) VALUES (1, datetime('now'));
