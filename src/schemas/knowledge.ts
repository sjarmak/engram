import { z } from 'zod';

/**
 * Knowledge item types per AGENTS.md
 */
export const KnowledgeTypeSchema = z.enum(['fact', 'pattern', 'procedure', 'decision']);
export type KnowledgeType = z.infer<typeof KnowledgeTypeSchema>;

/**
 * Scope for knowledge items (repo, module, global)
 */
export const ScopeSchema = z.string().min(1);

/**
 * Knowledge item schema
 */
export const KnowledgeItemSchema = z.object({
  id: z.string().length(64).regex(/^[a-f0-9]{64}$/),
  type: KnowledgeTypeSchema,
  text: z.string().min(1),
  scope: ScopeSchema,
  module: z.string().optional(),
  metaTags: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(1.0),
  helpful: z.number().int().min(0).default(0),
  harmful: z.number().int().min(0).default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type KnowledgeItem = z.infer<typeof KnowledgeItemSchema>;

/**
 * Insight schema (pre-curation)
 */
export const InsightSchema = z.object({
  id: z.string().length(64).regex(/^[a-f0-9]{64}$/),
  pattern: z.string().min(1),
  description: z.string().min(1),
  confidence: z.number().min(0).max(1),
  frequency: z.number().int().min(1).default(1),
  relatedBeads: z.array(z.string()).default([]),
  metaTags: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
});

export type Insight = z.infer<typeof InsightSchema>;

/**
 * Execution trace error
 */
export const TraceErrorSchema = z.object({
  tool: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
  message: z.string(),
  file: z.string(),
  line: z.number().int(),
  column: z.number().int().optional(),
});

export type TraceError = z.infer<typeof TraceErrorSchema>;

/**
 * Execution result
 */
export const ExecutionSchema = z.object({
  runner: z.string(),
  command: z.string(),
  status: z.enum(['pass', 'fail']),
  errors: z.array(TraceErrorSchema),
});

export type Execution = z.infer<typeof ExecutionSchema>;

/**
 * Execution trace schema
 */
export const TraceSchema = z.object({
  id: z.string().length(64).regex(/^[a-f0-9]{64}$/),
  beadId: z.string(),
  taskDescription: z.string().optional(),
  threadId: z.string().optional(),
  executions: z.array(ExecutionSchema),
  outcome: z.enum(['success', 'failure', 'partial']),
  discoveredIssues: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
});

export type Trace = z.infer<typeof TraceSchema>;
