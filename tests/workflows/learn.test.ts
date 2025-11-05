import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CommandContext } from '../../src/cli/index.js';
import { initCommand } from '../../src/cli/commands/init.js';
import { captureCommand } from '../../src/cli/commands/capture.js';
import { learnCommand, LearnResult } from '../../src/cli/commands/learn.js';
import { closeAllDatabases, getDatabase } from '../../src/store/sqlite.js';
import { Repository } from '../../src/store/repository.js';

describe('learn loop E2E', () => {
  let testDir: string;
  let ctx: CommandContext;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'engram-learn-e2e-'));
    mkdirSync(join(testDir, '.git'));
    mkdirSync(join(testDir, '.beads'));

    ctx = {
      args: [],
      options: { json: true, verbose: false },
    };

    await initCommand(ctx, testDir);
  });

  afterEach(() => {
    closeAllDatabases();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Cleanup might fail
    }
  });

  it('completes full learning cycle: capture → reflect → curate → apply', async () => {
    const captureCtx: CommandContext = {
      args: [],
      options: { json: true, verbose: false },
    };

    const traceData = {
      beadId: 'test-bead-1',
      executions: [
        {
          runner: 'tsc',
          command: 'npm run build',
          status: 'fail',
          errors: [
            {
              tool: 'tsc',
              severity: 'error',
              message: 'Property does not exist on type',
              file: 'src/test.ts',
              line: 42,
            },
          ],
        },
      ],
      outcome: 'failure',
    };

    writeFileSync(join(testDir, 'trace.json'), JSON.stringify(traceData));

    captureCtx.args = [join(testDir, 'trace.json')];
    await captureCommand(captureCtx, testDir);

    const result = (await learnCommand(ctx, testDir)) as LearnResult;

    expect(result.reflect.traceCount).toBe(1);
    expect(result.reflect.insightCount).toBeGreaterThan(0);
    expect(result.curate.promoted).toBeGreaterThan(0);
    expect(result.apply.rendered).toBe(true);

    const agentsMd = readFileSync(join(testDir, 'AGENTS.md'), 'utf8');
    expect(agentsMd).toContain('<!-- BEGIN: LEARNED_PATTERNS -->');
    expect(agentsMd).toContain('<!-- END: LEARNED_PATTERNS -->');
  });

  it('handles multiple failed traces and generates insights', async () => {
    const captureCtx: CommandContext = {
      args: [],
      options: { json: true, verbose: false },
    };

    const trace1 = {
      beadId: 'test-bead-1',
      executions: [
        {
          runner: 'tsc',
          command: 'npm run build',
          status: 'fail',
          errors: [
            {
              tool: 'tsc',
              severity: 'error',
              message: 'Type error in component',
              file: 'src/component.ts',
              line: 10,
            },
          ],
        },
      ],
      outcome: 'failure',
    };

    const trace2 = {
      beadId: 'test-bead-2',
      executions: [
        {
          runner: 'tsc',
          command: 'npm run build',
          status: 'fail',
          errors: [
            {
              tool: 'tsc',
              severity: 'error',
              message: 'Type error in component',
              file: 'src/component.ts',
              line: 15,
            },
          ],
        },
      ],
      outcome: 'failure',
    };

    writeFileSync(join(testDir, 'trace1.json'), JSON.stringify(trace1));
    writeFileSync(join(testDir, 'trace2.json'), JSON.stringify(trace2));

    captureCtx.args = [join(testDir, 'trace1.json')];
    await captureCommand(captureCtx, testDir);

    captureCtx.args = [join(testDir, 'trace2.json')];
    await captureCommand(captureCtx, testDir);

    const result = (await learnCommand(ctx, testDir)) as LearnResult;

    expect(result.reflect.traceCount).toBe(2);
    expect(result.reflect.insightCount).toBeGreaterThan(0);

    const firstInsight = result.reflect.insights[0];
    expect(firstInsight.confidence).toBeGreaterThan(0);
    expect(firstInsight.pattern).toContain('tsc');
  });

  it('is idempotent - running learn twice does not duplicate knowledge', async () => {
    const captureCtx: CommandContext = {
      args: [],
      options: { json: true, verbose: false },
    };

    const traceData = {
      beadId: 'test-bead-1',
      executions: [
        {
          runner: 'eslint',
          command: 'npm run lint',
          status: 'fail',
          errors: [
            {
              tool: 'eslint',
              severity: 'error',
              message: 'Missing semicolon',
              file: 'src/utils.ts',
              line: 5,
            },
          ],
        },
      ],
      outcome: 'failure',
    };

    writeFileSync(join(testDir, 'trace.json'), JSON.stringify(traceData));

    captureCtx.args = [join(testDir, 'trace.json')];
    await captureCommand(captureCtx, testDir);

    const firstRun = (await learnCommand(ctx, testDir)) as LearnResult;
    const firstKnowledgeCount = firstRun.apply.knowledgeCount;

    const secondRun = (await learnCommand(ctx, testDir)) as LearnResult;

    expect(secondRun.curate.promoted).toBe(0);
    expect(secondRun.apply.knowledgeCount).toBe(firstKnowledgeCount);
  });

  it('applies knowledge to AGENTS.md with correct format', async () => {
    const captureCtx: CommandContext = {
      args: [],
      options: { json: true, verbose: false },
    };

    const traceData = {
      beadId: 'test-bead-1',
      executions: [
        {
          runner: 'vitest',
          command: 'npm test',
          status: 'fail',
          errors: [
            {
              tool: 'vitest',
              severity: 'error',
              message: 'Test timeout exceeded',
              file: 'tests/integration.test.ts',
              line: 100,
            },
          ],
        },
      ],
      outcome: 'failure',
    };

    writeFileSync(join(testDir, 'trace.json'), JSON.stringify(traceData));

    captureCtx.args = [join(testDir, 'trace.json')];
    await captureCommand(captureCtx, testDir);

    await learnCommand(ctx, testDir);

    const agentsMd = readFileSync(join(testDir, 'AGENTS.md'), 'utf8');

    const beginMarker = '<!-- BEGIN: LEARNED_PATTERNS -->';
    const endMarker = '<!-- END: LEARNED_PATTERNS -->';

    expect(agentsMd.indexOf(beginMarker)).toBeGreaterThan(-1);
    expect(agentsMd.indexOf(endMarker)).toBeGreaterThan(-1);
    expect(agentsMd.indexOf(endMarker)).toBeGreaterThan(agentsMd.indexOf(beginMarker));
  });

  it('correctly deletes insights after promotion to knowledge', async () => {
    const db = getDatabase({ path: join(testDir, '.engram/engram.db') });
    const repo = new Repository(db);

    const captureCtx: CommandContext = {
      args: [],
      options: { json: true, verbose: false },
    };

    const traceData = {
      beadId: 'test-bead-1',
      executions: [
        {
          runner: 'tsc',
          command: 'npm run build',
          status: 'fail',
          errors: [
            {
              tool: 'tsc',
              severity: 'error',
              message: 'Cannot find module',
              file: 'src/index.ts',
              line: 1,
            },
          ],
        },
      ],
      outcome: 'failure',
    };

    writeFileSync(join(testDir, 'trace.json'), JSON.stringify(traceData));

    captureCtx.args = [join(testDir, 'trace.json')];
    await captureCommand(captureCtx, testDir);

    const insightsBeforeLearn = repo.listInsights();
    expect(insightsBeforeLearn.length).toBe(0);

    await learnCommand(ctx, testDir);

    const insightsAfterLearn = repo.listInsights();
    expect(insightsAfterLearn.length).toBe(0);

    const knowledge = repo.listKnowledgeItems({});
    expect(knowledge.length).toBeGreaterThan(0);
  });
});
