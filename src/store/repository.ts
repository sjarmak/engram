import Database from 'better-sqlite3';
import {
  KnowledgeItem,
  Insight,
  Trace,
  Thread,
  Run,
  KnowledgeItemSchema,
  InsightSchema,
  TraceSchema,
  ThreadSchema,
  RunSchema,
  KnowledgeType,
  RunType,
  RunStatus,
} from '../schemas/knowledge.js';
import {
  Task,
  BbonRun,
  Attempt,
  AttemptStep,
  JudgePair,
  JudgeOutcome,
  TaskSchema,
  BbonRunSchema,
  AttemptSchema,
  AttemptStepSchema,
  JudgePairSchema,
  JudgeOutcomeSchema,
  AttemptStatus,
} from '../schemas/bbon.js';
import {
  ShortTermMemory,
  WorkingMemory,
  MemoryEvent,
  ShortTermMemorySchema,
  WorkingMemorySchema,
  MemoryEventSchema,
  WorkingMemoryType,
} from '../schemas/memory.js';
import { deterministicId } from '../utils/id.js';

/**
 * Repository interface for knowledge storage
 * Provides CRUD operations for knowledge items, insights, and traces
 */
export class Repository {
  constructor(private db: Database.Database) {}

  runInTransaction<T>(fn: () => T): T {
    const tx = this.db.transaction(fn);
    return tx();
  }

  // ==================== Knowledge Items ====================

  addKnowledgeItem(item: Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt'>): KnowledgeItem {
    const id = deterministicId(item);
    const now = new Date().toISOString();

    const fullItem: KnowledgeItem = {
      ...item,
      id,
      createdAt: now,
      updatedAt: now,
    };

    KnowledgeItemSchema.parse(fullItem);

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO knowledge_items (id, type, text, scope, module, meta_tags, confidence, helpful, harmful, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      fullItem.id,
      fullItem.type,
      fullItem.text,
      fullItem.scope,
      fullItem.module ?? null,
      JSON.stringify(fullItem.metaTags),
      fullItem.confidence,
      fullItem.helpful,
      fullItem.harmful,
      fullItem.createdAt,
      fullItem.updatedAt
    );

    if (info.changes === 0) {
      return this.getKnowledgeItem(id)!;
    }

    return fullItem;
  }

  getKnowledgeItem(id: string): KnowledgeItem | null {
    const stmt = this.db.prepare('SELECT * FROM knowledge_items WHERE id = ?');
    const row = stmt.get(id) as unknown;

    if (!row) return null;

    return this.mapKnowledgeItem(row);
  }

  listKnowledgeItems(filters?: {
    type?: KnowledgeType;
    scope?: string;
    module?: string;
    minConfidence?: number;
  }): KnowledgeItem[] {
    let sql = 'SELECT * FROM knowledge_items WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.type) {
      sql += ' AND type = ?';
      params.push(filters.type);
    }
    if (filters?.scope) {
      sql += ' AND scope = ?';
      params.push(filters.scope);
    }
    if (filters?.module) {
      sql += ' AND module = ?';
      params.push(filters.module);
    }
    if (filters?.minConfidence !== undefined) {
      sql += ' AND confidence >= ?';
      params.push(filters.minConfidence);
    }

    sql += ' ORDER BY updated_at DESC';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as unknown[];

