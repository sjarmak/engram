import Database from 'better-sqlite3';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

/**
 * SQLite database connection with WAL mode enabled
 * 
 * WAL (Write-Ahead Logging) mode provides:
 * - Concurrent reads while writing
 * - Better performance for write-heavy workloads
 * - Crash recovery
 */

export interface SqliteOptions {
  path: string;
  readonly?: boolean;
  verbose?: boolean;
}

/**
 * Initialize SQLite database with WAL mode
 */
export function initDatabase(options: SqliteOptions): Database.Database {
  const { path, readonly = false, verbose = false } = options;

  // Ensure directory exists
  const dir = dirname(path);
  try {
    mkdirSync(dir, { recursive: true });
  } catch (err) {
    // Directory might already exist
  }

  // Open database
  const db = new Database(path, {
    readonly,
    verbose: verbose ? console.log : undefined,
  });

  // Enable WAL mode (only if not readonly)
  if (!readonly) {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    
    // Optimize for concurrency
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('wal_autocheckpoint = 1000');
    
    // Performance tuning
    db.pragma('cache_size = -64000'); // 64MB cache
    db.pragma('temp_store = MEMORY');
  }

  return db;
}

/**
 * Singleton database instance manager
 */
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

/**
 * Get or create database connection from pool
 */
export function getDatabase(options: SqliteOptions): Database.Database {
  return pool.get(options);
}

/**
 * Close database connection(s)
 */
export function closeDatabase(path: string): void {
  pool.close(path);
}

/**
 * Close all database connections
 */
export function closeAllDatabases(): void {
  pool.closeAll();
}
