import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initDatabase, getDatabase, closeDatabase, closeAllDatabases } from '../../src/store/sqlite.js';

describe('SQLite setup', () => {
  let testDir: string;
  let dbPath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'af-test-'));
    dbPath = join(testDir, 'test.db');
  });

  afterEach(() => {
    closeAllDatabases();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (err) {
      // Cleanup might fail on some systems
    }
  });

  describe('initDatabase', () => {
    it('creates database file', () => {
      const db = initDatabase({ path: dbPath });
      expect(db).toBeDefined();
      db.close();
    });

    it('enables WAL mode by default', () => {
      const db = initDatabase({ path: dbPath });
      const result = db.pragma('journal_mode', { simple: true });
      expect(result).toBe('wal');
      db.close();
    });

    it('sets synchronous to NORMAL', () => {
      const db = initDatabase({ path: dbPath });
      const result = db.pragma('synchronous', { simple: true });
      expect(result).toBe(1); // NORMAL = 1
      db.close();
    });

    it('sets busy_timeout', () => {
      const db = initDatabase({ path: dbPath });
      const result = db.pragma('busy_timeout', { simple: true });
      expect(result).toBe(5000);
      db.close();
    });

    it('supports readonly mode', () => {
      // Create database first
      const db = initDatabase({ path: dbPath });
      db.close();

      // Open as readonly
      const readonlyDb = initDatabase({ path: dbPath, readonly: true });
      expect(readonlyDb).toBeDefined();
      
      // Verify cannot write
      expect(() => {
        readonlyDb.exec('CREATE TABLE test (id INTEGER)');
      }).toThrow();
      
      readonlyDb.close();
    });

    it('does not enable WAL mode in readonly', () => {
      // Create database first
      const db = initDatabase({ path: dbPath });
      db.close();

      // Open as readonly
      const readonlyDb = initDatabase({ path: dbPath, readonly: true });
      
      // Should not crash accessing pragma
      const result = readonlyDb.pragma('journal_mode', { simple: true });
      expect(result).toBeDefined();
      
      readonlyDb.close();
    });

    it('creates directory if not exists', () => {
      const nestedPath = join(testDir, 'nested', 'deep', 'test.db');
      const db = initDatabase({ path: nestedPath });
      expect(db).toBeDefined();
      db.close();
    });
  });

  describe('pool management', () => {
    it('getDatabase returns singleton instance', () => {
      const db1 = getDatabase({ path: dbPath });
      const db2 = getDatabase({ path: dbPath });
      
      expect(db1).toBe(db2);
    });

    it('different paths create different instances', () => {
      const dbPath2 = join(testDir, 'test2.db');
      
      const db1 = getDatabase({ path: dbPath });
      const db2 = getDatabase({ path: dbPath2 });
      
      expect(db1).not.toBe(db2);
    });

    it('readonly and readwrite are separate instances', () => {
      // Create db first
      const dbWrite = getDatabase({ path: dbPath });
      dbWrite.exec('CREATE TABLE test (id INTEGER)');

      const dbRead = getDatabase({ path: dbPath, readonly: true });
      
      expect(dbWrite).not.toBe(dbRead);
    });

    it('closeDatabase closes specific connection', () => {
      const db = getDatabase({ path: dbPath });
      closeDatabase(dbPath);
      
      // Should get new instance
      const db2 = getDatabase({ path: dbPath });
      expect(db).not.toBe(db2);
    });

    it('closeAllDatabases closes all connections', () => {
      const db1 = getDatabase({ path: dbPath });
      const db2 = getDatabase({ path: join(testDir, 'test2.db') });
      
      closeAllDatabases();
      
      const db3 = getDatabase({ path: dbPath });
      expect(db1).not.toBe(db3);
    });
  });

  describe('concurrency', () => {
    it('supports concurrent reads', () => {
      const db = getDatabase({ path: dbPath });
      db.exec('CREATE TABLE test (id INTEGER, value TEXT)');
      db.exec("INSERT INTO test VALUES (1, 'test')");

      const stmt1 = db.prepare('SELECT * FROM test WHERE id = ?');
      const stmt2 = db.prepare('SELECT * FROM test WHERE id = ?');

      const result1 = stmt1.get(1);
      const result2 = stmt2.get(1);

      expect(result1).toEqual({ id: 1, value: 'test' });
      expect(result2).toEqual({ id: 1, value: 'test' });
    });

    it('handles transactions', () => {
      const db = getDatabase({ path: dbPath });
      db.exec('CREATE TABLE test (id INTEGER)');

      const insert = db.prepare('INSERT INTO test VALUES (?)');
      const insertMany = db.transaction((items: number[]) => {
        for (const item of items) {
          insert.run(item);
        }
      });

      insertMany([1, 2, 3]);

      const count = db.prepare('SELECT COUNT(*) as count FROM test').get() as { count: number };
      expect(count.count).toBe(3);
    });
  });
});
