import Database from 'better-sqlite3';
import { KnowledgeItem, Insight, Trace } from '../schemas/knowledge.js';
import { deterministicId } from '../utils/id.js';

/**
 * Repository interface for knowledge storage
 * Provides CRUD operations for knowledge items, insights, and traces
 */
export class Repository {
  constructor(private db: Database.Database) {}

  // ==================== Knowledge Items ====================

  /**
   * Add a knowledge item (generates ID from content)
   */
  addKnowledgeItem(item: Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt'>): KnowledgeItem {
    const id = deterministicId(item);
    const now = new Date().toISOString();

    const fullItem: KnowledgeItem = {
      ...item,
      id,
      createdAt: now,
      updatedAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO knowledge_items (id, type, text, scope, module, meta_tags, confidence, helpful, harmful, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
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

    return fullItem;
  }

  /**
   * Get knowledge item by ID
   */
  getKnowledgeItem(id: string): KnowledgeItem | null {
    const stmt = this.db.prepare('SELECT * FROM knowledge_items WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return this.mapKnowledgeItem(row);
  }

  /**
   * List all knowledge items with optional filters
   */
  listKnowledgeItems(filters?: {
    type?: string;
    scope?: string;
    module?: string;
    minConfidence?: number;
  }): KnowledgeItem[] {
    let sql = 'SELECT * FROM knowledge_items WHERE 1=1';
    const params: any[] = [];

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
    const rows = stmt.all(...params) as any[];

    return rows.map(row => this.mapKnowledgeItem(row));
  }

  /**
   * Update helpful/harmful counters
   */
  updateKnowledgeItemFeedback(id: string, helpful: number, harmful: number): void {
    const stmt = this.db.prepare(`
      UPDATE knowledge_items
      SET helpful = ?, harmful = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(helpful, harmful, new Date().toISOString(), id);
  }

  /**
   * Delete knowledge item
   */
  deleteKnowledgeItem(id: string): void {
    const stmt = this.db.prepare('DELETE FROM knowledge_items WHERE id = ?');
    stmt.run(id);
  }

  // ==================== Insights ====================

  /**
   * Add an insight (generates ID from content)
   */
  addInsight(insight: Omit<Insight, 'id' | 'createdAt'>): Insight {
    const id = deterministicId(insight);
    const now = new Date().toISOString();

    const fullInsight: Insight = {
      ...insight,
      id,
      createdAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO insights (id, pattern, description, confidence, frequency, related_beads, meta_tags, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      fullInsight.id,
      fullInsight.pattern,
      fullInsight.description,
      fullInsight.confidence,
      fullInsight.frequency,
      JSON.stringify(fullInsight.relatedBeads),
      JSON.stringify(fullInsight.metaTags),
      fullInsight.createdAt
    );

    return fullInsight;
  }

  /**
   * Get insight by ID
   */
  getInsight(id: string): Insight | null {
    const stmt = this.db.prepare('SELECT * FROM insights WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return this.mapInsight(row);
  }

  /**
   * List insights with optional filters
   */
  listInsights(filters?: {
    minConfidence?: number;
    minFrequency?: number;
  }): Insight[] {
    let sql = 'SELECT * FROM insights WHERE 1=1';
    const params: any[] = [];

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
    const rows = stmt.all(...params) as any[];

    return rows.map(row => this.mapInsight(row));
  }

  /**
   * Delete insight
   */
  deleteInsight(id: string): void {
    const stmt = this.db.prepare('DELETE FROM insights WHERE id = ?');
    stmt.run(id);
  }

  // ==================== Traces ====================

  /**
   * Add a trace (generates ID from content)
   */
  addTrace(trace: Omit<Trace, 'id' | 'createdAt'>): Trace {
    const id = deterministicId(trace);
    const now = new Date().toISOString();

    const fullTrace: Trace = {
      ...trace,
      id,
      createdAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO traces (id, bead_id, task_description, thread_id, executions, outcome, discovered_issues, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      fullTrace.id,
      fullTrace.beadId,
      fullTrace.taskDescription ?? null,
      fullTrace.threadId ?? null,
      JSON.stringify(fullTrace.executions),
      fullTrace.outcome,
      JSON.stringify(fullTrace.discoveredIssues),
      fullTrace.createdAt
    );

    return fullTrace;
  }

  /**
   * Get trace by ID
   */
  getTrace(id: string): Trace | null {
    const stmt = this.db.prepare('SELECT * FROM traces WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return this.mapTrace(row);
  }

  /**
   * List traces by bead ID
   */
  listTracesByBead(beadId: string): Trace[] {
    const stmt = this.db.prepare('SELECT * FROM traces WHERE bead_id = ? ORDER BY created_at DESC');
    const rows = stmt.all(beadId) as any[];

    return rows.map(row => this.mapTrace(row));
  }

  /**
   * List traces by outcome
   */
  listTracesByOutcome(outcome: 'success' | 'failure' | 'partial'): Trace[] {
    const stmt = this.db.prepare('SELECT * FROM traces WHERE outcome = ? ORDER BY created_at DESC');
    const rows = stmt.all(outcome) as any[];

    return rows.map(row => this.mapTrace(row));
  }

  // ==================== Helpers ====================

  private mapKnowledgeItem(row: any): KnowledgeItem {
    return {
      id: row.id,
      type: row.type,
      text: row.text,
      scope: row.scope,
      module: row.module ?? undefined,
      metaTags: JSON.parse(row.meta_tags),
      confidence: row.confidence,
      helpful: row.helpful,
      harmful: row.harmful,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapInsight(row: any): Insight {
    return {
      id: row.id,
      pattern: row.pattern,
      description: row.description,
      confidence: row.confidence,
      frequency: row.frequency,
      relatedBeads: JSON.parse(row.related_beads),
      metaTags: JSON.parse(row.meta_tags),
      createdAt: row.created_at,
    };
  }

  private mapTrace(row: any): Trace {
    return {
      id: row.id,
      beadId: row.bead_id,
      taskDescription: row.task_description ?? undefined,
      threadId: row.thread_id ?? undefined,
      executions: JSON.parse(row.executions),
      outcome: row.outcome,
      discoveredIssues: JSON.parse(row.discovered_issues),
      createdAt: row.created_at,
    };
  }
}
