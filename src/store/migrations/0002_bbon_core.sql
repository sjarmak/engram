-- bBoN (Best-of-N) orchestration schema
-- Version: 0002
-- Description: Tables for multi-trajectory rollouts, comparative judging, and narrative diffs

-- Task specifications (linked to Beads issues)
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  bead_id TEXT,
  spec_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_bead_id ON tasks(bead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);

-- bBoN runs (N parallel attempts per task)
CREATE TABLE IF NOT EXISTS bbon_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  n INTEGER NOT NULL CHECK(n >= 1),
  seed INTEGER NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_bbon_runs_task_id ON bbon_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_bbon_runs_created_at ON bbon_runs(created_at);

-- Individual attempts within a run
CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed')),
  result_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (run_id) REFERENCES bbon_runs(id),
  UNIQUE(run_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_attempts_run_id ON attempts(run_id);
CREATE INDEX IF NOT EXISTS idx_attempts_status ON attempts(status);

-- Execution steps within each attempt
CREATE TABLE IF NOT EXISTS attempt_steps (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  step_index INTEGER NOT NULL CHECK(step_index >= 0),
  kind TEXT NOT NULL,
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT NOT NULL DEFAULT '{}',
  observation_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (attempt_id) REFERENCES attempts(id)
);

CREATE INDEX IF NOT EXISTS idx_attempt_steps_attempt_id ON attempt_steps(attempt_id);
CREATE INDEX IF NOT EXISTS idx_attempt_steps_kind ON attempt_steps(kind);

-- Pairwise comparisons for judging
CREATE TABLE IF NOT EXISTS judge_pairs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  left_attempt_id TEXT NOT NULL,
  right_attempt_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES bbon_runs(id),
  FOREIGN KEY (left_attempt_id) REFERENCES attempts(id),
  FOREIGN KEY (right_attempt_id) REFERENCES attempts(id),
  UNIQUE(run_id, left_attempt_id, right_attempt_id)
);

CREATE INDEX IF NOT EXISTS idx_judge_pairs_run_id ON judge_pairs(run_id);

-- Judge outcomes with narrative diffs
CREATE TABLE IF NOT EXISTS judge_outcomes (
  id TEXT PRIMARY KEY,
  pair_id TEXT NOT NULL,
  winner_attempt_id TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  rationale_text TEXT NOT NULL,
  narrative_diff_json TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (pair_id) REFERENCES judge_pairs(id),
  FOREIGN KEY (winner_attempt_id) REFERENCES attempts(id)
);

CREATE INDEX IF NOT EXISTS idx_judge_outcomes_pair_id ON judge_outcomes(pair_id);
CREATE INDEX IF NOT EXISTS idx_judge_outcomes_winner ON judge_outcomes(winner_attempt_id);
CREATE INDEX IF NOT EXISTS idx_judge_outcomes_confidence ON judge_outcomes(confidence);

-- Update schema version
INSERT INTO schema_version (version, applied_at) VALUES (2, datetime('now'));
