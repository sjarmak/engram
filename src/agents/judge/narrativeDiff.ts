import { z } from 'zod';
import { Attempt, AttemptStep } from '../../schemas/bbon.js';

export const NarrativeDiffSchema = z.object({
  leftAttemptId: z.string(),
  rightAttemptId: z.string(),
  alignedSteps: z.array(
    z.object({
      index: z.number(),
      leftStep: z
        .object({
          kind: z.string(),
          input: z.record(z.string(), z.unknown()),
          output: z.record(z.string(), z.unknown()),
          observation: z.record(z.string(), z.unknown()),
        })
        .optional(),
      rightStep: z
        .object({
          kind: z.string(),
          input: z.record(z.string(), z.unknown()),
          output: z.record(z.string(), z.unknown()),
          observation: z.record(z.string(), z.unknown()),
        })
        .optional(),
      delta: z.string().optional(),
    })
  ),
  deltas: z.array(
    z.object({
      type: z.enum(['added', 'removed', 'modified', 'same']),
      path: z.string(),
      leftValue: z.unknown().optional(),
      rightValue: z.unknown().optional(),
      description: z.string(),
    })
  ),
  prosCons: z.object({
    leftPros: z.array(z.string()),
    leftCons: z.array(z.string()),
    rightPros: z.array(z.string()),
    rightCons: z.array(z.string()),
  }),
  summary: z.string(),
});

export type NarrativeDiff = z.infer<typeof NarrativeDiffSchema>;

interface StepInfo {
  kind: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  observation: Record<string, unknown>;
}

export function generateNarrativeDiff(
  leftAttempt: Attempt,
  rightAttempt: Attempt,
  leftSteps: AttemptStep[],
  rightSteps: AttemptStep[]
): NarrativeDiff {
  const alignedSteps = alignSteps(leftSteps, rightSteps);
  const deltas = computeDeltas(leftAttempt, rightAttempt, leftSteps, rightSteps);
  const prosCons = extractProsCons(leftAttempt, rightAttempt, deltas);
  const summary = generateSummary(leftAttempt, rightAttempt, deltas, prosCons);

  const diff: NarrativeDiff = {
    leftAttemptId: leftAttempt.id,
    rightAttemptId: rightAttempt.id,
    alignedSteps,
    deltas,
    prosCons,
    summary,
  };

  return NarrativeDiffSchema.parse(diff);
}

function alignSteps(leftSteps: AttemptStep[], rightSteps: AttemptStep[]) {
  const maxLen = Math.max(leftSteps.length, rightSteps.length);
  const aligned = [];

  for (let i = 0; i < maxLen; i++) {
    const leftStep = leftSteps[i];
    const rightStep = rightSteps[i];

    const entry: {
      index: number;
      leftStep?: StepInfo;
      rightStep?: StepInfo;
      delta?: string;
    } = { index: i };

    if (leftStep) {
      entry.leftStep = {
        kind: leftStep.kind,
        input: leftStep.input,
        output: leftStep.output,
        observation: leftStep.observation,
      };
    }

    if (rightStep) {
      entry.rightStep = {
        kind: rightStep.kind,
        input: rightStep.input,
        output: rightStep.output,
        observation: rightStep.observation,
      };
    }

    if (leftStep && rightStep) {
      if (leftStep.kind !== rightStep.kind) {
        entry.delta = `Step ${i}: kind differs (${leftStep.kind} vs ${rightStep.kind})`;
      } else if (
        JSON.stringify(leftStep.output) !== JSON.stringify(rightStep.output) ||
        JSON.stringify(leftStep.observation) !== JSON.stringify(rightStep.observation)
      ) {
        entry.delta = `Step ${i}: output or observation differs`;
      }
    } else if (leftStep && !rightStep) {
      entry.delta = `Step ${i}: only in left attempt (${leftStep.kind})`;
    } else if (!leftStep && rightStep) {
      entry.delta = `Step ${i}: only in right attempt (${rightStep.kind})`;
    }

    aligned.push(entry);
  }

  return aligned;
}

