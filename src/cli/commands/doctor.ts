import { CommandContext } from '../index.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface DoctorResult {
  checks: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message?: string;
  }>;
  overall: 'healthy' | 'issues';
}

export async function doctorCommand(ctx: CommandContext): Promise<DoctorResult> {
  const checks: DoctorResult['checks'] = [];

  const gitExists = existsSync('.git');
  checks.push({
    name: 'git-repository',
    status: gitExists ? 'pass' : 'fail',
    message: gitExists ? 'Git repository found' : 'Not a git repository',
  });

  const aceDbPath = join('.engram', 'engram.db');
  const aceDbExists = existsSync(aceDbPath);
  checks.push({
    name: 'ace-database',
    status: aceDbExists ? 'pass' : 'warn',
    message: aceDbExists ? 'Database exists' : 'Database not initialized (run: en init)',
  });

  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  const nodeOk = majorVersion >= 18;
  checks.push({
    name: 'node-version',
    status: nodeOk ? 'pass' : 'fail',
    message: `Node ${nodeVersion} (requires >= 18)`,
  });

  const overall = checks.some(c => c.status === 'fail') ? 'issues' : 'healthy';

  if (!ctx.options.json) {
    console.error('Engram Doctor - System Diagnostics\n');
    for (const check of checks) {
      const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
      console.error(`${icon} ${check.name}: ${check.message}`);
    }
    console.error(`\nOverall: ${overall}`);
  }

  return { checks, overall };
}
