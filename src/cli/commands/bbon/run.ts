import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CommandContext } from '../../index.js';
import { getDatabase } from '../../../store/sqlite.js';
import { Repository } from '../../../store/repository.js';
import { learnCommand, LearnResult } from '../learn.js';

const TaskSpecSchema = z.object({
  goal: z.string(),
  beadId: z.string().optional(),
  constraints: z.array(z.string()).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

type TaskSpec = z.infer<typeof TaskSpecSchema>;

export interface BbonRunResult {
  runId: string;
  taskId: string;
  n: number;
  seed: number;
  attempts: Array<{
    id: string;
    ordinal: number;
    status: string;
    completedAt?: string;
  }>;
  createdAt: string;
}

async function readAllStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

export async function bbonRunCommand(
  ctx: CommandContext,
  cwd: string = process.cwd()
): Promise<BbonRunResult> {
  const dbPath = join(cwd, '.engram', 'engram.db');
  if (!existsSync(dbPath)) {
    throw new Error('Database not initialized (run: en init)');
  }

  let raw = '';
  const arg0 = ctx.args[0];

  if (arg0 && existsSync(arg0)) {
    raw = readFileSync(arg0, 'utf8');
  } else if (!arg0 && !process.stdin.isTTY) {
    raw = await readAllStdin();
  } else if (arg0) {
    raw = arg0;
  } else {
    throw new Error(
      'No task spec provided. Provide JSON via stdin, or pass a file path or JSON string as the first argument.'
    );
  }

  let taskSpec: TaskSpec;
  try {
    const parsed = JSON.parse(raw);
    taskSpec = TaskSpecSchema.parse(parsed);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const errors = err.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`);
      throw new Error(`Invalid task spec: ${errors.join(', ')}`);
    }
    throw new Error(
      `Failed to parse task spec JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const n = ctx.options.n ? parseInt(ctx.options.n as string, 10) : 3;
  if (isNaN(n) || n < 1) {
    throw new Error('--n must be a positive integer');
  }

  const seed = ctx.options.seed ? parseInt(ctx.options.seed as string, 10) : Date.now();
  if (isNaN(seed)) {
    throw new Error('--seed must be an integer');
  }

  const configJson = ctx.options.config
    ? JSON.parse(readFileSync(ctx.options.config as string, 'utf8'))
    : {};

  const db = getDatabase({ path: dbPath });
  const repo = new Repository(db);

  const task = repo.addTask({
    beadId: taskSpec.beadId,
    spec: taskSpec,
  });

  if (!ctx.options.json) {
    console.error(`✓ Task created: ${task.id.slice(0, 8)}`);
    console.error(`  Goal: ${taskSpec.goal}`);
    if (taskSpec.beadId) {
      console.error(`  Bead: ${taskSpec.beadId}`);
    }
  }

  const run = repo.addBbonRun({
    taskId: task.id,
    n,
    seed,
    config: configJson,
  });

  if (!ctx.options.json) {
    console.error(`✓ Run created: ${run.id.slice(0, 8)}`);
    console.error(`  N: ${n}`);
    console.error(`  Seed: ${seed}`);
    console.error('');
  }

  const attemptResults: Array<{
    id: string;
    ordinal: number;
    status: string;
    completedAt?: string;
  }> = [];

  for (let i = 0; i < n; i++) {
    const attempt = repo.addAttempt({
      runId: run.id,
      ordinal: i,
      status: 'pending',
      result: {},
    });

    if (!ctx.options.json) {
      console.error(`[${i + 1}/${n}] Starting attempt ${attempt.id.slice(0, 8)}...`);
    }

    repo.updateAttempt(attempt.id, { status: 'running' });

    let attemptStatus: 'completed' | 'failed' = 'completed';
    let learnResult: LearnResult | null = null;

    try {
      const stepCtx: CommandContext = {
        ...ctx,
        options: { ...ctx.options, json: false },
      };

      repo.addAttemptStep({
        attemptId: attempt.id,
        stepIndex: 0,
        kind: 'reflect',
        input: { task: taskSpec },
        output: {},
        observation: {},
      });

      if (!ctx.options.json) {
        console.error(`  → Running reflect/curate/apply cycle...`);
      }

      learnResult = await learnCommand(stepCtx, cwd);

      repo.addAttemptStep({
        attemptId: attempt.id,
        stepIndex: 1,
        kind: 'learn_complete',
        input: {},
        output: learnResult as unknown as Record<string, unknown>,
        observation: {},
      });

      if (!ctx.options.json) {
        console.error(`  ✓ Attempt ${i + 1} completed`);
        console.error(`    Insights: ${learnResult.reflect.insightCount}`);
        console.error(`    Knowledge items: ${learnResult.curate.promoted}`);
      }
    } catch (err) {
      attemptStatus = 'failed';
      const errorMessage = err instanceof Error ? err.message : String(err);

      repo.addAttemptStep({
        attemptId: attempt.id,
        stepIndex: learnResult ? 1 : 0,
        kind: 'error',
        input: {},
        output: {},
        observation: { error: errorMessage },
      });

      if (!ctx.options.json) {
        console.error(`  ✗ Attempt ${i + 1} failed: ${errorMessage}`);
      }
    }

    const completedAt = new Date().toISOString();
    repo.updateAttempt(attempt.id, {
      status: attemptStatus,
      result: learnResult ? (learnResult as unknown as Record<string, unknown>) : {},
      completedAt,
    });

    attemptResults.push({
      id: attempt.id,
      ordinal: i,
      status: attemptStatus,
      completedAt,
    });

    if (!ctx.options.json) {
      console.error('');
    }
  }

  if (!ctx.options.json) {
    const completed = attemptResults.filter(a => a.status === 'completed').length;
    const failed = attemptResults.filter(a => a.status === 'failed').length;
    console.error(`✓ Run complete: ${completed} completed, ${failed} failed`);
    console.error(`  Run ID: ${run.id.slice(0, 8)}`);
    console.error(`  Next: en bbon judge --run ${run.id.slice(0, 8)}`);
  }

  return {
    runId: run.id,
    taskId: task.id,
    n: run.n,
    seed: run.seed,
    attempts: attemptResults,
    createdAt: run.createdAt,
  };
}