    return rows.map(row => this.mapKnowledgeItem(row));
  }

  updateKnowledgeItemFeedback(id: string, helpfulDelta: number, harmfulDelta: number): void {
    const stmt = this.db.prepare(`
      UPDATE knowledge_items
      SET helpful = helpful + ?, harmful = harmful + ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(helpfulDelta, harmfulDelta, new Date().toISOString(), id);
  }

  deleteKnowledgeItem(id: string): void {
    const stmt = this.db.prepare('DELETE FROM knowledge_items WHERE id = ?');
    stmt.run(id);
  }

  // ==================== Insights ====================

  addInsight(insight: Omit<Insight, 'id' | 'createdAt'>): Insight {
    const id = deterministicId(insight);
    const now = new Date().toISOString();

    const fullInsight: Insight = {
      ...insight,
      id,
      createdAt: now,
    };

    InsightSchema.parse(fullInsight);

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO insights (id, pattern, description, confidence, frequency, related_beads, meta_tags, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      fullInsight.id,
      fullInsight.pattern,
      fullInsight.description,
      fullInsight.confidence,
      fullInsight.frequency,
      JSON.stringify(fullInsight.relatedBeads),
      JSON.stringify(fullInsight.metaTags),
      fullInsight.createdAt
    );

    if (info.changes === 0) {
      return this.getInsight(id)!;
    }

    return fullInsight;
  }

  getInsight(id: string): Insight | null {
    const stmt = this.db.prepare('SELECT * FROM insights WHERE id = ?');
    const row = stmt.get(id) as unknown;

    if (!row) return null;

    return this.mapInsight(row);
  }

  listInsights(filters?: { minConfidence?: number; minFrequency?: number }): Insight[] {
    let sql = 'SELECT * FROM insights WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.minConfidence !== undefined) {
      sql += ' AND confidence >= ?';
      params.push(filters.minConfidence);
    }
    if (filters?.minFrequency !== undefined) {
      sql += ' AND frequency >= ?';
      params.push(filters.minFrequency);
    }

    sql += ' ORDER BY confidence DESC, frequency DESC';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as unknown[];

    return rows.map(row => this.mapInsight(row));
  }

  deleteInsight(id: string): void {
    const stmt = this.db.prepare('DELETE FROM insights WHERE id = ?');
    stmt.run(id);
  }

  // ==================== Traces ====================

  addTrace(trace: Omit<Trace, 'id' | 'createdAt'>): Trace {
    const id = deterministicId(trace);
    const now = new Date().toISOString();

    const fullTrace: Trace = {
      ...trace,
      id,
      createdAt: now,
    };

    TraceSchema.parse(fullTrace);

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO traces (id, bead_id, task_description, thread_id, executions, outcome, discovered_issues, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      fullTrace.id,
      fullTrace.beadId,
      fullTrace.taskDescription ?? null,
      fullTrace.threadId ?? null,
      JSON.stringify(fullTrace.executions),
      fullTrace.outcome,
      JSON.stringify(fullTrace.discoveredIssues),
      fullTrace.createdAt
    );

    if (info.changes === 0) {
      return this.getTrace(id)!;
    }

    return fullTrace;
  }

  getTrace(id: string): Trace | null {
    const stmt = this.db.prepare('SELECT * FROM traces WHERE id = ?');
    const row = stmt.get(id) as unknown;

    if (!row) return null;

    return this.mapTrace(row);
  }

  listTracesByBead(beadId: string): Trace[] {
    const stmt = this.db.prepare('SELECT * FROM traces WHERE bead_id = ? ORDER BY created_at DESC');
    const rows = stmt.all(beadId) as unknown[];

    return rows.map(row => this.mapTrace(row));
  }

  listTracesByOutcome(outcome: 'success' | 'failure' | 'partial'): Trace[] {
    const stmt = this.db.prepare('SELECT * FROM traces WHERE outcome = ? ORDER BY created_at DESC');
    const rows = stmt.all(outcome) as unknown[];

    return rows.map(row => this.mapTrace(row));
  }

  private mapKnowledgeItem(row: unknown): KnowledgeItem {
    const r = row as Record<string, unknown>;
    const obj = {
      id: r.id as string,
      type: r.type as KnowledgeItem['type'],
      text: r.text as string,
      scope: r.scope as string,
      module: (r.module as string | null) ?? undefined,
      metaTags: r.meta_tags ? JSON.parse(r.meta_tags as string) : [],
      confidence: r.confidence as number,
      helpful: r.helpful as number,
      harmful: r.harmful as number,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
    return KnowledgeItemSchema.parse(obj);
  }

  private mapInsight(row: unknown): Insight {
    const r = row as Record<string, unknown>;
    const obj = {
      id: r.id as string,
      pattern: r.pattern as string,
      description: r.description as string,
      confidence: r.confidence as number,
      frequency: r.frequency as number,
      relatedBeads: r.related_beads ? JSON.parse(r.related_beads as string) : [],
      metaTags: r.meta_tags ? JSON.parse(r.meta_tags as string) : [],
      createdAt: r.created_at as string,
    };
    return InsightSchema.parse(obj);
  }

  private mapTrace(row: unknown): Trace {
    const r = row as Record<string, unknown>;
    const obj = {
      id: r.id as string,
      beadId: r.bead_id as string,
      taskDescription: (r.task_description as string | null) ?? undefined,
      threadId: (r.thread_id as string | null) ?? undefined,
      executions: r.executions ? JSON.parse(r.executions as string) : [],
      outcome: r.outcome as Trace['outcome'],
      discoveredIssues: r.discovered_issues ? JSON.parse(r.discovered_issues as string) : [],
      createdAt: r.created_at as string,
    };
    return TraceSchema.parse(obj);
  }

  // ==================== Threads ====================

  addThread(thread: Omit<Thread, 'id' | 'createdAt'>): Thread {
    const id = deterministicId(thread);
    const now = new Date().toISOString();

    const fullThread: Thread = {
      ...thread,
      id,
      createdAt: now,
    };

    ThreadSchema.parse(fullThread);

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO threads (id, thread_id, bead_id, url, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      fullThread.id,
      fullThread.threadId,
      fullThread.beadId ?? null,
      fullThread.url ?? null,
      fullThread.createdAt
    );

    if (info.changes === 0) {
      return this.getThread(id)!;
    }

    return fullThread;
  }

  getThread(id: string): Thread | null {
    const stmt = this.db.prepare('SELECT * FROM threads WHERE id = ?');
    const row = stmt.get(id) as unknown;

    if (!row) return null;

    return this.mapThread(row);
  }

  getThreadByThreadId(threadId: string): Thread | null {
    const stmt = this.db.prepare('SELECT * FROM threads WHERE thread_id = ?');
    const row = stmt.get(threadId) as unknown;

    if (!row) return null;

    return this.mapThread(row);
  }

  listThreadsByBead(beadId: string): Thread[] {
    const stmt = this.db.prepare('SELECT * FROM threads WHERE bead_id = ? ORDER BY created_at DESC');
    const rows = stmt.all(beadId) as unknown[];

    return rows.map(row => this.mapThread(row));
  }

  updateThreadBead(threadId: string, beadId: string): void {
    const stmt = this.db.prepare('UPDATE threads SET bead_id = ? WHERE thread_id = ?');
    stmt.run(beadId, threadId);
  }

  private mapThread(row: unknown): Thread {
    const r = row as Record<string, unknown>;
    const obj = {
      id: r.id as string,
      threadId: r.thread_id as string,
      beadId: (r.bead_id as string | null) ?? undefined,
      url: (r.url as string | null) ?? undefined,
      createdAt: r.created_at as string,
    };
    return ThreadSchema.parse(obj);
  }

  // ==================== Runs ====================

  addRun(run: Omit<Run, 'id'>): Run {
    const id = deterministicId(run);

    const fullRun: Run = {
      ...run,
      id,
    };

    RunSchema.parse(fullRun);

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO runs (id, run_type, bead_ids, insights_generated, knowledge_added, started_at, completed_at, status, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      fullRun.id,
      fullRun.runType,
      JSON.stringify(fullRun.beadIds),
      fullRun.insightsGenerated,
      fullRun.knowledgeAdded,
      fullRun.startedAt,
      fullRun.completedAt ?? null,
      fullRun.status,
      fullRun.error ?? null
    );

    if (info.changes === 0) {
      return this.getRun(id)!;
    }

    return fullRun;
  }

  getRun(id: string): Run | null {
    const stmt = this.db.prepare('SELECT * FROM runs WHERE id = ?');
    const row = stmt.get(id) as unknown;

    if (!row) return null;

    return this.mapRun(row);
  }

  listRuns(filters?: { runType?: RunType; status?: RunStatus }): Run[] {
    let sql = 'SELECT * FROM runs WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.runType) {
      sql += ' AND run_type = ?';
      params.push(filters.runType);
    }
    if (filters?.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }

    sql += ' ORDER BY started_at DESC';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as unknown[];

    return rows.map(row => this.mapRun(row));
  }

  updateRunStatus(
    id: string,
    status: RunStatus,
    completedAt?: string,
    error?: string,
    metrics?: { insightsGenerated?: number; knowledgeAdded?: number }
  ): void {
    const updates: string[] = ['status = ?'];
    const params: unknown[] = [status];

    if (completedAt) {
      updates.push('completed_at = ?');
      params.push(completedAt);
    }

    if (error !== undefined) {
      updates.push('error = ?');
      params.push(error);
    }

    if (metrics?.insightsGenerated !== undefined) {
      updates.push('insights_generated = ?');
      params.push(metrics.insightsGenerated);
    }

    if (metrics?.knowledgeAdded !== undefined) {
      updates.push('knowledge_added = ?');
      params.push(metrics.knowledgeAdded);
    }

    params.push(id);

    const stmt = this.db.prepare(`UPDATE runs SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...params);
  }

  private mapRun(row: unknown): Run {
    const r = row as Record<string, unknown>;
    const obj = {
      id: r.id as string,
      runType: r.run_type as RunType,
      beadIds: r.bead_ids ? JSON.parse(r.bead_ids as string) : [],
      insightsGenerated: r.insights_generated as number,
      knowledgeAdded: r.knowledge_added as number,
      startedAt: r.started_at as string,
      completedAt: (r.completed_at as string | null) ?? undefined,
      status: r.status as RunStatus,
      error: (r.error as string | null) ?? undefined,
    };
    return RunSchema.parse(obj);
  }

  // ==================== Tasks ====================

  addTask(task: Omit<Task, 'id' | 'createdAt'>): Task {
    const id = deterministicId(task);
    const now = new Date().toISOString();

    const fullTask: Task = {
      ...task,
      id,
      createdAt: now,
    };

    TaskSchema.parse(fullTask);

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO tasks (id, bead_id, spec_json, created_at)
      VALUES (?, ?, ?, ?)
    `);

    const info = stmt.run(
      fullTask.id,
      fullTask.beadId ?? null,
      JSON.stringify(fullTask.spec),
      fullTask.createdAt
    );

    if (info.changes === 0) {
      return this.getTask(id)!;
    }

    return fullTask;
  }

  getTask(id: string): Task | null {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    const row = stmt.get(id) as unknown;

    if (!row) return null;

    return this.mapTask(row);
  }

  listTasks(beadId?: string): Task[] {
    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const params: unknown[] = [];

    if (beadId) {
      sql += ' AND bead_id = ?';
      params.push(beadId);
    }

    sql += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as unknown[];

    return rows.map(row => this.mapTask(row));
  }

  private mapTask(row: unknown): Task {
    const r = row as Record<string, unknown>;
    const obj = {
      id: r.id as string,
      beadId: (r.bead_id as string | null) ?? undefined,
      spec: r.spec_json ? JSON.parse(r.spec_json as string) : {},
      createdAt: r.created_at as string,
    };
    return TaskSchema.parse(obj);
  }

  // ==================== bBoN Runs ====================

  addBbonRun(run: Omit<BbonRun, 'id' | 'createdAt'>): BbonRun {
    const id = deterministicId(run);
    const now = new Date().toISOString();

    const fullRun: BbonRun = {
      ...run,
      id,
      createdAt: now,
    };

    BbonRunSchema.parse(fullRun);

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO bbon_runs (id, task_id, n, seed, config_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      fullRun.id,
      fullRun.taskId,
      fullRun.n,
      fullRun.seed,
      JSON.stringify(fullRun.config),
      fullRun.createdAt
    );

    if (info.changes === 0) {
      return this.getBbonRun(id)!;
    }

    return fullRun;
  }

  getBbonRun(id: string): BbonRun | null {
    const stmt = this.db.prepare('SELECT * FROM bbon_runs WHERE id = ?');
    const row = stmt.get(id) as unknown;

    if (!row) return null;

    return this.mapBbonRun(row);
  }

  listBbonRuns(taskId?: string): BbonRun[] {
    let sql = 'SELECT * FROM bbon_runs WHERE 1=1';
    const params: unknown[] = [];

    if (taskId) {
      sql += ' AND task_id = ?';
      params.push(taskId);
    }

    sql += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as unknown[];

    return rows.map(row => this.mapBbonRun(row));
  }

  private mapBbonRun(row: unknown): BbonRun {
    const r = row as Record<string, unknown>;
    const obj = {
      id: r.id as string,
      taskId: r.task_id as string,
      n: r.n as number,
      seed: r.seed as number,
      config: r.config_json ? JSON.parse(r.config_json as string) : {},
      createdAt: r.created_at as string,
    };
    return BbonRunSchema.parse(obj);
  }

  // ==================== Attempts ====================

  addAttempt(attempt: Omit<Attempt, 'id' | 'createdAt'>): Attempt {
    const id = deterministicId(attempt);
    const now = new Date().toISOString();

    const fullAttempt: Attempt = {
      ...attempt,
      id,
      createdAt: now,
    };

    AttemptSchema.parse(fullAttempt);

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO attempts (id, run_id, ordinal, status, result_json, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      fullAttempt.id,
      fullAttempt.runId,
      fullAttempt.ordinal,
      fullAttempt.status,
      JSON.stringify(fullAttempt.result),
      fullAttempt.createdAt,
      fullAttempt.completedAt ?? null
    );

    if (info.changes === 0) {
      return this.getAttempt(id)!;
    }

    return fullAttempt;
  }

  getAttempt(id: string): Attempt | null {
    const stmt = this.db.prepare('SELECT * FROM attempts WHERE id = ?');
    const row = stmt.get(id) as unknown;

    if (!row) return null;

    return this.mapAttempt(row);
  }

  listAttempts(runId: string): Attempt[] {
    const stmt = this.db.prepare(
      'SELECT * FROM attempts WHERE run_id = ? ORDER BY ordinal ASC'
    );
    const rows = stmt.all(runId) as unknown[];

    return rows.map(row => this.mapAttempt(row));
  }

  updateAttemptStatus(
    id: string,
    status: AttemptStatus,
    completedAt?: string,
    result?: Record<string, unknown>
  ): void {
    const updates: string[] = ['status = ?'];
    const params: unknown[] = [status];

    if (completedAt) {
      updates.push('completed_at = ?');
      params.push(completedAt);
    }

    if (result !== undefined) {
      updates.push('result_json = ?');
      params.push(JSON.stringify(result));
    }

    params.push(id);

    const stmt = this.db.prepare(`UPDATE attempts SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...params);
  }

  updateAttempt(
    id: string,
    updates: {
      status?: AttemptStatus;
      result?: Record<string, unknown>;
      completedAt?: string;
    }
  ): void {
    const fields: string[] = [];
    const params: unknown[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      params.push(updates.status);
    }
    if (updates.result !== undefined) {
      fields.push('result_json = ?');
      params.push(JSON.stringify(updates.result));
    }
    if (updates.completedAt !== undefined) {
      fields.push('completed_at = ?');
      params.push(updates.completedAt);
    }

    if (fields.length === 0) return;

    params.push(id);

    const stmt = this.db.prepare(`UPDATE attempts SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...params);
  }

  private mapAttempt(row: unknown): Attempt {
    const r = row as Record<string, unknown>;
    const obj = {
      id: r.id as string,
      runId: r.run_id as string,
      ordinal: r.ordinal as number,
      status: r.status as AttemptStatus,
      result: r.result_json ? JSON.parse(r.result_json as string) : {},
      createdAt: r.created_at as string,
      completedAt: (r.completed_at as string | null) ?? undefined,
    };
    return AttemptSchema.parse(obj);
  }

  // ==================== Attempt Steps ====================

  addAttemptStep(step: Omit<AttemptStep, 'id' | 'createdAt'>): AttemptStep {
    const id = deterministicId(step);
    const now = new Date().toISOString();

    const fullStep: AttemptStep = {
      ...step,
      id,
      createdAt: now,
    };

    AttemptStepSchema.parse(fullStep);

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO attempt_steps (id, attempt_id, step_index, kind, input_json, output_json, observation_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      fullStep.id,
      fullStep.attemptId,
      fullStep.stepIndex,
      fullStep.kind,
      JSON.stringify(fullStep.input),
      JSON.stringify(fullStep.output),
      JSON.stringify(fullStep.observation),
      fullStep.createdAt
    );

    if (info.changes === 0) {
      return this.getAttemptStep(id)!;
    }

    return fullStep;
  }

  getAttemptStep(id: string): AttemptStep | null {
    const stmt = this.db.prepare('SELECT * FROM attempt_steps WHERE id = ?');
    const row = stmt.get(id) as unknown;

    if (!row) return null;

    return this.mapAttemptStep(row);
  }

  listAttemptSteps(attemptId: string): AttemptStep[] {
    const stmt = this.db.prepare(
      'SELECT * FROM attempt_steps WHERE attempt_id = ? ORDER BY step_index ASC'
    );
    const rows = stmt.all(attemptId) as unknown[];

    return rows.map(row => this.mapAttemptStep(row));
  }

  private mapAttemptStep(row: unknown): AttemptStep {
    const r = row as Record<string, unknown>;
    const obj = {
      id: r.id as string,
      attemptId: r.attempt_id as string,
      stepIndex: r.step_index as number,
      kind: r.kind as string,
      input: r.input_json ? JSON.parse(r.input_json as string) : {},
      output: r.output_json ? JSON.parse(r.output_json as string) : {},
      observation: r.observation_json ? JSON.parse(r.observation_json as string) : {},
      createdAt: r.created_at as string,
    };
    return AttemptStepSchema.parse(obj);
  }

  // ==================== Judge Pairs ====================

  addJudgePair(pair: Omit<JudgePair, 'id' | 'createdAt'>): JudgePair {
    const id = deterministicId(pair);
    const now = new Date().toISOString();

    const fullPair: JudgePair = {
      ...pair,
      id,
      createdAt: now,
    };

    JudgePairSchema.parse(fullPair);

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO judge_pairs (id, run_id, left_attempt_id, right_attempt_id, prompt_version, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      fullPair.id,
      fullPair.runId,
      fullPair.leftAttemptId,
      fullPair.rightAttemptId,
      fullPair.promptVersion,
      fullPair.createdAt
    );

    if (info.changes === 0) {
      return this.getJudgePair(id)!;
    }

    return fullPair;
  }

  getJudgePair(id: string): JudgePair | null {
    const stmt = this.db.prepare('SELECT * FROM judge_pairs WHERE id = ?');
    const row = stmt.get(id) as unknown;

    if (!row) return null;

    return this.mapJudgePair(row);
  }

  listJudgePairs(runId: string): JudgePair[] {
    const stmt = this.db.prepare('SELECT * FROM judge_pairs WHERE run_id = ? ORDER BY created_at ASC');
    const rows = stmt.all(runId) as unknown[];

    return rows.map(row => this.mapJudgePair(row));
  }

  private mapJudgePair(row: unknown): JudgePair {
    const r = row as Record<string, unknown>;
    const obj = {
      id: r.id as string,
      runId: r.run_id as string,
      leftAttemptId: r.left_attempt_id as string,
      rightAttemptId: r.right_attempt_id as string,
      promptVersion: r.prompt_version as string,
      createdAt: r.created_at as string,
    };
    return JudgePairSchema.parse(obj);
  }

  // ==================== Judge Outcomes ====================

  addJudgeOutcome(outcome: Omit<JudgeOutcome, 'id' | 'createdAt'>): JudgeOutcome {
    const id = deterministicId(outcome);
    const now = new Date().toISOString();

    const fullOutcome: JudgeOutcome = {
      ...outcome,
      id,
      createdAt: now,
    };

    JudgeOutcomeSchema.parse(fullOutcome);

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO judge_outcomes (id, pair_id, winner_attempt_id, confidence, rationale_text, narrative_diff_json, model, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      fullOutcome.id,
      fullOutcome.pairId,
      fullOutcome.winnerAttemptId,
      fullOutcome.confidence,
      fullOutcome.rationaleText,
      JSON.stringify(fullOutcome.narrativeDiff),
      fullOutcome.model,
      fullOutcome.createdAt
    );

    if (info.changes === 0) {
      return this.getJudgeOutcome(id)!;
    }

    return fullOutcome;
  }

  getJudgeOutcome(id: string): JudgeOutcome | null {
    const stmt = this.db.prepare('SELECT * FROM judge_outcomes WHERE id = ?');
    const row = stmt.get(id) as unknown;

    if (!row) return null;

    return this.mapJudgeOutcome(row);
  }

  getJudgeOutcomeByPairId(pairId: string): JudgeOutcome | null {
    const stmt = this.db.prepare('SELECT * FROM judge_outcomes WHERE pair_id = ?');
    const row = stmt.get(pairId) as unknown;

    if (!row) return null;

    return this.mapJudgeOutcome(row);
  }

  listJudgeOutcomes(filters?: { runId?: string; minConfidence?: number }): JudgeOutcome[] {
    let sql = `
      SELECT jo.* FROM judge_outcomes jo
      INNER JOIN judge_pairs jp ON jo.pair_id = jp.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (filters?.runId) {
      sql += ' AND jp.run_id = ?';
      params.push(filters.runId);
    }
    if (filters?.minConfidence !== undefined) {
      sql += ' AND jo.confidence >= ?';
      params.push(filters.minConfidence);
    }

    sql += ' ORDER BY jo.confidence DESC';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as unknown[];

    return rows.map(row => this.mapJudgeOutcome(row));
  }

  private mapJudgeOutcome(row: unknown): JudgeOutcome {
    const r = row as Record<string, unknown>;
    const obj = {
      id: r.id as string,
      pairId: r.pair_id as string,
      winnerAttemptId: r.winner_attempt_id as string,
      confidence: r.confidence as number,
      rationaleText: r.rationale_text as string,
      narrativeDiff: r.narrative_diff_json ? JSON.parse(r.narrative_diff_json as string) : {},
      model: r.model as string,
      createdAt: r.created_at as string,
    };
    return JudgeOutcomeSchema.parse(obj);
  }

  // ==================== Memory: Short-term ====================

  upsertShortTermMemory(
    entry: Omit<ShortTermMemory, 'id' | 'createdAt'>
  ): ShortTermMemory {
    const id = deterministicId({ runId: entry.runId, key: entry.key });
    const now = new Date().toISOString();

    const fullEntry: ShortTermMemory = {
      ...entry,
      id,
      createdAt: now,
    };

    ShortTermMemorySchema.parse(fullEntry);

    const stmt = this.db.prepare(`
      INSERT INTO memory_short_term (id, run_id, key, value_json, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(run_id, key) DO UPDATE SET
        value_json = excluded.value_json
    `);

    stmt.run(
      fullEntry.id,
      fullEntry.runId,
      fullEntry.key,
      JSON.stringify(fullEntry.value),
      fullEntry.createdAt
    );

    return fullEntry;
  }

  getShortTermMemory(runId: string, key: string): ShortTermMemory | null {
    const stmt = this.db.prepare(
      'SELECT * FROM memory_short_term WHERE run_id = ? AND key = ?'
    );
    const row = stmt.get(runId, key) as unknown;

    if (!row) return null;

    return this.mapShortTermMemory(row);
  }

  listShortTermMemory(runId: string): ShortTermMemory[] {
    const stmt = this.db.prepare('SELECT * FROM memory_short_term WHERE run_id = ?');
    const rows = stmt.all(runId) as unknown[];

    return rows.map(row => this.mapShortTermMemory(row));
  }

  clearShortTermMemory(runId: string): void {
    const stmt = this.db.prepare('DELETE FROM memory_short_term WHERE run_id = ?');
    stmt.run(runId);
  }

  private mapShortTermMemory(row: unknown): ShortTermMemory {
    const r = row as Record<string, unknown>;
    const obj = {
      id: r.id as string,
      runId: r.run_id as string,
      key: r.key as string,
      value: r.value_json ? JSON.parse(r.value_json as string) : {},
      createdAt: r.created_at as string,
    };
    return ShortTermMemorySchema.parse(obj);
  }

  // ==================== Memory: Working ====================

  upsertWorkingMemory(
    entry: Omit<WorkingMemory, 'id' | 'updatedAt'>
  ): WorkingMemory {
    const id = deterministicId({
      projectId: entry.projectId ?? '.',
      type: entry.type,
      contentText: entry.contentText,
    });
    const now = new Date().toISOString();

    const fullEntry: WorkingMemory = {
      ...entry,
      projectId: entry.projectId ?? '.',
      id,
      updatedAt: now,
    };

    WorkingMemorySchema.parse(fullEntry);

    const stmt = this.db.prepare(`
      INSERT INTO working_memory (id, project_id, type, content_text, provenance_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content_text = excluded.content_text,
        provenance_json = excluded.provenance_json,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      fullEntry.id,
      fullEntry.projectId,
      fullEntry.type,
      fullEntry.contentText,
      JSON.stringify(fullEntry.provenance),
      fullEntry.updatedAt
    );

    return fullEntry;
  }

  getWorkingMemory(id: string): WorkingMemory | null {
    const stmt = this.db.prepare('SELECT * FROM working_memory WHERE id = ?');
    const row = stmt.get(id) as unknown;

    if (!row) return null;

    return this.mapWorkingMemory(row);
  }

  listWorkingMemory(filters?: {
    projectId?: string;
    type?: WorkingMemoryType;
  }): WorkingMemory[] {
    let sql = 'SELECT * FROM working_memory WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.projectId) {
      sql += ' AND project_id = ?';
      params.push(filters.projectId);
    }
    if (filters?.type) {
      sql += ' AND type = ?';
      params.push(filters.type);
    }

    sql += ' ORDER BY updated_at DESC';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as unknown[];

    return rows.map(row => this.mapWorkingMemory(row));
  }

  deleteWorkingMemory(id: string): void {
    const stmt = this.db.prepare('DELETE FROM working_memory WHERE id = ?');
    stmt.run(id);
  }

  private mapWorkingMemory(row: unknown): WorkingMemory {
    const r = row as Record<string, unknown>;
    const obj = {
      id: r.id as string,
      projectId: r.project_id as string,
      type: r.type as WorkingMemoryType,
      contentText: r.content_text as string,
      provenance: r.provenance_json ? JSON.parse(r.provenance_json as string) : {},
      updatedAt: r.updated_at as string,
    };
    return WorkingMemorySchema.parse(obj);
  }

  // ==================== Memory: Events ====================

  recordMemoryEvent(
    event: Omit<MemoryEvent, 'id' | 'createdAt'>
  ): MemoryEvent {
    const id = deterministicId(event);
    const now = new Date().toISOString();

    const fullEvent: MemoryEvent = {
      ...event,
      id,
      createdAt: now,
    };

    MemoryEventSchema.parse(fullEvent);

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO memory_events (id, subject_id, subject_kind, event, data_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      fullEvent.id,
      fullEvent.subjectId,
      fullEvent.subjectKind,
      fullEvent.event,
      JSON.stringify(fullEvent.data),
      fullEvent.createdAt
    );

    if (info.changes === 0) {
      return this.getMemoryEvent(id)!;
    }

    return fullEvent;
  }

  getMemoryEvent(id: string): MemoryEvent | null {
    const stmt = this.db.prepare('SELECT * FROM memory_events WHERE id = ?');
    const row = stmt.get(id) as unknown;

    if (!row) return null;

    return this.mapMemoryEvent(row);
  }

  listMemoryEvents(filters?: {
    subjectId?: string;
    subjectKind?: string;
  }): MemoryEvent[] {
    let sql = 'SELECT * FROM memory_events WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.subjectId) {
      sql += ' AND subject_id = ?';
      params.push(filters.subjectId);
    }
    if (filters?.subjectKind) {
      sql += ' AND subject_kind = ?';
      params.push(filters.subjectKind);
    }

    sql += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as unknown[];

    return rows.map(row => this.mapMemoryEvent(row));
  }

  private mapMemoryEvent(row: unknown): MemoryEvent {
    const r = row as Record<string, unknown>;
    const obj = {
      id: r.id as string,
      subjectId: r.subject_id as string,
      subjectKind: r.subject_kind as string,
      event: r.event as string,
      data: r.data_json ? JSON.parse(r.data_json as string) : {},
      createdAt: r.created_at as string,
    };
    return MemoryEventSchema.parse(obj);
  }
}
