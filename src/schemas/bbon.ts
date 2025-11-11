import { z } from 'zod';

/**
 * bBoN (Best-of-N) schemas for multi-trajectory rollouts and comparative judging
 */

/**
 * Task specification schema
 */
export const TaskSchema = z.object({
  id: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/),
  beadId: z.string().optional(),
  spec: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
});

export type Task = z.infer<typeof TaskSchema>;

/**
 * bBoN run schema (N parallel attempts per task)
 */
export const BbonRunSchema = z.object({
  id: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/),
  taskId: z.string(),
  n: z.number().int().min(1),
  seed: z.number().int(),
  config: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
});

export type BbonRun = z.infer<typeof BbonRunSchema>;

/**
 * Attempt status values
 */
export const AttemptStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);
export type AttemptStatus = z.infer<typeof AttemptStatusSchema>;

/**
 * Individual attempt schema
 */
export const AttemptSchema = z.object({
  id: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/),
  runId: z.string(),
  ordinal: z.number().int().min(0),
  status: AttemptStatusSchema,
  result: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});

export type Attempt = z.infer<typeof AttemptSchema>;

/**
 * Attempt step schema (execution trace within attempt)
 */
export const AttemptStepSchema = z.object({
  id: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/),
  attemptId: z.string(),
  stepIndex: z.number().int().min(0),
  kind: z.string(),
  input: z.record(z.string(), z.unknown()).default({}),
  output: z.record(z.string(), z.unknown()).default({}),
  observation: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
});

export type AttemptStep = z.infer<typeof AttemptStepSchema>;

/**
 * Judge pair schema (pairwise comparison)
 */
export const JudgePairSchema = z.object({
  id: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/),
  runId: z.string(),
  leftAttemptId: z.string(),
  rightAttemptId: z.string(),
  promptVersion: z.string(),
  createdAt: z.string().datetime(),
});

export type JudgePair = z.infer<typeof JudgePairSchema>;

/**
 * Judge outcome schema (comparative judgment result)
 */
export const JudgeOutcomeSchema = z.object({
  id: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/),
  pairId: z.string(),
  winnerAttemptId: z.string(),
  confidence: z.number().min(0).max(1),
  rationaleText: z.string(),
  narrativeDiff: z.record(z.string(), z.unknown()),
  model: z.string(),
  createdAt: z.string().datetime(),
});

export type JudgeOutcome = z.infer<typeof JudgeOutcomeSchema>;
