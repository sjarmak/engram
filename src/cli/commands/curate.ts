import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CommandContext } from '../index.js';
import { getDatabase } from '../../store/sqlite.js';
import { Repository } from '../../store/repository.js';
import { Insight } from '../../schemas/knowledge.js';

export interface CurateResult {
  promoted: number;
  deduplicated: number;
  knowledgeItems: Array<{
    id: string;
    type: string;
    text: string;
    confidence: number;
  }>;
}

export async function curateCommand(
  ctx: CommandContext,
  cwd: string = process.cwd()
): Promise<CurateResult> {
  const raw = ctx.args[0];
  const minConfidence = raw === undefined ? 0.8 : Number(raw);

  if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
    throw new Error('Confidence must be a number between 0 and 1');
  }

  const dbPath = join(cwd, '.ace', 'ace.db');
  if (!existsSync(dbPath)) {
    throw new Error('Database not initialized (run: af init)');
  }

  const db = getDatabase({ path: dbPath });
  const repo = new Repository(db);

  const insights = repo.listInsights({ minConfidence });

  if (!ctx.options.json) {
    console.error(`Curating ${insights.length} insight(s) with confidence >= ${minConfidence}...`);
  }

  const deduplicationMap = new Map<string, Insight[]>();

  for (const insight of insights) {
    const key = `${insight.pattern}:${insight.description}`;
    const existing = deduplicationMap.get(key);

    if (existing) {
      existing.push(insight);
    } else {
      deduplicationMap.set(key, [insight]);
    }
  }

  const existingKnowledge = repo.listKnowledgeItems({ type: 'pattern' });

  let promoted = 0;
  let deduplicated = 0;
  const knowledgeItems: Array<{
    id: string;
    type: string;
    text: string;
    confidence: number;
  }> = [];

  repo.runInTransaction(() => {
    for (const [_, duplicates] of deduplicationMap) {
      if (duplicates.length > 1) {
        deduplicated += duplicates.length - 1;

        for (let i = 1; i < duplicates.length; i++) {
          repo.deleteInsight(duplicates[i].id);
        }
      }

      const representative = duplicates[0];

      const exists = existingKnowledge.some(k => k.text === representative.description);

      if (!exists) {
        const knowledgeItem = repo.addKnowledgeItem({
          type: 'pattern',
          text: representative.description,
          scope: 'repo',
          metaTags: representative.metaTags ?? [],
          confidence: representative.confidence,
          helpful: 0,
          harmful: 0,
        });

        knowledgeItems.push({
          id: knowledgeItem.id,
          type: knowledgeItem.type,
          text: knowledgeItem.text,
          confidence: knowledgeItem.confidence,
        });

        promoted++;
      }

      repo.deleteInsight(representative.id);
    }
  });

  if (!ctx.options.json) {
    console.error(`✓ Promoted ${promoted} insight(s) to knowledge, deduplicated ${deduplicated}`);
  }

  return {
    promoted,
    deduplicated,
    knowledgeItems,
  };
}
