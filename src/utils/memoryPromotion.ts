import { Repository } from '../store/repository.js';
import { Insight } from '../schemas/knowledge.js';
import { WorkingMemory, WorkingMemoryType } from '../schemas/memory.js';

/**
 * Promotion logic from insights to working memory
 * Converts high-confidence insights into persistent working memory entries
 */

export interface PromotionResult {
  promoted: number;
  summaries: number;
  invariants: number;
  decisions: number;
}

/**
 * Classify insight into working memory type based on content
 */
function classifyInsight(insight: Insight): WorkingMemoryType {
  const pattern = insight.pattern.toLowerCase();
  const desc = insight.description.toLowerCase();

  // Decision: Contains should/must/prefer/avoid
  if (
    pattern.match(/\b(should|must|prefer|avoid|never|always)\b/i) ||
    desc.match(/\b(should|must|prefer|avoid|never|always)\b/i)
  ) {
    return 'decision';
  }

  // Invariant: Contains requires/constraint/rule/law
  if (
    pattern.match(/\b(requires?|constraint|rule|law|guarantee)\b/i) ||
    desc.match(/\b(requires?|constraint|rule|law|guarantee)\b/i)
  ) {
    return 'invariant';
  }

  // Default: summary
  return 'summary';
}

/**
 * Promote high-confidence insights to working memory
 */
export function promoteInsightsToWorkingMemory(
  repo: Repository,
  minConfidence: number = 0.8,
  projectId: string = '.'
): PromotionResult {
  const insights = repo.listInsights({ minConfidence });

  let summaries = 0;
  let invariants = 0;
  let decisions = 0;

  for (const insight of insights) {
    const type = classifyInsight(insight);
    const contentText = `${insight.pattern} - ${insight.description}`;

    const entry: Omit<WorkingMemory, 'id' | 'updatedAt'> = {
      projectId,
      type,
      contentText,
      provenance: {
        source: 'insight',
        insightId: insight.id,
        confidence: insight.confidence,
        frequency: insight.frequency,
        relatedBeads: insight.relatedBeads,
      },
    };

    repo.upsertWorkingMemory(entry);

    // Track memory event
    repo.recordMemoryEvent({
      subjectId: insight.id,
      subjectKind: 'insight',
      event: 'promoted_to_working_memory',
      data: {
        type,
        confidence: insight.confidence,
        frequency: insight.frequency,
      },
    });

    switch (type) {
      case 'summary':
        summaries++;
        break;
      case 'invariant':
        invariants++;
        break;
      case 'decision':
        decisions++;
        break;
    }
  }

  return {
    promoted: insights.length,
    summaries,
    invariants,
    decisions,
  };
}
