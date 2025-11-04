import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initCommand, InitResult } from '../../src/cli/commands/init.js';
import { CommandContext } from '../../src/cli/index.js';
import { closeAllDatabases } from '../../src/store/sqlite.js';

describe('init command', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'af-init-'));
  });

  afterEach(() => {
    closeAllDatabases();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (err) {
      // Cleanup might fail
    }
  });

  it('fails when not in git repository', async () => {
    const ctx: CommandContext = {
      args: [],
      options: { json: true, verbose: false },
    };

    const result = await initCommand(ctx, testDir) as InitResult;

    expect(result.success).toBe(false);
    const gitCheck = result.steps.find(s => s.name === 'git-check');
    expect(gitCheck?.status).toBe('failed');
  });

  it('creates database and runs migrations in git repo', async () => {
    mkdirSync(join(testDir, '.git'));

    const ctx: CommandContext = {
      args: [],
      options: { json: true, verbose: false },
    };

    const result = await initCommand(ctx, testDir) as InitResult;

    expect(result.success).toBe(true);
    expect(existsSync(join(testDir, '.ace/ace.db'))).toBe(true);
    
    const dbCreate = result.steps.find(s => s.name === 'database-create');
    expect(dbCreate?.status).toBe('completed');
    
    const migrations = result.steps.find(s => s.name === 'migrations');
    expect(migrations?.status).toBe('completed');
  });

  it('is idempotent - safe to run multiple times', async () => {
    mkdirSync(join(testDir, '.git'));

    const ctx: CommandContext = {
      args: [],
      options: { json: true, verbose: false },
    };

    const result1 = await initCommand(ctx, testDir);
    expect(result1.success).toBe(true);

    const result2 = await initCommand(ctx, testDir);
    expect(result2.success).toBe(true);
    
    const dbCreate = result2.steps.find(s => s.name === 'database-create');
    expect(dbCreate?.status).toBe('skipped');
  });

  it('returns all step results', async () => {
    mkdirSync(join(testDir, '.git'));

    const ctx: CommandContext = {
      args: [],
      options: { json: true, verbose: false },
    };

    const result = await initCommand(ctx, testDir) as InitResult;

    expect(result.steps).toBeDefined();
    expect(Array.isArray(result.steps)).toBe(true);
    expect(result.steps.length).toBeGreaterThan(0);
    
    for (const step of result.steps) {
      expect(step).toHaveProperty('name');
      expect(step).toHaveProperty('status');
      expect(step).toHaveProperty('message');
      expect(['completed', 'skipped', 'failed']).toContain(step.status);
    }
  });

  it('handles existing .ace directory gracefully', async () => {
    mkdirSync(join(testDir, '.git'));
    mkdirSync(join(testDir, '.ace'));

    const ctx: CommandContext = {
      args: [],
      options: { json: true, verbose: false },
    };

    const result = await initCommand(ctx, testDir) as InitResult;

    expect(result.success).toBe(true);
    expect(existsSync(join(testDir, '.ace/ace.db'))).toBe(true);
  });

  it('checks for pending migrations on re-init', async () => {
    mkdirSync(join(testDir, '.git'));

    const ctx: CommandContext = {
      args: [],
      options: { json: true, verbose: false },
    };

    await initCommand(ctx, testDir);
    const result2 = await initCommand(ctx, testDir);

    const migrations = result2.steps.find(s => s.name === 'migrations');
    expect(migrations?.status).toBe('skipped');
    expect(migrations?.message).toContain('up to date');
  });
});
