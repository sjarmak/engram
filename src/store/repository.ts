import Database from 'better-sqlite3';
import {
  KnowledgeItem,
  Insight,
  Trace,
  KnowledgeItemSchema,
  InsightSchema,
  TraceSchema,
  KnowledgeType,
} from '../schemas/knowledge.js';
import { deterministicId } from '../utils/id.js';

/**
 * Repository interface for knowledge storage
 * Provides CRUD operations for knowledge items, insights, and traces
 */
export class Repository {
  constructor(private db: Database.Database) {}

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
    return {
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
  }

  private mapInsight(row: unknown): Insight {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      pattern: r.pattern as string,
      description: r.description as string,
      confidence: r.confidence as number,
      frequency: r.frequency as number,
      relatedBeads: r.related_beads ? JSON.parse(r.related_beads as string) : [],
      metaTags: r.meta_tags ? JSON.parse(r.meta_tags as string) : [],
      createdAt: r.created_at as string,
    };
  }

  private mapTrace(row: unknown): Trace {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      beadId: r.bead_id as string,
      taskDescription: (r.task_description as string | null) ?? undefined,
      threadId: (r.thread_id as string | null) ?? undefined,
      executions: r.executions ? JSON.parse(r.executions as string) : [],
      outcome: r.outcome as Trace['outcome'],
      discoveredIssues: r.discovered_issues ? JSON.parse(r.discovered_issues as string) : [],
      createdAt: r.created_at as string,
    };
  }
}
