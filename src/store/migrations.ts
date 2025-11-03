import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Migration {
  version: number;
  filename: string;
  sql: string;
}

export interface MigrationStatus {
  version: number;
  appliedAt: string;
}

/**
 * Load all migration files from the migrations directory
 */
export function loadMigrations(): Migration[] {
  const migrationsDir = join(__dirname, 'migrations');
  
  let files: string[];
  try {
    files = readdirSync(migrationsDir);
  } catch (err) {
    return [];
  }

  const migrations: Migration[] = [];

  for (const filename of files) {
    if (!filename.endsWith('.sql')) continue;

    // Extract version from filename (e.g., "0001_init.sql" -> 1)
    const match = filename.match(/^(\d+)_/);
    if (!match) continue;

    const version = parseInt(match[1], 10);
    const sql = readFileSync(join(migrationsDir, filename), 'utf-8');

    migrations.push({ version, filename, sql });
  }

  // Sort by version
  return migrations.sort((a, b) => a.version - b.version);
}

/**
 * Get current schema version from database
 */
export function getCurrentVersion(db: Database.Database): number {
  try {
    const result = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number | null };
    return result.version ?? 0;
  } catch (err) {
    // schema_version table doesn't exist yet
    return 0;
  }
}

/**
 * Get all applied migrations
 */
export function getAppliedMigrations(db: Database.Database): MigrationStatus[] {
  try {
    return db.prepare('SELECT version, applied_at as appliedAt FROM schema_version ORDER BY version').all() as MigrationStatus[];
  } catch (err) {
    return [];
  }
}

/**
 * Apply a single migration
 */
export function applyMigration(db: Database.Database, migration: Migration): void {
  const apply = db.transaction(() => {
    db.exec(migration.sql);
  });

  apply();
}

/**
 * Run pending migrations
 */
export function runMigrations(db: Database.Database): { applied: number; current: number } {
  const currentVersion = getCurrentVersion(db);
  const migrations = loadMigrations();
  
  const pending = migrations.filter(m => m.version > currentVersion);
  
  for (const migration of pending) {
    applyMigration(db, migration);
  }

  const newVersion = getCurrentVersion(db);
  
  return {
    applied: pending.length,
    current: newVersion,
  };
}

/**
 * Check if migrations are needed
 */
export function needsMigration(db: Database.Database): boolean {
  const currentVersion = getCurrentVersion(db);
  const migrations = loadMigrations();
  
  if (migrations.length === 0) return false;
  
  const latestVersion = Math.max(...migrations.map(m => m.version));
  return currentVersion < latestVersion;
}

/**
 * Get migration status summary
 */
export function getMigrationStatus(db: Database.Database): {
  current: number;
  latest: number;
  pending: number;
  applied: MigrationStatus[];
} {
  const currentVersion = getCurrentVersion(db);
  const migrations = loadMigrations();
  const latestVersion = migrations.length > 0 ? Math.max(...migrations.map(m => m.version)) : 0;
  const pending = migrations.filter(m => m.version > currentVersion).length;
  const applied = getAppliedMigrations(db);

  return {
    current: currentVersion,
    latest: latestVersion,
    pending,
    applied,
  };
}
