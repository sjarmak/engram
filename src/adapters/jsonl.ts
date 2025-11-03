import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Append-only JSONL logging for audit trail
 * 
 * Each line is a JSON object. Suitable for version control.
 * Append is typically atomic on POSIX for small lines.
 */

export interface JsonlEntry {
  timestamp: string;
  type: string;
  data: unknown;
}

export function appendJsonl(path: string, data: unknown): void {
  ensureDirectoryExists(path);
  
  const line = JSON.stringify(data) + '\n';
  appendFileSync(path, line, 'utf-8');
}

export function appendJsonlBatch(path: string, entries: unknown[]): void {
  ensureDirectoryExists(path);
  
  const lines = entries.map(entry => JSON.stringify(entry) + '\n').join('');
  appendFileSync(path, lines, 'utf-8');
}

export function appendAuditEntry(path: string, type: string, data: unknown): void {
  const entry: JsonlEntry = {
    timestamp: new Date().toISOString(),
    type,
    data,
  };
  
  appendJsonl(path, entry);
}

export function readJsonl<T = unknown>(path: string): T[] {
  if (!existsSync(path)) {
    return [];
  }

  const content = readFileSync(path, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  
  return lines.map(line => JSON.parse(line) as T);
}

export function readJsonlFiltered<T = unknown>(
  path: string,
  predicate: (entry: T) => boolean
): T[] {
  const entries = readJsonl<T>(path);
  return entries.filter(predicate);
}

export function readAuditEntries<T = unknown>(
  path: string,
  type?: string
): JsonlEntry[] {
  const entries = readJsonl<JsonlEntry>(path);
  
  if (!type) return entries;
  
  return entries.filter(entry => entry.type === type);
}

export function countJsonlEntries(path: string): number {
  if (!existsSync(path)) {
    return 0;
  }

  const content = readFileSync(path, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  
  return lines.length;
}

function ensureDirectoryExists(filePath: string): void {
  const dir = dirname(filePath);
  
  try {
    mkdirSync(dir, { recursive: true });
  } catch (err) {
    // Ignore - directory may exist
  }
}

export class SnapshotWriter {
  constructor(private baseDir: string) {}

  writeSnapshot(type: string, data: unknown[]): string {
    const now = new Date();
    const timestamp = now.toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const ms = now.getMilliseconds().toString().padStart(3, '0');
    const filename = `${type}_${timestamp}-${ms}.jsonl`;
    const path = `${this.baseDir}/${filename}`;

    appendJsonlBatch(path, data);

    return path;
  }

  writeDailySnapshot(type: string, data: unknown[]): string {
    const date = new Date().toISOString().split('T')[0];
    const filename = `${type}_${date}.jsonl`;
    const path = `${this.baseDir}/${filename}`;

    appendJsonlBatch(path, data);

    return path;
  }
}
