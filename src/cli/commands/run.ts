import { z } from 'zod';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CommandContext } from '../index.js';
import { getDatabase } from '../../store/sqlite.js';
import { Repository } from '../../store/repository.js';
import { Run, RunType, RunStatus } from '../../schemas/knowledge.js';

const RunInputSchema = z.object({
  runType: z.enum(['reflect', 'curate', 'learn', 'ci']),
  beadIds: z.array(z.string()).default([]),
  insightsGenerated: z.number().int().min(0).default(0),
  knowledgeAdded: z.number().int().min(0).default(0),
  status: z.enum(['running', 'success', 'failure']).default('running'),
  error: z.string().optional(),
});

type RunInput = z.infer<typeof RunInputSchema>;

export interface RunResult {
  run: Run;
}

export interface RunListResult {
  runs: Run[];
}

export async function runCommand(ctx: CommandContext, cwd: string = process.cwd()): Promise<RunResult | RunListResult> {
  const subcommand = ctx.args[0];

  if (!subcommand) {
    throw new Error('Usage: af run <start|complete|list> [args]');
  }

  const dbPath = join(cwd, '.ace', 'ace.db');
  if (!existsSync(dbPath)) {
    throw new Error('Database not initialized (run: af init)');
  }

  const db = getDatabase({ path: dbPath });
  const repo = new Repository(db);

  switch (subcommand) {
    case 'start':
      return startRun(ctx, repo);
    case 'complete':
      return completeRun(ctx, repo);
    case 'list':
      return listRuns(ctx, repo);
    default:
      throw new Error(`Unknown subcommand: ${subcommand}. Use: start, complete, or list`);
  }
}

async function startRun(ctx: CommandContext, repo: Repository): Promise<RunResult> {
  const runType = ctx.options['type'] as RunType | undefined;
  const beadIdsStr = ctx.options['beads'] as string | undefined;

  if (!runType) {
    throw new Error('Missing required option: --type (reflect|curate|learn|ci)');
  }

  const beadIds = beadIdsStr ? beadIdsStr.split(',') : [];

  const input: RunInput = {
    runType,
    beadIds,
    insightsGenerated: 0,
    knowledgeAdded: 0,
    status: 'running',
  };

  const result = RunInputSchema.safeParse(input);
  if (!result.success) {
    const errors = result.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`);
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }

  const run = repo.addRun({
    ...result.data,
    startedAt: new Date().toISOString(),
  });

  if (!ctx.options.json) {
    console.error(`✓ Started ${runType} run (ID: ${run.id})`);
  }

  return { run };
}

async function completeRun(ctx: CommandContext, repo: Repository): Promise<RunResult> {
  const runId = ctx.args[1];
  const status = ctx.options['status'] as RunStatus | undefined;
  const error = ctx.options['error'] as string | undefined;
  const insightsGenerated = ctx.options['insights'] ? parseInt(ctx.options['insights'] as string, 10) : undefined;
  const knowledgeAdded = ctx.options['knowledge'] ? parseInt(ctx.options['knowledge'] as string, 10) : undefined;

  if (!runId) {
    throw new Error('Usage: af run complete <run-id> --status <success|failure>');
  }

  if (!status) {
    throw new Error('Missing required option: --status (success|failure)');
  }

  const completedAt = new Date().toISOString();

  repo.updateRunStatus(runId, status, completedAt, error, {
    insightsGenerated,
    knowledgeAdded,
  });

  const run = repo.getRun(runId);
  if (!run) {
    throw new Error(`Run not found: ${runId}`);
  }

  if (!ctx.options.json) {
    console.error(`✓ Run ${runId} marked as ${status}`);
    if (insightsGenerated) console.error(`  Insights: ${insightsGenerated}`);
    if (knowledgeAdded) console.error(`  Knowledge: ${knowledgeAdded}`);
  }

  return { run };
}

async function listRuns(ctx: CommandContext, repo: Repository): Promise<RunListResult> {
  const runType = ctx.options['type'] as RunType | undefined;
  const status = ctx.options['status'] as RunStatus | undefined;

  const runs = repo.listRuns({ runType, status });

  if (!ctx.options.json) {
    if (runs.length === 0) {
      console.error('No runs found');
    } else {
      console.error(`Found ${runs.length} run(s):`);
      for (const r of runs) {
        const duration = r.completedAt
          ? `${Math.round((new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime()) / 1000)}s`
          : 'running';
        console.error(`  ${r.runType} [${r.status}] ${duration} (beads: ${r.beadIds.length})`);
      }
    }
  }

  return { runs };
}
