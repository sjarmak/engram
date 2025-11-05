import { CommandContext } from '../index.js';
import { existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase } from '../../store/sqlite.js';
import { runMigrations } from '../../store/migrations.js';
import { execSync } from 'node:child_process';

export interface InitResult {
  steps: Array<{
    name: string;
    status: 'completed' | 'skipped' | 'failed';
    message: string;
  }>;
  success: boolean;
}

export async function initCommand(
  ctx: CommandContext,
  cwd: string = process.cwd()
): Promise<InitResult> {
  const steps: InitResult['steps'] = [];
  let success = true;

  if (!ctx.options.json) {
    console.error('Initializing Engram...\n');
  }

  // Step 1: Check for git repository
  const gitExists = existsSync(join(cwd, '.git'));
  if (!gitExists) {
    steps.push({
      name: 'git-check',
      status: 'failed',
      message: 'Not a git repository. Initialize git first: git init',
    });
    success = false;

    if (!ctx.options.json) {
      console.error('✗ Git repository not found');
      console.error('  Run: git init');
    }

    return { steps, success };
  }

  steps.push({
    name: 'git-check',
    status: 'completed',
    message: 'Git repository verified',
  });

  if (!ctx.options.json) {
    console.error('✓ Git repository verified');
  }

  // Step 2: Initialize bd (beads) if not already done
  try {
    const beadsExists = existsSync(join(cwd, '.beads'));
    if (!beadsExists) {
      execSync('bd init', { stdio: 'pipe', cwd });
      steps.push({
        name: 'bd-init',
        status: 'completed',
        message: 'Beads initialized',
      });
      if (!ctx.options.json) {
        console.error('✓ Beads initialized');
      }
    } else {
      steps.push({
        name: 'bd-init',
        status: 'skipped',
        message: 'Beads already initialized',
      });
      if (!ctx.options.json) {
        console.error('✓ Beads already initialized');
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    steps.push({
      name: 'bd-init',
      status: 'failed',
      message: `Failed to initialize beads: ${message}`,
    });
    if (!ctx.options.json) {
      console.error('⚠ Beads initialization failed (optional)');
    }
  }

  // Step 3: Create .engram directory and database
  const aceDbPath = join(cwd, '.engram', 'engram.db');
  const aceDbExists = existsSync(aceDbPath);

  if (!aceDbExists) {
    const db = getDatabase({ path: aceDbPath });

    steps.push({
      name: 'database-create',
      status: 'completed',
      message: 'Database created',
    });

    if (!ctx.options.json) {
      console.error('✓ Database created');
    }

    // Step 4: Run migrations
    const migrationResult = runMigrations(db);

    steps.push({
      name: 'migrations',
      status: 'completed',
      message: `Applied ${migrationResult.applied} migration(s) to version ${migrationResult.current}`,
    });

    if (!ctx.options.json) {
      console.error(`✓ Applied ${migrationResult.applied} migration(s)`);
    }
  } else {
    steps.push({
      name: 'database-create',
      status: 'skipped',
      message: 'Database already exists',
    });

    if (!ctx.options.json) {
      console.error('✓ Database already exists');
    }

    // Still check for pending migrations
    const db = getDatabase({ path: aceDbPath });
    const migrationResult = runMigrations(db);

    if (migrationResult.applied > 0) {
      steps.push({
        name: 'migrations',
        status: 'completed',
        message: `Applied ${migrationResult.applied} pending migration(s)`,
      });

      if (!ctx.options.json) {
        console.error(`✓ Applied ${migrationResult.applied} pending migration(s)`);
      }
    } else {
      steps.push({
        name: 'migrations',
        status: 'skipped',
        message: 'All migrations up to date',
      });

      if (!ctx.options.json) {
        console.error('✓ Migrations up to date');
      }
    }
  }

  // Step 5: Create AGENTS.md if it doesn't exist
  const agentsMdPath = join(cwd, 'AGENTS.md');
  if (!existsSync(agentsMdPath)) {
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const templatePath = join(__dirname, '..', '..', '..', 'templates', 'AGENTS.md');

      copyFileSync(templatePath, agentsMdPath);

      steps.push({
        name: 'agents-md',
        status: 'completed',
        message: 'Created AGENTS.md from template',
      });

      if (!ctx.options.json) {
        console.error('✓ Created AGENTS.md');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      steps.push({
        name: 'agents-md',
        status: 'failed',
        message: `Failed to create AGENTS.md: ${message}`,
      });
      if (!ctx.options.json) {
        console.error('⚠ AGENTS.md creation failed (optional)');
      }
    }
  } else {
    steps.push({
      name: 'agents-md',
      status: 'skipped',
      message: 'AGENTS.md already exists',
    });

    if (!ctx.options.json) {
      console.error('✓ AGENTS.md already exists');
    }
  }

  if (!ctx.options.json) {
    console.error('\n✓ Initialization complete');
    console.error('  Run: en doctor');
  }

  return { steps, success };
}
