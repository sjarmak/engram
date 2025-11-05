import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initDatabase, closeAllDatabases } from '../../src/store/sqlite.js';
import { runMigrations } from '../../src/store/migrations.js';
import { Repository } from '../../src/store/repository.js';
import { Thread, Run } from '../../src/schemas/knowledge.js';

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
    } catch {
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
        executions: [
          {
            runner: 'vitest',
            command: 'npm test',
            status: 'pass',
            errors: [],
          },
        ],
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

  describe('Threads', () => {
    it('adds thread', () => {
      const thread = repo.addThread({
        threadId: 'T-12345',
        beadId: 'bd-42',
        url: 'https://ampcode.com/threads/T-12345',
      });

      expect(thread.id).toBeDefined();
      expect(thread.id).toHaveLength(64);
      expect(thread.threadId).toBe('T-12345');
      expect(thread.beadId).toBe('bd-42');
      expect(thread.createdAt).toBeDefined();
    });

    it('is idempotent for same thread', () => {
      const thread1 = repo.addThread({
        threadId: 'T-abc',
        beadId: 'bd-1',
      });

      const thread2 = repo.addThread({
        threadId: 'T-abc',
        beadId: 'bd-1',
      });

      expect(thread2.id).toBe(thread1.id);
    });

    it('gets thread by ID', () => {
      const added = repo.addThread({
        threadId: 'T-test',
        beadId: 'bd-100',
      });

      const retrieved = repo.getThread(added.id);
      expect(retrieved).toEqual(added);
    });

    it('gets thread by thread ID', () => {
      const added = repo.addThread({
        threadId: 'T-unique',
        beadId: 'bd-200',
      });

      const retrieved = repo.getThreadByThreadId('T-unique');
      expect(retrieved?.id).toBe(added.id);
      expect(retrieved?.threadId).toBe('T-unique');
    });

    it('lists threads by bead ID', () => {
      repo.addThread({ threadId: 'T-1', beadId: 'bd-50' });
      repo.addThread({ threadId: 'T-2', beadId: 'bd-50' });
      repo.addThread({ threadId: 'T-3', beadId: 'bd-99' });

      const threads = repo.listThreadsByBead('bd-50');
      expect(threads).toHaveLength(2);
    });

    it('updates thread bead association', () => {
      repo.addThread({ threadId: 'T-update', beadId: 'bd-old' });
      repo.updateThreadBead('T-update', 'bd-new');

      const updated = repo.getThreadByThreadId('T-update');
      expect(updated?.beadId).toBe('bd-new');
    });
  });

  describe('Runs', () => {
    it('adds run', () => {
      const run = repo.addRun({
        runType: 'learn',
        beadIds: ['bd-1', 'bd-2'],
        insightsGenerated: 0,
        knowledgeAdded: 0,
        startedAt: new Date().toISOString(),
        status: 'running',
      });

      expect(run.id).toBeDefined();
      expect(run.id).toHaveLength(64);
      expect(run.runType).toBe('learn');
      expect(run.beadIds).toEqual(['bd-1', 'bd-2']);
    });

    it('gets run by ID', () => {
      const added = repo.addRun({
        runType: 'reflect',
        beadIds: [],
        insightsGenerated: 0,
        knowledgeAdded: 0,
        startedAt: new Date().toISOString(),
        status: 'running',
      });

      const retrieved = repo.getRun(added.id);
      expect(retrieved).toEqual(added);
    });

    it('lists runs with filters', () => {
      repo.addRun({
        runType: 'learn',
        beadIds: [],
        insightsGenerated: 0,
        knowledgeAdded: 0,
        startedAt: new Date().toISOString(),
        status: 'success',
      });

      repo.addRun({
        runType: 'curate',
        beadIds: [],
        insightsGenerated: 0,
        knowledgeAdded: 0,
        startedAt: new Date().toISOString(),
        status: 'failure',
      });

      const learnRuns = repo.listRuns({ runType: 'learn' });
      expect(learnRuns).toHaveLength(1);
      expect(learnRuns[0].runType).toBe('learn');

      const failures = repo.listRuns({ status: 'failure' });
      expect(failures).toHaveLength(1);
      expect(failures[0].status).toBe('failure');
    });

    it('updates run status', () => {
      const run = repo.addRun({
        runType: 'ci',
        beadIds: ['bd-1'],
        insightsGenerated: 0,
        knowledgeAdded: 0,
        startedAt: new Date().toISOString(),
        status: 'running',
      });

      const completedAt = new Date().toISOString();
      repo.updateRunStatus(run.id, 'success', completedAt, undefined, {
        insightsGenerated: 5,
        knowledgeAdded: 3,
      });

      const updated = repo.getRun(run.id);
      expect(updated?.status).toBe('success');
      expect(updated?.completedAt).toBe(completedAt);
      expect(updated?.insightsGenerated).toBe(5);
      expect(updated?.knowledgeAdded).toBe(3);
    });

    it('updates run status with error', () => {
      const run = repo.addRun({
        runType: 'reflect',
        beadIds: [],
        insightsGenerated: 0,
        knowledgeAdded: 0,
        startedAt: new Date().toISOString(),
        status: 'running',
      });

      repo.updateRunStatus(run.id, 'failure', new Date().toISOString(), 'Database error');

      const updated = repo.getRun(run.id);
      expect(updated?.status).toBe('failure');
      expect(updated?.error).toBe('Database error');
    });
  });
});
