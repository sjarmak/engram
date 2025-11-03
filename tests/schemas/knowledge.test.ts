import { describe, it, expect } from 'vitest';
import {
  KnowledgeItemSchema,
  InsightSchema,
  TraceSchema,
  ExecutionSchema,
  TraceErrorSchema,
  KnowledgeTypeSchema,
} from '../../src/schemas/knowledge.js';

describe('KnowledgeTypeSchema', () => {
  it('accepts valid knowledge types', () => {
    expect(KnowledgeTypeSchema.parse('fact')).toBe('fact');
    expect(KnowledgeTypeSchema.parse('pattern')).toBe('pattern');
    expect(KnowledgeTypeSchema.parse('procedure')).toBe('procedure');
    expect(KnowledgeTypeSchema.parse('decision')).toBe('decision');
  });

  it('rejects invalid types', () => {
    expect(() => KnowledgeTypeSchema.parse('invalid')).toThrow();
  });
});

describe('KnowledgeItemSchema', () => {
  const validItem = {
    id: 'a'.repeat(64),
    type: 'pattern' as const,
    text: 'Always use .js extensions',
    scope: 'repo',
    confidence: 0.9,
    helpful: 5,
    harmful: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('validates correct knowledge item', () => {
    const result = KnowledgeItemSchema.parse(validItem);
    expect(result.id).toBe(validItem.id);
    expect(result.type).toBe('pattern');
  });

  it('requires id to be 64-char hex', () => {
    expect(() => KnowledgeItemSchema.parse({ ...validItem, id: 'short' })).toThrow();
    expect(() => KnowledgeItemSchema.parse({ ...validItem, id: 'g'.repeat(64) })).toThrow();
  });

  it('requires valid type', () => {
    expect(() => KnowledgeItemSchema.parse({ ...validItem, type: 'invalid' })).toThrow();
  });

  it('requires text to be non-empty', () => {
    expect(() => KnowledgeItemSchema.parse({ ...validItem, text: '' })).toThrow();
  });

  it('validates confidence range 0-1', () => {
    expect(() => KnowledgeItemSchema.parse({ ...validItem, confidence: -0.1 })).toThrow();
    expect(() => KnowledgeItemSchema.parse({ ...validItem, confidence: 1.1 })).toThrow();
    expect(KnowledgeItemSchema.parse({ ...validItem, confidence: 0 })).toBeDefined();
    expect(KnowledgeItemSchema.parse({ ...validItem, confidence: 1 })).toBeDefined();
  });

  it('validates helpful/harmful are non-negative integers', () => {
    expect(() => KnowledgeItemSchema.parse({ ...validItem, helpful: -1 })).toThrow();
    expect(() => KnowledgeItemSchema.parse({ ...validItem, harmful: -1 })).toThrow();
  });

  it('defaults metaTags to empty array', () => {
    const result = KnowledgeItemSchema.parse(validItem);
    expect(result.metaTags).toEqual([]);
  });

  it('accepts metaTags array', () => {
    const withTags = { ...validItem, metaTags: ['typescript', 'esm'] };
    const result = KnowledgeItemSchema.parse(withTags);
    expect(result.metaTags).toEqual(['typescript', 'esm']);
  });

  it('accepts optional module', () => {
    const withModule = { ...validItem, module: 'utils/id' };
    const result = KnowledgeItemSchema.parse(withModule);
    expect(result.module).toBe('utils/id');
  });
});

describe('InsightSchema', () => {
  const validInsight = {
    id: 'b'.repeat(64),
    pattern: 'TypeScript build errors',
    description: 'Always run tsc before tests',
    confidence: 0.85,
    createdAt: new Date().toISOString(),
  };

  it('validates correct insight', () => {
    const result = InsightSchema.parse(validInsight);
    expect(result.pattern).toBe(validInsight.pattern);
  });

  it('defaults frequency to 1', () => {
    const result = InsightSchema.parse(validInsight);
    expect(result.frequency).toBe(1);
  });

  it('defaults relatedBeads to empty array', () => {
    const result = InsightSchema.parse(validInsight);
    expect(result.relatedBeads).toEqual([]);
  });

  it('accepts relatedBeads array', () => {
    const withBeads = { ...validInsight, relatedBeads: ['bd-1', 'bd-2'] };
    const result = InsightSchema.parse(withBeads);
    expect(result.relatedBeads).toEqual(['bd-1', 'bd-2']);
  });

  it('requires frequency to be positive integer', () => {
    expect(() => InsightSchema.parse({ ...validInsight, frequency: 0 })).toThrow();
    expect(() => InsightSchema.parse({ ...validInsight, frequency: -1 })).toThrow();
  });
});

describe('TraceErrorSchema', () => {
  const validError = {
    tool: 'tsc',
    severity: 'error' as const,
    message: 'Type error',
    file: 'src/main.ts',
    line: 42,
  };

  it('validates correct error', () => {
    const result = TraceErrorSchema.parse(validError);
    expect(result.tool).toBe('tsc');
  });

  it('requires valid severity', () => {
    expect(() => TraceErrorSchema.parse({ ...validError, severity: 'fatal' })).toThrow();
  });

  it('accepts optional column', () => {
    const withColumn = { ...validError, column: 10 };
    const result = TraceErrorSchema.parse(withColumn);
    expect(result.column).toBe(10);
  });
});

describe('ExecutionSchema', () => {
  const validExecution = {
    runner: 'vitest',
    command: 'npm test',
    status: 'pass' as const,
    errors: [],
  };

  it('validates correct execution', () => {
    const result = ExecutionSchema.parse(validExecution);
    expect(result.runner).toBe('vitest');
  });

  it('validates execution with errors', () => {
    const withErrors = {
      ...validExecution,
      status: 'fail' as const,
      errors: [{
        tool: 'vitest',
        severity: 'error' as const,
        message: 'Test failed',
        file: 'test.ts',
        line: 10,
      }],
    };
    const result = ExecutionSchema.parse(withErrors);
    expect(result.errors).toHaveLength(1);
  });

  it('requires valid status', () => {
    expect(() => ExecutionSchema.parse({ ...validExecution, status: 'unknown' })).toThrow();
  });
});

describe('TraceSchema', () => {
  const validTrace = {
    id: 'c'.repeat(64),
    beadId: 'bd-42',
    executions: [{
      runner: 'npm',
      command: 'npm test',
      status: 'pass' as const,
      errors: [],
    }],
    outcome: 'success' as const,
    createdAt: new Date().toISOString(),
  };

  it('validates correct trace', () => {
    const result = TraceSchema.parse(validTrace);
    expect(result.beadId).toBe('bd-42');
  });

  it('accepts optional taskDescription', () => {
    const withDesc = { ...validTrace, taskDescription: 'Run tests' };
    const result = TraceSchema.parse(withDesc);
    expect(result.taskDescription).toBe('Run tests');
  });

  it('accepts optional threadId', () => {
    const withThread = { ...validTrace, threadId: 'T-uuid' };
    const result = TraceSchema.parse(withThread);
    expect(result.threadId).toBe('T-uuid');
  });

  it('defaults discoveredIssues to empty array', () => {
    const result = TraceSchema.parse(validTrace);
    expect(result.discoveredIssues).toEqual([]);
  });

  it('accepts discoveredIssues array', () => {
    const withIssues = { ...validTrace, discoveredIssues: ['bd-43', 'bd-44'] };
    const result = TraceSchema.parse(withIssues);
    expect(result.discoveredIssues).toEqual(['bd-43', 'bd-44']);
  });

  it('requires valid outcome', () => {
    expect(() => TraceSchema.parse({ ...validTrace, outcome: 'unknown' })).toThrow();
  });
});
