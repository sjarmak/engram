import { describe, it, expect } from 'vitest';
import { doctorCommand, DoctorResult } from '../../src/cli/commands/doctor.js';
import { CommandContext } from '../../src/cli/index.js';

describe('doctor command', () => {
  it('runs all checks', async () => {
    const ctx: CommandContext = {
      args: [],
      options: { json: true, verbose: false },
    };

    const result = (await doctorCommand(ctx)) as DoctorResult;

    expect(result.checks).toBeDefined();
    expect(result.checks.length).toBeGreaterThan(0);
    expect(result.overall).toMatch(/healthy|issues/);
  });

  it('checks git repository', async () => {
    const ctx: CommandContext = {
      args: [],
      options: { json: true, verbose: false },
    };

    const result = (await doctorCommand(ctx)) as DoctorResult;
    const gitCheck = result.checks.find(c => c.name === 'git-repository');

    expect(gitCheck).toBeDefined();
    expect(gitCheck?.status).toMatch(/pass|fail/);
  });

  it('checks Node version', async () => {
    const ctx: CommandContext = {
      args: [],
      options: { json: true, verbose: false },
    };

    const result = (await doctorCommand(ctx)) as DoctorResult;
    const nodeCheck = result.checks.find(c => c.name === 'node-version');

    expect(nodeCheck).toBeDefined();
    expect(nodeCheck?.message).toContain('Node');
  });

  it('checks ACE database', async () => {
    const ctx: CommandContext = {
      args: [],
      options: { json: true, verbose: false },
    };

    const result = (await doctorCommand(ctx)) as DoctorResult;
    const dbCheck = result.checks.find(c => c.name === 'ace-database');

    expect(dbCheck).toBeDefined();
    expect(dbCheck?.status).toMatch(/pass|warn|fail/);
  });

  it('returns result structure matching DoctorResult type', async () => {
    const ctx: CommandContext = {
      args: [],
      options: { json: true, verbose: false },
    };

    const result = (await doctorCommand(ctx)) as DoctorResult;

    expect(result).toHaveProperty('checks');
    expect(result).toHaveProperty('overall');
    expect(Array.isArray(result.checks)).toBe(true);

    for (const check of result.checks) {
      expect(check).toHaveProperty('name');
      expect(check).toHaveProperty('status');
    }
  });
});
