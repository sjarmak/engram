import Database from 'better-sqlite3';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

/**
 * SQLite with WAL mode for concurrent reads and crash recovery
 */

export interface SqliteOptions {
  path: string;
  readonly?: boolean;
  verbose?: boolean;
}

export function initDatabase(options: SqliteOptions): Database.Database {
  const { path, readonly = false, verbose = false } = options;

  const dir = dirname(path);
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // Ignore - directory may exist
  }

  const db = new Database(path, {
    readonly,
    verbose: verbose ? console.log : undefined,
  });

  if (!readonly) {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('wal_autocheckpoint = 1000');
    db.pragma('cache_size = -64000');
    db.pragma('temp_store = MEMORY');
  }

  return db;
}

class DatabasePool {
  private instances = new Map<string, Database.Database>();

  get(options: SqliteOptions): Database.Database {
    const key = `${options.path}:${options.readonly}`;

    let db = this.instances.get(key);
    if (!db) {
      db = initDatabase(options);
      this.instances.set(key, db);
    }

    return db;
  }

  close(path: string): void {
    const keys = [`${path}:false`, `${path}:true`];
    for (const key of keys) {
      const db = this.instances.get(key);
      if (db) {
        db.close();
        this.instances.delete(key);
      }
    }
  }

  closeAll(): void {
    for (const db of this.instances.values()) {
      db.close();
    }
    this.instances.clear();
  }
}

export const pool = new DatabasePool();

export function getDatabase(options: SqliteOptions): Database.Database {
  return pool.get(options);
}

export function closeDatabase(path: string): void {
  pool.close(path);
}

export function closeAllDatabases(): void {
  pool.closeAll();
}
