import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CommandContext } from '../index.js';
import { getDatabase } from '../../store/sqlite.js';
import { Repository } from '../../store/repository.js';
import { KnowledgeItem } from '../../schemas/knowledge.js';

export interface ApplyResult {
  rendered: boolean;
  knowledgeCount: number;
  sections: {
    pattern: number;
    fact: number;
    procedure: number;
    decision: number;
  };
}

function renderKnowledgeSection(items: KnowledgeItem[], type: string): string {
  const filtered = items.filter(item => item.type === type);
  if (filtered.length === 0) return '';

  const lines: string[] = [];

  for (const item of filtered) {
    const idTag = item.id.slice(0, 8);
    const helpful = (item.helpful ?? 0) > 0 ? `+${item.helpful}` : '';
    const harmful = (item.harmful ?? 0) > 0 ? `-${item.harmful}` : '';
    const badge = [helpful, harmful].filter(Boolean).join(' ');
    const feedback = badge ? ` [${badge}]` : '';

    lines.push(`[#${idTag}]${feedback} ${item.text}`);
  }

  return lines.join('\n\n');
}

export async function applyCommand(
  ctx: CommandContext,
  cwd: string = process.cwd()
): Promise<ApplyResult> {
  const dbPath = join(cwd, '.engram', 'engram.db');
  if (!existsSync(dbPath)) {
    throw new Error('Database not initialized (run: en init)');
  }

  const db = getDatabase({ path: dbPath });
  const repo = new Repository(db);

  const allKnowledge = repo
    .listKnowledgeItems({ minConfidence: 0.5 })
    .sort(
      (a, b) =>
        (b.helpful ?? 0) - (a.helpful ?? 0) ||
        b.confidence - a.confidence ||
        a.text.localeCompare(b.text)
    );

  if (!ctx.options.json) {
    console.error(`Rendering ${allKnowledge.length} knowledge item(s) to AGENTS.md...`);
  }

  const agentsMdPath = join(cwd, 'AGENTS.md');
  if (!existsSync(agentsMdPath)) {
    throw new Error('AGENTS.md not found (run: af init)');
  }

  const content = readFileSync(agentsMdPath, 'utf8');
  const beginMarker = '<!-- BEGIN: LEARNED_PATTERNS -->';
  const endMarker = '<!-- END: LEARNED_PATTERNS -->';

  const startIdx = content.indexOf(beginMarker);
  const endIdx = content.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(
      'AGENTS.md missing required HTML comment markers (<!-- BEGIN: LEARNED_PATTERNS --> and <!-- END: LEARNED_PATTERNS -->) or markers in wrong order'
    );
  }

  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx);

  const sections = {
    pattern: allKnowledge.filter(k => k.type === 'pattern').length,
    fact: allKnowledge.filter(k => k.type === 'fact').length,
    procedure: allKnowledge.filter(k => k.type === 'procedure').length,
    decision: allKnowledge.filter(k => k.type === 'decision').length,
  };

  const patternSection = renderKnowledgeSection(allKnowledge, 'pattern');
  const factSection = renderKnowledgeSection(allKnowledge, 'fact');
  const procedureSection = renderKnowledgeSection(allKnowledge, 'procedure');
  const decisionSection = renderKnowledgeSection(allKnowledge, 'decision');

  const learnedSection = [
    beginMarker,
    '## Learned Patterns',
    '',
    '*Auto-maintained by learning loop. Patterns accumulate from execution feedback.*',
    '',
  ];

  if (patternSection) {
    learnedSection.push('### Patterns', '', patternSection, '');
  }

  if (factSection) {
    learnedSection.push('### Facts', '', factSection, '');
  }

  if (procedureSection) {
    learnedSection.push('### Procedures', '', procedureSection, '');
  }

  if (decisionSection) {
    learnedSection.push('### Decisions', '', decisionSection, '');
  }

  learnedSection.push('---', '');

  const newContent = before + learnedSection.join('\n') + '\n' + after;

  const contentChanged = newContent !== content;

  if (contentChanged) {
    writeFileSync(agentsMdPath, newContent, 'utf8');

    if (!ctx.options.json) {
      console.error(`✓ Rendered ${allKnowledge.length} item(s) to AGENTS.md`);
    }
  } else {
    if (!ctx.options.json) {
      console.error(`✓ No changes needed (${allKnowledge.length} items already rendered)`);
    }
  }

  return {
    rendered: contentChanged,
    knowledgeCount: allKnowledge.length,
    sections,
  };
}
