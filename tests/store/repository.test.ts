import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initDatabase, closeAllDatabases } from '../../src/store/sqlite.js';
import { runMigrations } from '../../src/store/migrations.js';
import { Repository } from '../../src/store/repository.js';

describe('Repository', () => {
  let testDir: string;
  let dbPath: string;
  let repo: Repository;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'af-repo-'));
    dbPath = join(testDir, 'test.db');
    
    const db = initDatabase({ path: dbPath });
    runMigrations(db);
    repo = new Repository(db);
  });

  afterEach(() => {
    closeAllDatabases();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (err) {
      // Cleanup might fail
    }
  });

  describe('Knowledge Items', () => {
    it('adds knowledge item', () => {
      const item = repo.addKnowledgeItem({
        type: 'pattern',
        text: 'Always use .js extensions',
        scope: 'repo',
        metaTags: ['typescript', 'esm'],
        confidence: 0.9,
        helpful: 0,
        harmful: 0,
      });

      expect(item.id).toBeDefined();
      expect(item.id).toHaveLength(64);
      expect(item.type).toBe('pattern');
      expect(item.createdAt).toBeDefined();
    });

    it('generates deterministic IDs and is idempotent', () => {
      const item1 = repo.addKnowledgeItem({
        type: 'fact',
        text: 'Test fact',
        scope: 'repo',
        metaTags: [],
        confidence: 1.0,
        helpful: 0,
        harmful: 0,
      });

      // Same content should generate same ID and return existing item (idempotent)
      const sameContent = {
        type: 'fact' as const,
        text: 'Test fact',
        scope: 'repo',
        metaTags: [],
        confidence: 1.0,
        helpful: 0,
        harmful: 0,
      };

      const item2 = repo.addKnowledgeItem(sameContent);
      expect(item2.id).toBe(item1.id);
      expect(item2).toEqual(item1);
    });

    it('gets knowledge item by ID', () => {
      const added = repo.addKnowledgeItem({
        type: 'pattern',
        text: 'Test pattern',
        scope: 'repo',
        metaTags: [],
        confidence: 0.8,
        helpful: 0,
        harmful: 0,
      });

      const retrieved = repo.getKnowledgeItem(added.id);
      expect(retrieved).toEqual(added);
    });

    it('returns null for non-existent ID', () => {
      const result = repo.getKnowledgeItem('a'.repeat(64));
      expect(result).toBeNull();
    });

    it('lists all knowledge items', () => {
      repo.addKnowledgeItem({
        type: 'pattern',
        text: 'Pattern 1',
        scope: 'repo',
        metaTags: [],
        confidence: 0.9,
        helpful: 0,
        harmful: 0,
      });

      repo.addKnowledgeItem({
        type: 'fact',
        text: 'Fact 1',
        scope: 'repo',
        metaTags: [],
        confidence: 0.8,
        helpful: 0,
        harmful: 0,
      });

      const items = repo.listKnowledgeItems();
      expect(items).toHaveLength(2);
    });

    it('filters by type', () => {
      repo.addKnowledgeItem({
        type: 'pattern',
        text: 'Pattern 1',
        scope: 'repo',
        metaTags: [],
        confidence: 0.9,
        helpful: 0,
        harmful: 0,
      });

      repo.addKnowledgeItem({
        type: 'fact',
        text: 'Fact 1',
        scope: 'repo',
        metaTags: [],
        confidence: 0.8,
        helpful: 0,
        harmful: 0,
      });

      const patterns = repo.listKnowledgeItems({ type: 'pattern' });
      expect(patterns).toHaveLength(1);
      expect(patterns[0].type).toBe('pattern');
    });

    it('filters by scope', () => {
      repo.addKnowledgeItem({
        type: 'pattern',
        text: 'Repo pattern',
        scope: 'repo',
        metaTags: [],
        confidence: 0.9,
        helpful: 0,
        harmful: 0,
      });

      repo.addKnowledgeItem({
        type: 'pattern',
        text: 'Module pattern',
        scope: 'module',
        metaTags: [],
        confidence: 0.9,
        helpful: 0,
        harmful: 0,
      });

      const repoItems = repo.listKnowledgeItems({ scope: 'repo' });
      expect(repoItems).toHaveLength(1);
      expect(repoItems[0].scope).toBe('repo');
    });

    it('filters by minimum confidence', () => {
      repo.addKnowledgeItem({
        type: 'pattern',
        text: 'High confidence',
        scope: 'repo',
        metaTags: [],
        confidence: 0.9,
        helpful: 0,
        harmful: 0,
      });

      repo.addKnowledgeItem({
        type: 'pattern',
        text: 'Low confidence',
        scope: 'repo',
        metaTags: [],
        confidence: 0.5,
        helpful: 0,
        harmful: 0,
      });

      const highConf = repo.listKnowledgeItems({ minConfidence: 0.8 });
      expect(highConf).toHaveLength(1);
      expect(highConf[0].confidence).toBe(0.9);
    });

    it('updates feedback counters incrementally', () => {
      const item = repo.addKnowledgeItem({
        type: 'pattern',
        text: 'Test',
        scope: 'repo',
        metaTags: [],
        confidence: 0.9,
        helpful: 0,
        harmful: 0,
      });

      // Increment by 5 and 1
      repo.updateKnowledgeItemFeedback(item.id, 5, 1);

      let updated = repo.getKnowledgeItem(item.id);
      expect(updated?.helpful).toBe(5);
      expect(updated?.harmful).toBe(1);

      // Increment again by 2 and 1
      repo.updateKnowledgeItemFeedback(item.id, 2, 1);

      updated = repo.getKnowledgeItem(item.id);
      expect(updated?.helpful).toBe(7);
      expect(updated?.harmful).toBe(2);
    });

    it('deletes knowledge item', () => {
      const item = repo.addKnowledgeItem({
        type: 'pattern',
        text: 'Test',
        scope: 'repo',
        metaTags: [],
        confidence: 0.9,
        helpful: 0,
        harmful: 0,
      });

      repo.deleteKnowledgeItem(item.id);

      const result = repo.getKnowledgeItem(item.id);
      expect(result).toBeNull();
    });
  });

  describe('Insights', () => {
    it('adds insight', () => {
      const insight = repo.addInsight({
        pattern: 'Build errors',
        description: 'Always run tsc before tests',
        confidence: 0.85,
        frequency: 3,
        relatedBeads: ['bd-1', 'bd-2'],
        metaTags: ['typescript'],
      });

      expect(insight.id).toBeDefined();
      expect(insight.pattern).toBe('Build errors');
      expect(insight.createdAt).toBeDefined();
    });

    it('gets insight by ID', () => {
      const added = repo.addInsight({
        pattern: 'Test pattern',
        description: 'Test description',
        confidence: 0.8,
        frequency: 1,
        relatedBeads: [],
        metaTags: [],
      });

      const retrieved = repo.getInsight(added.id);
      expect(retrieved).toEqual(added);
    });

    it('lists insights', () => {
      repo.addInsight({
        pattern: 'Pattern 1',
        description: 'Desc 1',
        confidence: 0.9,
        frequency: 5,
        relatedBeads: [],
        metaTags: [],
      });

      repo.addInsight({
        pattern: 'Pattern 2',
        description: 'Desc 2',
        confidence: 0.7,
        frequency: 2,
        relatedBeads: [],
        metaTags: [],
      });

      const insights = repo.listInsights();
      expect(insights).toHaveLength(2);
      // Should be ordered by confidence DESC
      expect(insights[0].confidence).toBeGreaterThanOrEqual(insights[1].confidence);
    });

    it('filters by minimum confidence', () => {
      repo.addInsight({
        pattern: 'High',
        description: 'High confidence',
        confidence: 0.9,
        frequency: 1,
        relatedBeads: [],
        metaTags: [],
      });

      repo.addInsight({
        pattern: 'Low',
        description: 'Low confidence',
        confidence: 0.5,
        frequency: 1,
        relatedBeads: [],
        metaTags: [],
      });

      const filtered = repo.listInsights({ minConfidence: 0.8 });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].confidence).toBe(0.9);
    });

    it('deletes insight', () => {
      const insight = repo.addInsight({
        pattern: 'Test',
        description: 'Test',
        confidence: 0.8,
        frequency: 1,
        relatedBeads: [],
        metaTags: [],
      });

      repo.deleteInsight(insight.id);

      const result = repo.getInsight(insight.id);
      expect(result).toBeNull();
    });
  });

  describe('Traces', () => {
    it('adds trace', () => {
      const trace = repo.addTrace({
        beadId: 'bd-42',
        taskDescription: 'Run tests',
        threadId: 'T-uuid',
        executions: [{
          runner: 'vitest',
          command: 'npm test',
          status: 'pass',
          errors: [],
        }],
        outcome: 'success',
        discoveredIssues: [],
      });

      expect(trace.id).toBeDefined();
      expect(trace.beadId).toBe('bd-42');
      expect(trace.createdAt).toBeDefined();
    });

    it('gets trace by ID', () => {
      const added = repo.addTrace({
        beadId: 'bd-1',
        executions: [{ runner: 'npm', command: 'npm test', status: 'pass', errors: [] }],
        outcome: 'success',
        discoveredIssues: [],
      });

      const retrieved = repo.getTrace(added.id);
      expect(retrieved).toEqual(added);
    });

    it('lists traces by bead ID', () => {
      repo.addTrace({
        beadId: 'bd-1',
        executions: [{ runner: 'npm', command: 'npm test', status: 'pass', errors: [] }],
        outcome: 'success',
        discoveredIssues: [],
      });

      repo.addTrace({
        beadId: 'bd-1',
        executions: [{ runner: 'npm', command: 'npm build', status: 'fail', errors: [] }],
        outcome: 'failure',
        discoveredIssues: [],
      });

      repo.addTrace({
        beadId: 'bd-2',
        executions: [{ runner: 'npm', command: 'npm test', status: 'pass', errors: [] }],
        outcome: 'success',
        discoveredIssues: [],
      });

      const bd1Traces = repo.listTracesByBead('bd-1');
      expect(bd1Traces).toHaveLength(2);
    });

    it('lists traces by outcome', () => {
      repo.addTrace({
        beadId: 'bd-1',
        executions: [{ runner: 'npm', command: 'npm test', status: 'pass', errors: [] }],
        outcome: 'success',
        discoveredIssues: [],
      });

      repo.addTrace({
        beadId: 'bd-2',
        executions: [{ runner: 'npm', command: 'npm test', status: 'fail', errors: [] }],
        outcome: 'failure',
        discoveredIssues: [],
      });

      const failures = repo.listTracesByOutcome('failure');
      expect(failures).toHaveLength(1);
      expect(failures[0].outcome).toBe('failure');
    });
  });
});
