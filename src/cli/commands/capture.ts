import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CommandContext } from '../index.js';
import { getDatabase } from '../../store/sqlite.js';
import { Repository } from '../../store/repository.js';
import { ExecutionSchema } from '../../schemas/knowledge.js';

const CaptureInputSchema = z.object({
  beadId: z.string(),
  taskDescription: z.string().optional(),
  threadId: z.string().optional(),
  executions: z.array(ExecutionSchema),
  outcome: z.enum(['success', 'failure', 'partial']),
  discoveredIssues: z.array(z.string()).default([]),
});

type CaptureInput = z.infer<typeof CaptureInputSchema>;

export interface CaptureResult {
  traceId: string;
  beadId: string;
  outcome: 'success' | 'failure' | 'partial';
  executionCount: number;
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

export async function captureCommand(
  ctx: CommandContext,
  cwd: string = process.cwd()
): Promise<CaptureResult> {
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
      'No input provided. Provide JSON via stdin, or pass a file path or JSON string as the first argument.'
    );
  }

  let input: CaptureInput;
  try {
    const parsed = JSON.parse(raw);
    input = CaptureInputSchema.parse(parsed);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const errors = err.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`);
      throw new Error(`Invalid trace data: ${errors.join(', ')}`);
    }
    throw new Error(
      `Failed to parse input JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const dbPath = join(cwd, '.engram', 'engram.db');
  if (!existsSync(dbPath)) {
    throw new Error('Database not initialized (run: en init)');
  }

  const db = getDatabase({ path: dbPath });
  const repo = new Repository(db);

  const trace = repo.addTrace({
    beadId: input.beadId,
    taskDescription: input.taskDescription,
    threadId: input.threadId,
    executions: input.executions,
    outcome: input.outcome,
    discoveredIssues: input.discoveredIssues,
  });

  if (!ctx.options.json) {
    console.error(
      `✓ Trace captured: ${trace.id.slice(0, 8)} (${trace.executions.length} executions)`
    );
  }

  return {
    traceId: trace.id,
    beadId: trace.beadId,
    outcome: trace.outcome,
    executionCount: trace.executions.length,
    createdAt: trace.createdAt,
  };
}