function computeDeltas(
  leftAttempt: Attempt,
  rightAttempt: Attempt,
  leftSteps: AttemptStep[],
  rightSteps: AttemptStep[]
) {
  const deltas: Array<{
    type: 'added' | 'removed' | 'modified' | 'same';
    path: string;
    leftValue?: unknown;
    rightValue?: unknown;
    description: string;
  }> = [];

  if (leftAttempt.status !== rightAttempt.status) {
    deltas.push({
      type: 'modified',
      path: 'status',
      leftValue: leftAttempt.status,
      rightValue: rightAttempt.status,
      description: `Status: ${leftAttempt.status} → ${rightAttempt.status}`,
    });
  }

  if (leftSteps.length !== rightSteps.length) {
    deltas.push({
      type: 'modified',
      path: 'steps.length',
      leftValue: leftSteps.length,
      rightValue: rightSteps.length,
      description: `Step count: ${leftSteps.length} → ${rightSteps.length}`,
    });
  }

  const leftErrorSteps = leftSteps.filter(s => s.kind === 'error');
  const rightErrorSteps = rightSteps.filter(s => s.kind === 'error');

  if (leftErrorSteps.length !== rightErrorSteps.length) {
    deltas.push({
      type: 'modified',
      path: 'errors.count',
      leftValue: leftErrorSteps.length,
      rightValue: rightErrorSteps.length,
      description: `Error count: ${leftErrorSteps.length} → ${rightErrorSteps.length}`,
    });
  }

  const leftLearnSteps = leftSteps.filter(s => s.kind === 'learn_complete');
  const rightLearnSteps = rightSteps.filter(s => s.kind === 'learn_complete');

  if (leftLearnSteps.length > 0 && rightLearnSteps.length > 0) {
    const leftOutput = leftLearnSteps[0].output;
    const rightOutput = rightLearnSteps[0].output;

    if (JSON.stringify(leftOutput) !== JSON.stringify(rightOutput)) {
      deltas.push({
        type: 'modified',
        path: 'learn_complete.output',
        leftValue: leftOutput,
        rightValue: rightOutput,
        description: 'Learning outcomes differ',
      });
    }
  }

  return deltas;
}

function extractProsCons(
  leftAttempt: Attempt,
  rightAttempt: Attempt,
  deltas: Array<{
    type: 'added' | 'removed' | 'modified' | 'same';
    path: string;
    leftValue?: unknown;
    rightValue?: unknown;
    description: string;
  }>
) {
  const leftPros: string[] = [];
  const leftCons: string[] = [];
  const rightPros: string[] = [];
  const rightCons: string[] = [];

  if (leftAttempt.status === 'completed') {
    leftPros.push('Completed successfully');
  } else {
    leftCons.push(`Failed with status: ${leftAttempt.status}`);
  }

  if (rightAttempt.status === 'completed') {
    rightPros.push('Completed successfully');
  } else {
    rightCons.push(`Failed with status: ${rightAttempt.status}`);
  }

  for (const delta of deltas) {
    if (delta.path === 'errors.count') {
      const leftErrors = delta.leftValue as number;
      const rightErrors = delta.rightValue as number;

      if (leftErrors < rightErrors) {
        leftPros.push(`Fewer errors (${leftErrors} vs ${rightErrors})`);
        rightCons.push(`More errors (${rightErrors} vs ${leftErrors})`);
      } else if (rightErrors < leftErrors) {
        rightPros.push(`Fewer errors (${rightErrors} vs ${leftErrors})`);
        leftCons.push(`More errors (${leftErrors} vs ${rightErrors})`);
      }
    }

    if (delta.path === 'steps.length') {
      const leftSteps = delta.leftValue as number;
      const rightSteps = delta.rightValue as number;

      if (leftSteps < rightSteps) {
        leftPros.push(`More concise (${leftSteps} steps vs ${rightSteps})`);
      } else if (rightSteps < leftSteps) {
        rightPros.push(`More concise (${rightSteps} steps vs ${leftSteps})`);
      }
    }
  }

  return {
    leftPros,
    leftCons,
    rightPros,
    rightCons,
  };
}

function generateSummary(
  leftAttempt: Attempt,
  rightAttempt: Attempt,
  deltas: Array<{
    type: 'added' | 'removed' | 'modified' | 'same';
    path: string;
    leftValue?: unknown;
    rightValue?: unknown;
    description: string;
  }>,
  prosCons: {
    leftPros: string[];
    leftCons: string[];
    rightPros: string[];
    rightCons: string[];
  }
) {
  const parts: string[] = [];

  parts.push(
    `Comparing attempt ${leftAttempt.id.slice(0, 8)} (${leftAttempt.status}) vs ${rightAttempt.id.slice(0, 8)} (${rightAttempt.status})`
  );

  if (deltas.length > 0) {
    parts.push(`Found ${deltas.length} differences:`);
    for (const delta of deltas.slice(0, 3)) {
      parts.push(`  - ${delta.description}`);
    }
    if (deltas.length > 3) {
      parts.push(`  ... and ${deltas.length - 3} more`);
    }
  } else {
    parts.push('Attempts are structurally similar');
  }

  const leftScore = prosCons.leftPros.length - prosCons.leftCons.length;
  const rightScore = prosCons.rightPros.length - prosCons.rightCons.length;

  if (leftScore > rightScore) {
    parts.push(`Left attempt appears stronger (score: ${leftScore} vs ${rightScore})`);
  } else if (rightScore > leftScore) {
    parts.push(`Right attempt appears stronger (score: ${rightScore} vs ${leftScore})`);
  } else {
    parts.push(`Attempts appear equally strong (score: ${leftScore})`);
  }

  return parts.join('\n');
}
