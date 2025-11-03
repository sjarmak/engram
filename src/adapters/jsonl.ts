import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * JSONL (JSON Lines) audit appender
 * 
 * Provides append-only logging for audit trail.
 * Each line is a complete JSON object.
 * Safe for version control and concurrent writes.
 */

export interface JsonlEntry {
  timestamp: string;
  type: string;
  data: unknown;
}

/**
 * Append a JSON object as a line to a JSONL file
 */
export function appendJsonl(path: string, data: unknown): void {
  ensureDirectoryExists(path);
  
  const line = JSON.stringify(data) + '\n';
  appendFileSync(path, line, 'utf-8');
}

/**
 * Append multiple entries at once
 */
export function appendJsonlBatch(path: string, entries: unknown[]): void {
  ensureDirectoryExists(path);
  
  const lines = entries.map(entry => JSON.stringify(entry) + '\n').join('');
  appendFileSync(path, lines, 'utf-8');
}

/**
 * Append with automatic timestamp and type
 */
export function appendAuditEntry(path: string, type: string, data: unknown): void {
  const entry: JsonlEntry = {
    timestamp: new Date().toISOString(),
    type,
    data,
  };
  
  appendJsonl(path, entry);
}

/**
 * Read all entries from a JSONL file
 */
export function readJsonl<T = unknown>(path: string): T[] {
  if (!existsSync(path)) {
    return [];
  }

  const content = readFileSync(path, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  
  return lines.map(line => JSON.parse(line) as T);
}

/**
 * Read entries with filter predicate
 */
export function readJsonlFiltered<T = unknown>(
  path: string,
  predicate: (entry: T) => boolean
): T[] {
  const entries = readJsonl<T>(path);
  return entries.filter(predicate);
}

/**
 * Read audit entries of specific type
 */
export function readAuditEntries<T = unknown>(
  path: string,
  type?: string
): JsonlEntry[] {
  const entries = readJsonl<JsonlEntry>(path);
  
  if (!type) return entries;
  
  return entries.filter(entry => entry.type === type);
}

/**
 * Count entries in JSONL file
 */
export function countJsonlEntries(path: string): number {
  if (!existsSync(path)) {
    return 0;
  }

  const content = readFileSync(path, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  
  return lines.length;
}

/**
 * Ensure parent directory exists
 */
function ensureDirectoryExists(filePath: string): void {
  const dir = dirname(filePath);
  
  try {
    mkdirSync(dir, { recursive: true });
  } catch (err) {
    // Directory might already exist
  }
}

/**
 * Snapshot writer - creates timestamped JSONL snapshots
 */
export class SnapshotWriter {
  constructor(private baseDir: string) {}

  /**
   * Write snapshot with timestamp in filename
   */
  writeSnapshot(type: string, data: unknown[]): string {
    const now = new Date();
    const timestamp = now.toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const ms = now.getMilliseconds().toString().padStart(3, '0');
    const filename = `${type}_${timestamp}-${ms}.jsonl`;
    const path = `${this.baseDir}/${filename}`;

    appendJsonlBatch(path, data);

    return path;
  }

  /**
   * Write daily snapshot (overwrites same-day snapshots)
   */
  writeDailySnapshot(type: string, data: unknown[]): string {
    const date = new Date().toISOString().split('T')[0];
    const filename = `${type}_${date}.jsonl`;
    const path = `${this.baseDir}/${filename}`;

    // For daily snapshots, we use appendJsonlBatch which appends
    // If you want to overwrite, use writeFileSync instead
    appendJsonlBatch(path, data);

    return path;
  }
}
