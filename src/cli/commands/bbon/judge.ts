import { z } from 'zod';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CommandContext } from '../../index.js';
import { getDatabase } from '../../../store/sqlite.js';
import { Repository } from '../../../store/repository.js';
import { generateNarrativeDiff } from '../../../agents/judge/narrativeDiff.js';
import { compareAttempts, computeJudgeCacheKey } from '../../../agents/judge/comparativeJudge.js';

export interface BbonJudgeResult {
  runId: string;
  pairsJudged: number;
  outcomes: Array<{
    pairId: string;
    leftAttemptId: string;
    rightAttemptId: string;
    winnerAttemptId: string;
    confidence: number;
    rationale: string;
  }>;
}

export async function bbonJudgeCommand(
  ctx: CommandContext,
  cwd: string = process.cwd()
): Promise<BbonJudgeResult> {
  const dbPath = join(cwd, '.engram', 'engram.db');
  if (!existsSync(dbPath)) {
    throw new Error('Database not initialized (run: en init)');
  }

  const runId = ctx.options.run as string | undefined;

  if (!runId) {
    throw new Error('Missing required option: --run <run-id>');
  }

  const model = (ctx.options.model as string | undefined) ?? 'gpt-4';
  const promptVersion = (ctx.options['prompt-version'] as string | undefined) ?? 'v1';

  const db = getDatabase({ path: dbPath });
  const repo = new Repository(db);

  const run = repo.getBbonRun(runId);

  if (!run) {
    throw new Error(`Run not found: ${runId}`);
  }

  if (!ctx.options.json) {
    console.error(`✓ Found run: ${run.id.slice(0, 8)}`);
    console.error(`  Task: ${run.taskId.slice(0, 8)}`);
    console.error(`  N: ${run.n}`);
    console.error('');
  }

  const attempts = repo.listAttempts(run.id);
  const completedAttempts = attempts.filter(a => a.status === 'completed');

  if (completedAttempts.length < 2) {
    throw new Error(
      `Insufficient completed attempts for judging (found ${completedAttempts.length}, need at least 2)`
    );
  }

  if (!ctx.options.json) {
    console.error(`✓ Found ${completedAttempts.length} completed attempts`);
    console.error('');
  }

  const pairs: Array<{ leftAttemptId: string; rightAttemptId: string }> = [];

  for (let i = 0; i < completedAttempts.length; i++) {
    for (let j = i + 1; j < completedAttempts.length; j++) {
      pairs.push({
        leftAttemptId: completedAttempts[i].id,
        rightAttemptId: completedAttempts[j].id,
      });
    }
  }

  if (!ctx.options.json) {
    console.error(`✓ Generated ${pairs.length} pairwise comparisons`);
    console.error('');
  }

  const outcomes: Array<{
    pairId: string;
    leftAttemptId: string;
    rightAttemptId: string;
    winnerAttemptId: string;
    confidence: number;
    rationale: string;
  }> = [];

  for (const [index, pair] of pairs.entries()) {
    const existingPair = repo
      .listJudgePairs(run.id)
      .find(
        p =>
          (p.leftAttemptId === pair.leftAttemptId && p.rightAttemptId === pair.rightAttemptId) ||
          (p.leftAttemptId === pair.rightAttemptId && p.rightAttemptId === pair.leftAttemptId)
      );

    let judgePair = existingPair;

    if (!judgePair) {
      judgePair = repo.addJudgePair({
        runId: run.id,
        leftAttemptId: pair.leftAttemptId,
        rightAttemptId: pair.rightAttemptId,
        promptVersion,
      });
    }

    const existingOutcome = repo.getJudgeOutcomeByPairId(judgePair.id);

    if (existingOutcome) {
      if (!ctx.options.json) {
        console.error(
          `  [${index + 1}/${pairs.length}] Pair ${judgePair.id.slice(0, 8)}: using cached outcome`
        );
      }

      outcomes.push({
        pairId: judgePair.id,
        leftAttemptId: judgePair.leftAttemptId,
        rightAttemptId: judgePair.rightAttemptId,
        winnerAttemptId: existingOutcome.winnerAttemptId,
        confidence: existingOutcome.confidence,
        rationale: existingOutcome.rationaleText,
      });

      continue;
    }

    if (!ctx.options.json) {
      console.error(
        `  [${index + 1}/${pairs.length}] Judging ${pair.leftAttemptId.slice(0, 8)} vs ${pair.rightAttemptId.slice(0, 8)}...`
      );
    }

    const leftAttempt = repo.getAttempt(pair.leftAttemptId)!;
    const rightAttempt = repo.getAttempt(pair.rightAttemptId)!;

    const leftSteps = repo.listAttemptSteps(leftAttempt.id);
    const rightSteps = repo.listAttemptSteps(rightAttempt.id);

    const narrativeDiff = generateNarrativeDiff(leftAttempt, rightAttempt, leftSteps, rightSteps);

    const judgment = await compareAttempts(leftAttempt, rightAttempt, narrativeDiff, {
      model,
      promptVersion,
    });

    const outcome = repo.addJudgeOutcome({
      pairId: judgePair.id,
      winnerAttemptId: judgment.winnerAttemptId,
      confidence: judgment.confidence,
      rationaleText: judgment.rationale,
      narrativeDiff: narrativeDiff as unknown as Record<string, unknown>,
      model,
    });

    if (!ctx.options.json) {
      const winner =
        judgment.winnerAttemptId === leftAttempt.id
          ? leftAttempt.id.slice(0, 8)
          : rightAttempt.id.slice(0, 8);
      console.error(`    → Winner: ${winner} (confidence: ${judgment.confidence.toFixed(2)})`);
      console.error(`    → Rationale: ${judgment.rationale}`);
      console.error('');
    }

    outcomes.push({
      pairId: judgePair.id,
      leftAttemptId: judgePair.leftAttemptId,
      rightAttemptId: judgePair.rightAttemptId,
      winnerAttemptId: outcome.winnerAttemptId,
      confidence: outcome.confidence,
      rationale: outcome.rationaleText,
    });
  }

  if (!ctx.options.json) {
    console.error(`✓ Judging complete: ${outcomes.length} comparisons`);
    console.error(`  Next: en bbon adopt --run ${run.id.slice(0, 8)}`);
  }

  return {
    runId: run.id,
    pairsJudged: outcomes.length,
    outcomes,
  };
}
