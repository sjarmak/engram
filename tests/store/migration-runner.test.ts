import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initDatabase, closeAllDatabases } from '../../src/store/sqlite.js';
import {
  loadMigrations,
  getCurrentVersion,
  getAppliedMigrations,
  applyMigration,
  runMigrations,
  needsMigration,
  getMigrationStatus,
} from '../../src/store/migrations.js';

describe('Migration framework', () => {
  let testDir: string;
  let dbPath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'engram-migrations-'));
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

  describe('loadMigrations', () => {
    it('loads migration files', () => {
      const migrations = loadMigrations();
      expect(migrations.length).toBeGreaterThan(0);
    });

    it('parses version from filename', () => {
      const migrations = loadMigrations();
      const first = migrations[0];
      expect(first.version).toBe(1);
      expect(first.filename).toBe('0001_init.sql');
    });

    it('loads SQL content', () => {
      const migrations = loadMigrations();
      const first = migrations[0];
      expect(first.sql).toContain('CREATE TABLE');
      expect(first.sql).toContain('knowledge_items');
    });

    it('sorts migrations by version', () => {
      const migrations = loadMigrations();
      for (let i = 1; i < migrations.length; i++) {
        expect(migrations[i].version).toBeGreaterThan(migrations[i - 1].version);
      }
    });
  });

  describe('getCurrentVersion', () => {
    it('returns 0 for fresh database', () => {
      const db = initDatabase({ path: dbPath });
      const version = getCurrentVersion(db);
      expect(version).toBe(0);
    });

    it('returns version after migration applied', () => {
      const db = initDatabase({ path: dbPath });
      const migrations = loadMigrations();
      applyMigration(db, migrations[0]);

      const version = getCurrentVersion(db);
      expect(version).toBe(1);
    });
  });

  describe('getAppliedMigrations', () => {
    it('returns empty array for fresh database', () => {
      const db = initDatabase({ path: dbPath });
      const applied = getAppliedMigrations(db);
      expect(applied).toEqual([]);
    });

    it('returns applied migrations after running', () => {
      const db = initDatabase({ path: dbPath });
      runMigrations(db);

      const applied = getAppliedMigrations(db);
      expect(applied.length).toBeGreaterThan(0);
      expect(applied[0].version).toBe(1);
      expect(applied[0].appliedAt).toBeDefined();
    });
  });

  describe('applyMigration', () => {
    it('applies migration successfully', () => {
      const db = initDatabase({ path: dbPath });
      const migrations = loadMigrations();

      applyMigration(db, migrations[0]);

      // Verify tables created
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
        name: string;
      }[];

      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('knowledge_items');
      expect(tableNames).toContain('schema_version');
    });

    it('updates schema_version table', () => {
      const db = initDatabase({ path: dbPath });
      const migrations = loadMigrations();

      applyMigration(db, migrations[0]);

      const version = getCurrentVersion(db);
      expect(version).toBe(1);
    });
  });

  describe('runMigrations', () => {
    it('applies all pending migrations', () => {
      const db = initDatabase({ path: dbPath });

      const result = runMigrations(db);

      expect(result.applied).toBeGreaterThan(0);
      expect(result.current).toBe(3);
    });

    it('is idempotent (safe to run multiple times)', () => {
      const db = initDatabase({ path: dbPath });

      const result1 = runMigrations(db);
      const result2 = runMigrations(db);

      expect(result1.applied).toBeGreaterThan(0);
      expect(result2.applied).toBe(0);
      expect(result1.current).toBe(result2.current);
    });

    it('only applies migrations newer than current version', () => {
      const db = initDatabase({ path: dbPath });

      // Apply first time
      runMigrations(db);
      const currentVersion = getCurrentVersion(db);

      // Apply again
      const result = runMigrations(db);

      expect(result.applied).toBe(0);
      expect(result.current).toBe(currentVersion);
    });
  });

  describe('needsMigration', () => {
    it('returns true for fresh database', () => {
      const db = initDatabase({ path: dbPath });
      expect(needsMigration(db)).toBe(true);
    });

    it('returns false after all migrations applied', () => {
      const db = initDatabase({ path: dbPath });
      runMigrations(db);
      expect(needsMigration(db)).toBe(false);
    });
  });

  describe('getMigrationStatus', () => {
    it('returns status for fresh database', () => {
      const db = initDatabase({ path: dbPath });
      const status = getMigrationStatus(db);

      expect(status.current).toBe(0);
      expect(status.latest).toBe(3);
      expect(status.pending).toBe(3);
      expect(status.applied).toEqual([]);
    });

    it('returns status after migrations applied', () => {
      const db = initDatabase({ path: dbPath });
      runMigrations(db);

      const status = getMigrationStatus(db);

      expect(status.current).toBe(3);
      expect(status.latest).toBe(3);
      expect(status.pending).toBe(0);
      expect(status.applied.length).toBe(3);
    });
  });

  describe('integration', () => {
    it('full migration workflow', () => {
      const db = initDatabase({ path: dbPath });

      // Check status before
      expect(needsMigration(db)).toBe(true);

      // Run migrations
      const result = runMigrations(db);
      expect(result.applied).toBe(3);

      // Check status after
      expect(needsMigration(db)).toBe(false);

      // Verify schema works
      db.exec(`
        INSERT INTO knowledge_items (id, type, text, scope, created_at, updated_at)
        VALUES ('${'a'.repeat(64)}', 'pattern', 'Test', 'repo', datetime('now'), datetime('now'))
      `);

      const count = db.prepare('SELECT COUNT(*) as count FROM knowledge_items').get() as {
        count: number;
      };
      expect(count.count).toBe(1);
    });
  });
});
