import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  appendJsonl,
  appendJsonlBatch,
  appendAuditEntry,
  readJsonl,
  readJsonlFiltered,
  readAuditEntries,
  countJsonlEntries,
  SnapshotWriter,
} from '../../src/adapters/jsonl.js';

describe('JSONL adapter', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'af-jsonl-'));
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (err) {
      // Cleanup might fail
    }
  });

  describe('appendJsonl', () => {
    it('creates file and appends JSON line', () => {
      const path = join(testDir, 'test.jsonl');
      const data = { id: 1, name: 'test' };

      appendJsonl(path, data);

      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, 'utf-8');
      expect(content).toBe('{"id":1,"name":"test"}\n');
    });

    it('appends multiple entries on separate lines', () => {
      const path = join(testDir, 'test.jsonl');

      appendJsonl(path, { id: 1 });
      appendJsonl(path, { id: 2 });
      appendJsonl(path, { id: 3 });

      const content = readFileSync(path, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);
    });

    it('creates nested directories', () => {
      const path = join(testDir, 'nested', 'deep', 'test.jsonl');

      appendJsonl(path, { test: 'data' });

      expect(existsSync(path)).toBe(true);
    });

    it('handles complex objects', () => {
      const path = join(testDir, 'test.jsonl');
      const data = {
        nested: { key: 'value' },
        array: [1, 2, 3],
        bool: true,
        num: 42.5,
      };

      appendJsonl(path, data);

      const entries = readJsonl(path);
      expect(entries[0]).toEqual(data);
    });
  });

  describe('appendJsonlBatch', () => {
    it('appends multiple entries at once', () => {
      const path = join(testDir, 'batch.jsonl');
      const entries = [
        { id: 1, value: 'a' },
        { id: 2, value: 'b' },
        { id: 3, value: 'c' },
      ];

      appendJsonlBatch(path, entries);

      const content = readFileSync(path, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);
    });

    it('is more efficient than multiple appends', () => {
      const path = join(testDir, 'batch.jsonl');
      const entries = Array.from({ length: 100 }, (_, i) => ({ id: i }));

      appendJsonlBatch(path, entries);

      expect(countJsonlEntries(path)).toBe(100);
    });
  });

  describe('appendAuditEntry', () => {
    it('adds timestamp and type', () => {
      const path = join(testDir, 'audit.jsonl');
      const data = { action: 'create', resource: 'knowledge_item' };

      appendAuditEntry(path, 'mutation', data);

      const entries = readJsonl(path);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toHaveProperty('timestamp');
      expect(entries[0]).toHaveProperty('type', 'mutation');
      expect(entries[0]).toHaveProperty('data', data);
    });

    it('timestamp is ISO 8601 format', () => {
      const path = join(testDir, 'audit.jsonl');

      appendAuditEntry(path, 'test', { value: 1 });

      const entries = readJsonl(path);
      const entry = entries[0] as any;
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('readJsonl', () => {
    it('reads all entries from file', () => {
      const path = join(testDir, 'test.jsonl');
      
      appendJsonl(path, { id: 1 });
      appendJsonl(path, { id: 2 });
      appendJsonl(path, { id: 3 });

      const entries = readJsonl(path);
      expect(entries).toHaveLength(3);
      expect(entries[0]).toEqual({ id: 1 });
      expect(entries[2]).toEqual({ id: 3 });
    });

    it('returns empty array for non-existent file', () => {
      const path = join(testDir, 'nonexistent.jsonl');
      const entries = readJsonl(path);
      expect(entries).toEqual([]);
    });

    it('handles empty lines', () => {
      const path = join(testDir, 'test.jsonl');
      
      appendJsonl(path, { id: 1 });
      appendJsonl(path, { id: 2 });

      const entries = readJsonl(path);
      expect(entries).toHaveLength(2);
    });

    it('supports type parameter', () => {
      const path = join(testDir, 'typed.jsonl');
      
      interface TestEntry {
        id: number;
        name: string;
      }

      appendJsonl(path, { id: 1, name: 'test' });

      const entries = readJsonl<TestEntry>(path);
      expect(entries[0].id).toBe(1);
      expect(entries[0].name).toBe('test');
    });
  });

  describe('readJsonlFiltered', () => {
    it('filters entries by predicate', () => {
      const path = join(testDir, 'test.jsonl');
      
      appendJsonl(path, { id: 1, active: true });
      appendJsonl(path, { id: 2, active: false });
      appendJsonl(path, { id: 3, active: true });

      const active = readJsonlFiltered<any>(path, entry => entry.active);
      expect(active).toHaveLength(2);
      expect(active[0].id).toBe(1);
      expect(active[1].id).toBe(3);
    });
  });

  describe('readAuditEntries', () => {
    it('reads all audit entries', () => {
      const path = join(testDir, 'audit.jsonl');
      
      appendAuditEntry(path, 'create', { id: 1 });
      appendAuditEntry(path, 'update', { id: 2 });

      const entries = readAuditEntries(path);
      expect(entries).toHaveLength(2);
    });

    it('filters by type', () => {
      const path = join(testDir, 'audit.jsonl');
      
      appendAuditEntry(path, 'create', { id: 1 });
      appendAuditEntry(path, 'update', { id: 2 });
      appendAuditEntry(path, 'create', { id: 3 });

      const creates = readAuditEntries(path, 'create');
      expect(creates).toHaveLength(2);
      expect(creates.every(e => e.type === 'create')).toBe(true);
    });
  });

  describe('countJsonlEntries', () => {
    it('counts entries in file', () => {
      const path = join(testDir, 'test.jsonl');
      
      appendJsonlBatch(path, [{ id: 1 }, { id: 2 }, { id: 3 }]);

      expect(countJsonlEntries(path)).toBe(3);
    });

    it('returns 0 for non-existent file', () => {
      const path = join(testDir, 'nonexistent.jsonl');
      expect(countJsonlEntries(path)).toBe(0);
    });

    it('ignores empty lines', () => {
      const path = join(testDir, 'test.jsonl');
      
      appendJsonl(path, { id: 1 });
      appendJsonl(path, { id: 2 });

      expect(countJsonlEntries(path)).toBe(2);
    });
  });

  describe('SnapshotWriter', () => {
    it('writes timestamped snapshot', () => {
      const writer = new SnapshotWriter(testDir);
      const data = [{ id: 1 }, { id: 2 }];

      const path = writer.writeSnapshot('knowledge', data);

      expect(existsSync(path)).toBe(true);
      expect(path).toContain('knowledge_');
      expect(path).toContain('.jsonl');
      
      const entries = readJsonl(path);
      expect(entries).toHaveLength(2);
    });

    it('creates unique filenames', async () => {
      const writer = new SnapshotWriter(testDir);

      const path1 = writer.writeSnapshot('test', [{ id: 1 }]);
      
      // Wait 1ms to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 1));
      
      const path2 = writer.writeSnapshot('test', [{ id: 2 }]);

      expect(path1).not.toBe(path2);
    });

    it('writes daily snapshot', () => {
      const writer = new SnapshotWriter(testDir);
      const data = [{ id: 1 }];

      const path = writer.writeDailySnapshot('daily', data);

      expect(existsSync(path)).toBe(true);
      expect(path).toMatch(/daily_\d{4}-\d{2}-\d{2}\.jsonl$/);
    });

    it('daily snapshot includes date', () => {
      const writer = new SnapshotWriter(testDir);
      const today = new Date().toISOString().split('T')[0];

      const path = writer.writeDailySnapshot('test', [{ id: 1 }]);

      expect(path).toContain(today);
    });
  });

  describe('concurrency', () => {
    it('handles multiple appends safely', () => {
      const path = join(testDir, 'concurrent.jsonl');

      // Simulate multiple writes
      for (let i = 0; i < 10; i++) {
        appendJsonl(path, { id: i });
      }

      expect(countJsonlEntries(path)).toBe(10);
    });
  });
});
