import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CommandContext } from '../index.js';
import { getDatabase } from '../../store/sqlite.js';
import { Repository } from '../../store/repository.js';

export interface ReflectResult {
  insightCount: number;
  traceCount: number;
  insights: Array<{
    id: string;
    pattern: string;
    confidence: number;
    frequency: number;
  }>;
}

interface ErrorPattern {
  message: string;
  file: string;
  tool: string;
  occurrences: number;
  traceIds: Set<string>;
}

export async function reflectCommand(
  ctx: CommandContext,
  cwd: string = process.cwd()
): Promise<ReflectResult> {
  const dbPath = join(cwd, '.engram', 'engram.db');
  if (!existsSync(dbPath)) {
    throw new Error('Database not initialized (run: en init)');
  }

  const db = getDatabase({ path: dbPath });
  const repo = new Repository(db);

  const failedTraces = repo.listTracesByOutcome('failure');

  if (!ctx.options.json) {
    console.error(`Analyzing ${failedTraces.length} failed trace(s)...`);
  }

  const errorPatterns = new Map<string, ErrorPattern>();

  for (const trace of failedTraces) {
    for (const execution of trace.executions) {
      if (execution.status === 'fail') {
        for (const error of execution.errors) {
          const tool = error.tool ?? 'unknown';
          const file = error.file ?? 'unknown';
          const message = (error.message ?? '').trim();

          if (!message) continue;

          const key = `${tool}:${file}:${message}`;
          const existing = errorPatterns.get(key);

          if (existing) {
            existing.occurrences++;
            existing.traceIds.add(trace.id);
          } else {
            errorPatterns.set(key, {
              message,
              file,
              tool,
              occurrences: 1,
              traceIds: new Set([trace.id]),
            });
          }
        }
      }
    }
  }

  const insights: Array<{
    id: string;
    pattern: string;
    confidence: number;
    frequency: number;
  }> = [];

  const existingInsights = repo.listInsights();

  for (const [_, pattern] of errorPatterns) {
    const confidence =
      failedTraces.length > 0 ? Math.min(pattern.traceIds.size / failedTraces.length, 1.0) : 0;

    if (confidence >= 0.5) {
      const patternText = `${pattern.tool} error in ${pattern.file}`;

      const duplicate = existingInsights.find(
        i => i.pattern === patternText && i.description === pattern.message
      );

      if (duplicate) {
        if (!ctx.options.json) {
          console.error(`  Skipping duplicate: ${patternText}`);
        }
        continue;
      }

      const insight = repo.addInsight({
        pattern: patternText,
        description: pattern.message,
        confidence,
        frequency: pattern.occurrences,
        relatedBeads: failedTraces.map(t => t.beadId).filter(Boolean),
        metaTags: [pattern.tool, 'error-pattern'].filter(Boolean),
      });

      insights.push({
        id: insight.id,
        pattern: insight.pattern,
        confidence: insight.confidence,
        frequency: insight.frequency,
      });
    }
  }

  insights.sort((a, b) => b.confidence - a.confidence || a.pattern.localeCompare(b.pattern));

  if (!ctx.options.json) {
    console.error(`✓ Generated ${insights.length} insight(s) from ${failedTraces.length} trace(s)`);
  }

  return {
    insightCount: insights.length,
    traceCount: failedTraces.length,
    insights,
  };
}
