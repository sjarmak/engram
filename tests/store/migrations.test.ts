import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initDatabase, closeAllDatabases } from '../../src/store/sqlite.js';

describe('Schema migration 0001_init', () => {
  let testDir: string;
  let dbPath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'engram-schema-'));
    dbPath = join(testDir, 'test.db');
  });

  afterEach(() => {
    closeAllDatabases();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Cleanup might fail
    }
  });

  it('applies schema successfully', () => {
    const db = initDatabase({ path: dbPath });

    const migrationSQL = readFileSync(
      join(process.cwd(), 'src/store/migrations/0001_init.sql'),
      'utf-8'
    );

    db.exec(migrationSQL);

    // Verify schema_version
    const version = db.prepare('SELECT version FROM schema_version').get() as { version: number };
    expect(version.version).toBe(1);
  });

  it('creates knowledge_items table', () => {
    const db = initDatabase({ path: dbPath });
    const migrationSQL = readFileSync(
      join(process.cwd(), 'src/store/migrations/0001_init.sql'),
      'utf-8'
    );
    db.exec(migrationSQL);

    db.exec(`
      INSERT INTO knowledge_items (id, type, text, scope, created_at, updated_at)
      VALUES ('${'a'.repeat(64)}', 'pattern', 'Test pattern', 'repo', datetime('now'), datetime('now'))
    `);

    const row = db.prepare('SELECT * FROM knowledge_items').get();
    expect(row).toBeDefined();
  });

  it('creates insights table', () => {
    const db = initDatabase({ path: dbPath });
    const migrationSQL = readFileSync(
      join(process.cwd(), 'src/store/migrations/0001_init.sql'),
      'utf-8'
    );
    db.exec(migrationSQL);

    db.exec(`
      INSERT INTO insights (id, pattern, description, confidence, created_at)
      VALUES ('${'b'.repeat(64)}', 'Test', 'Description', 0.8, datetime('now'))
    `);

    const row = db.prepare('SELECT * FROM insights').get();
    expect(row).toBeDefined();
  });

  it('creates traces table', () => {
    const db = initDatabase({ path: dbPath });
    const migrationSQL = readFileSync(
      join(process.cwd(), 'src/store/migrations/0001_init.sql'),
      'utf-8'
    );
    db.exec(migrationSQL);

    db.exec(`
      INSERT INTO traces (id, bead_id, executions, outcome, created_at)
      VALUES ('${'c'.repeat(64)}', 'bd-1', '[]', 'success', datetime('now'))
    `);

    const row = db.prepare('SELECT * FROM traces').get();
    expect(row).toBeDefined();
  });

  it('creates all required tables', () => {
    const db = initDatabase({ path: dbPath });
    const migrationSQL = readFileSync(
      join(process.cwd(), 'src/store/migrations/0001_init.sql'),
      'utf-8'
    );
    db.exec(migrationSQL);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];

    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('knowledge_items');
    expect(tableNames).toContain('insights');
    expect(tableNames).toContain('traces');
    expect(tableNames).toContain('runs');
    expect(tableNames).toContain('branches');
    expect(tableNames).toContain('threads');
    expect(tableNames).toContain('metrics');
    expect(tableNames).toContain('retrieval_cache');
    expect(tableNames).toContain('schema_version');
  });

  it('creates indexes', () => {
    const db = initDatabase({ path: dbPath });
    const migrationSQL = readFileSync(
      join(process.cwd(), 'src/store/migrations/0001_init.sql'),
      'utf-8'
    );
    db.exec(migrationSQL);

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name")
      .all() as { name: string }[];

    const indexNames = indexes.map(i => i.name);
    expect(indexNames).toContain('idx_knowledge_type');
    expect(indexNames).toContain('idx_insights_confidence');
    expect(indexNames).toContain('idx_traces_bead_id');
  });

  it('enforces knowledge_items type constraint', () => {
    const db = initDatabase({ path: dbPath });
    const migrationSQL = readFileSync(
      join(process.cwd(), 'src/store/migrations/0001_init.sql'),
      'utf-8'
    );
    db.exec(migrationSQL);

    expect(() => {
      db.exec(`
        INSERT INTO knowledge_items (id, type, text, scope, created_at, updated_at)
        VALUES ('${'a'.repeat(64)}', 'invalid', 'Test', 'repo', datetime('now'), datetime('now'))
      `);
    }).toThrow();
  });

  it('enforces confidence range constraint', () => {
    const db = initDatabase({ path: dbPath });
    const migrationSQL = readFileSync(
      join(process.cwd(), 'src/store/migrations/0001_init.sql'),
      'utf-8'
    );
    db.exec(migrationSQL);

    expect(() => {
      db.exec(`
        INSERT INTO knowledge_items (id, type, text, scope, confidence, created_at, updated_at)
        VALUES ('${'a'.repeat(64)}', 'fact', 'Test', 'repo', 1.5, datetime('now'), datetime('now'))
      `);
    }).toThrow();
  });
});
