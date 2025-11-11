import { z } from 'zod';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CommandContext } from '../../index.js';
import { getDatabase } from '../../../store/sqlite.js';
import { Repository } from '../../../store/repository.js';
import { applyCommand } from '../apply.js';

export interface BbonAdoptResult {
  runId: string;
  winnerAttemptId: string;
  winnerScore: number;
  knowledgeApplied: boolean;
}

interface AttemptScore {
  attemptId: string;
  wins: number;
  losses: number;
  score: number;
}

export async function bbonAdoptCommand(
  ctx: CommandContext,
  cwd: string = process.cwd()
): Promise<BbonAdoptResult> {
  const dbPath = join(cwd, '.engram', 'engram.db');
  if (!existsSync(dbPath)) {
    throw new Error('Database not initialized (run: en init)');
  }

  const runId = ctx.options.run as string | undefined;

  if (!runId) {
    throw new Error('Missing required option: --run <run-id>');
  }

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
      `Insufficient completed attempts for adoption (found ${completedAttempts.length}, need at least 2)`
    );
  }

  if (!ctx.options.json) {
    console.error(`✓ Found ${completedAttempts.length} completed attempts`);
    console.error('');
  }

  const outcomes = repo.listJudgeOutcomes({ runId: run.id });

  if (outcomes.length === 0) {
    throw new Error(
      `No judge outcomes found for run ${run.id.slice(0, 8)} (run: en bbon-judge --run ${run.id.slice(0, 8)})`
    );
  }

  if (!ctx.options.json) {
    console.error(`✓ Found ${outcomes.length} judge outcome(s)`);
    console.error('');
  }

  // Score attempts by counting wins
  const scores = new Map<string, AttemptScore>();

  for (const attempt of completedAttempts) {
    scores.set(attempt.id, {
      attemptId: attempt.id,
      wins: 0,
      losses: 0,
      score: 0,
    });
  }

  for (const outcome of outcomes) {
    const winnerId = outcome.winnerAttemptId;
    const pair = repo
      .listJudgePairs(run.id)
      .find(p => p.id === outcome.pairId);

    if (!pair) continue;

    const loserId = pair.leftAttemptId === winnerId ? pair.rightAttemptId : pair.leftAttemptId;

    const winnerScore = scores.get(winnerId);
    const loserScore = scores.get(loserId);

    if (winnerScore) {
      winnerScore.wins += 1;
      winnerScore.score += outcome.confidence;
    }

    if (loserScore) {
      loserScore.losses += 1;
    }
  }

  const rankedAttempts = Array.from(scores.values()).sort(
    (a, b) => b.wins - a.wins || b.score - a.score
  );

  if (rankedAttempts.length === 0) {
    throw new Error('No valid attempts to rank');
  }

  const winner = rankedAttempts[0];

  if (!ctx.options.json) {
    console.error(`✓ Winner: ${winner.attemptId.slice(0, 8)}`);
    console.error(`  Wins: ${winner.wins}`);
    console.error(`  Losses: ${winner.losses}`);
    console.error(`  Confidence score: ${winner.score.toFixed(2)}`);
    console.error('');
  }

  // Extract knowledge from winner's steps
  const winnerAttempt = repo.getAttempt(winner.attemptId);
  if (!winnerAttempt) {
    throw new Error(`Winner attempt ${winner.attemptId} not found`);
  }

  const winnerSteps = repo.listAttemptSteps(winner.attemptId);
  const learnSteps = winnerSteps.filter(s => s.kind === 'learn_complete');

  if (learnSteps.length > 0 && !ctx.options.json) {
    console.error(`✓ Found ${learnSteps.length} learning step(s) in winner`);
  }

  // Extract knowledge items from learn_complete steps
  for (const step of learnSteps) {
    const output = step.output;

    if (output.knowledgeItems && Array.isArray(output.knowledgeItems)) {
      for (const item of output.knowledgeItems) {
        try {
          repo.addKnowledgeItem({
            type: item.type || 'pattern',
            text: item.text,
            scope: item.scope || 'project',
            module: item.module,
            metaTags: item.metaTags || [],
            confidence: item.confidence || 0.8,
            helpful: 0,
            harmful: 0,
          });
        } catch (err) {
          if (!ctx.options.json) {
            console.error(
              `  Warning: Failed to add knowledge item: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      }
    }
  }

  // Apply knowledge to AGENTS.md
  if (!ctx.options.json) {
    console.error('');
    console.error('Applying knowledge to AGENTS.md...');
  }

  const applyResult = await applyCommand(ctx, cwd);

  if (!ctx.options.json) {
    console.error('');
    console.error(`✓ Adoption complete`);
    console.error(`  Winner: ${winner.attemptId.slice(0, 8)}`);
    console.error(`  Knowledge items: ${applyResult.knowledgeCount}`);
    console.error(`  AGENTS.md updated: ${applyResult.rendered ? 'yes' : 'no'}`);
  }

  return {
    runId: run.id,
    winnerAttemptId: winner.attemptId,
    winnerScore: winner.score,
    knowledgeApplied: applyResult.rendered,
  };
}
