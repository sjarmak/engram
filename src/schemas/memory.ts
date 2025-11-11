import { z } from 'zod';

/**
 * Memory tier schemas for three-tier memory hierarchy:
 * - Short-term: Per-run scratchpad (cleared at run end)
 * - Working: Project-level persistent knowledge (summaries/invariants/decisions)
 * - Archival: Long-term immutable (via Beads)
 */

/**
 * Working memory types
 */
export const WorkingMemoryTypeSchema = z.enum(['summary', 'invariant', 'decision']);
export type WorkingMemoryType = z.infer<typeof WorkingMemoryTypeSchema>;

/**
 * Short-term memory entry schema (per-run KV store)
 */
export const ShortTermMemorySchema = z.object({
  id: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/),
  runId: z.string(),
  key: z.string(),
  value: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
});

export type ShortTermMemory = z.infer<typeof ShortTermMemorySchema>;

/**
 * Working memory entry schema (project persistent knowledge)
 */
export const WorkingMemorySchema = z.object({
  id: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/),
  projectId: z.string().default('.'),
  type: WorkingMemoryTypeSchema,
  contentText: z.string(),
  provenance: z.record(z.string(), z.unknown()),
  updatedAt: z.string().datetime(),
});

export type WorkingMemory = z.infer<typeof WorkingMemorySchema>;

/**
 * Memory event schema (provenance tracking)
 */
export const MemoryEventSchema = z.object({
  id: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/),
  subjectId: z.string(),
  subjectKind: z.string(),
  event: z.string(),
  data: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
});

export type MemoryEvent = z.infer<typeof MemoryEventSchema>;
