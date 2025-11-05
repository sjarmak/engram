import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { CommandContext } from '../index.js';
import { reflectCommand, ReflectResult } from './reflect.js';
import { curateCommand, CurateResult } from './curate.js';
import { applyCommand, ApplyResult } from './apply.js';

export interface LearnResult {
  reflect: ReflectResult;
  curate: CurateResult;
  apply: ApplyResult;
}

const ArgsSchema = z.array(z.coerce.number().min(0).max(1)).max(1).optional();

function preflight(cwd: string): void {
  const dbPath = join(cwd, '.engram', 'engram.db');
  if (!existsSync(dbPath)) {
    throw new Error('Database not initialized (run: en init)');
  }

  const agentsMdPath = join(cwd, 'AGENTS.md');
  if (!existsSync(agentsMdPath)) {
    throw new Error('AGENTS.md not found (run: af init)');
  }

  const content = readFileSync(agentsMdPath, 'utf8');
  const begin = content.indexOf('<!-- BEGIN: LEARNED_PATTERNS -->');
  const end = content.indexOf('<!-- END: LEARNED_PATTERNS -->');

  if (begin === -1 || end === -1 || end <= begin) {
    throw new Error(
      'AGENTS.md missing required HTML comment markers (<!-- BEGIN: LEARNED_PATTERNS --> and <!-- END: LEARNED_PATTERNS -->) or markers in wrong order'
    );
  }
}

export async function learnCommand(
  ctx: CommandContext,
  cwd: string = process.cwd()
): Promise<LearnResult> {
  const parsed = ArgsSchema.safeParse(ctx.args ?? []);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`);
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }

  const minConfidenceArg = parsed.data?.[0];
  const curateCtx: CommandContext = {
    ...ctx,
    args: minConfidenceArg !== undefined ? [String(minConfidenceArg)] : [],
  };

  if (!ctx.options.json) {
    console.error('Starting learning loop: reflect → curate → apply');
  }

  try {
    preflight(cwd);
  } catch (err) {
    if (!ctx.options.json) {
      console.error('✗ Preflight failed');
    }
    throw new Error('Preflight failed', { cause: err as Error });
  }

  let reflectResult: ReflectResult;
  let curateResult: CurateResult;
  let applyResult: ApplyResult;

  try {
    if (!ctx.options.json) {
      console.error('\n[1/3] Reflecting on execution traces...');
    }
    reflectResult = await reflectCommand(ctx, cwd);
  } catch (err) {
    if (!ctx.options.json) {
      console.error('✗ Reflect step failed');
    }
    throw new Error(`Reflect step failed: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err as Error,
    });
  }

  try {
    if (!ctx.options.json) {
      console.error('\n[2/3] Curating insights into knowledge...');
    }
    curateResult = await curateCommand(curateCtx, cwd);
  } catch (err) {
    if (!ctx.options.json) {
      console.error('✗ Curate step failed');
    }
    throw new Error(`Curate step failed: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err as Error,
    });
  }

  try {
    if (!ctx.options.json) {
      console.error('\n[3/3] Applying knowledge to AGENTS.md...');
    }
    applyResult = await applyCommand(ctx, cwd);
  } catch (err) {
    if (!ctx.options.json) {
      console.error('✗ Apply step failed');
    }
    throw new Error(`Apply step failed: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err as Error,
    });
  }

  if (!ctx.options.json) {
    console.error('\n✓ Learning loop complete');
    console.error(`  Insights: ${reflectResult.insightCount}`);
    console.error(`  Knowledge items: ${curateResult.promoted}`);
    console.error(`  Rendered: ${applyResult.knowledgeCount}`);
  }

  return {
    reflect: reflectResult,
    curate: curateResult,
    apply: applyResult,
  };
}
