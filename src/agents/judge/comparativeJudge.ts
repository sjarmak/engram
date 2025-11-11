import { z } from 'zod';
import { Attempt } from '../../schemas/bbon.js';
import { NarrativeDiff } from './narrativeDiff.js';
import { deterministicId } from '../../utils/id.js';

export const JudgmentSchema = z.object({
  winnerAttemptId: z.string(),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  contentHash: z.string(),
});

export type Judgment = z.infer<typeof JudgmentSchema>;

export interface JudgeConfig {
  model?: string;
  promptVersion?: string;
}

const DEFAULT_MODEL = 'gpt-4';
const DEFAULT_PROMPT_VERSION = 'v1';

export function computeJudgeCacheKey(
  leftAttemptId: string,
  rightAttemptId: string,
  promptVersion: string,
  model: string
): string {
  const canonical = {
    leftAttemptId,
    rightAttemptId,
    promptVersion,
    model,
  };
  return deterministicId(canonical);
}

export async function compareAttempts(
  leftAttempt: Attempt,
  rightAttempt: Attempt,
  narrativeDiff: NarrativeDiff,
  config: JudgeConfig = {}
): Promise<Judgment> {
  const model = config.model ?? DEFAULT_MODEL;
  const promptVersion = config.promptVersion ?? DEFAULT_PROMPT_VERSION;

  const contentHash = computeJudgeCacheKey(
    leftAttempt.id,
    rightAttempt.id,
    promptVersion,
    model
  );

  const prompt = buildJudgePrompt(leftAttempt, rightAttempt, narrativeDiff, promptVersion);

  const response = await callLLM(prompt, model);

  const judgment = parseJudgmentResponse(response, leftAttempt.id, rightAttempt.id, contentHash);

  return JudgmentSchema.parse(judgment);
}

function buildJudgePrompt(
  leftAttempt: Attempt,
  rightAttempt: Attempt,
  narrativeDiff: NarrativeDiff,
  promptVersion: string
): string {
  if (promptVersion === 'v1') {
    return buildPromptV1(leftAttempt, rightAttempt, narrativeDiff);
  }

  throw new Error(`Unknown prompt version: ${promptVersion}`);
}

function buildPromptV1(
  leftAttempt: Attempt,
  rightAttempt: Attempt,
  narrativeDiff: NarrativeDiff
): string {
  const leftId = leftAttempt.id.slice(0, 8);
  const rightId = rightAttempt.id.slice(0, 8);

  return `You are a comparative judge evaluating two learning trajectories from a code generation agent.

# Task

Compare attempt "${leftId}" and attempt "${rightId}" and determine which produced better outcomes.

# Attempt A: ${leftId}

**Status:** ${leftAttempt.status}
**Ordinal:** ${leftAttempt.ordinal}
**Completed:** ${leftAttempt.completedAt ?? 'not completed'}

**Result:**
\`\`\`json
${JSON.stringify(leftAttempt.result, null, 2)}
\`\`\`

# Attempt B: ${rightId}

**Status:** ${rightAttempt.status}
**Ordinal:** ${rightAttempt.ordinal}
**Completed:** ${rightAttempt.completedAt ?? 'not completed'}

**Result:**
\`\`\`json
${JSON.stringify(rightAttempt.result, null, 2)}
\`\`\`

# Narrative Diff

${narrativeDiff.summary}

## Pros/Cons

**Attempt A Pros:**
${narrativeDiff.prosCons.leftPros.map(p => `- ${p}`).join('\n') || '- None'}

**Attempt A Cons:**
${narrativeDiff.prosCons.leftCons.map(c => `- ${c}`).join('\n') || '- None'}

**Attempt B Pros:**
${narrativeDiff.prosCons.rightPros.map(p => `- ${p}`).join('\n') || '- None'}

**Attempt B Cons:**
${narrativeDiff.prosCons.rightCons.map(c => `- ${c}`).join('\n') || '- None'}

## Deltas

${narrativeDiff.deltas.map(d => `- ${d.description}`).join('\n') || '- No significant deltas'}

# Instructions

Analyze both attempts and pick the winner. Consider:

1. **Completion status:** Did the attempt finish successfully?
2. **Error rate:** Fewer errors is better
3. **Learning quality:** Did it extract meaningful insights?
4. **Efficiency:** Fewer steps with same outcome is better

Respond with JSON only:

\`\`\`json
{
  "winner": "A" | "B",
  "confidence": 0.0-1.0,
  "rationale": "2-3 sentence explanation"
}
\`\`\`

Confidence scale:
- 1.0: Clear winner, obvious choice
- 0.8: Strong preference, minor trade-offs
- 0.6: Moderate preference, meaningful trade-offs
- 0.5: Essentially tied, arbitrary choice
- <0.5: Invalid (must always lean one way)

Be decisive but honest about confidence. If attempts are nearly equal, say so (0.5-0.6) but still pick one.`;
}

async function callLLM(prompt: string, model: string): Promise<string> {
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!openaiApiKey) {
    throw new Error(
      'OPENAI_API_KEY environment variable not set. Cannot call comparative judge LLM.'
    );
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a precise comparative judge. Respond only with valid JSON in the format requested.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.0,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message: { content: string } }>;
  };

  if (!data.choices || data.choices.length === 0) {
    throw new Error('No response from OpenAI API');
  }

  return data.choices[0].message.content;
}

function parseJudgmentResponse(
  response: string,
  leftAttemptId: string,
  rightAttemptId: string,
  contentHash: string
): Judgment {
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    throw new Error(`Failed to parse JSON from LLM response: ${response}`);
  }

  const jsonText = jsonMatch[1] ?? jsonMatch[0];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`Invalid JSON in LLM response: ${err instanceof Error ? err.message : String(err)}`);
  }

  const ResponseSchema = z.object({
    winner: z.enum(['A', 'B']),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  });

  const result = ResponseSchema.safeParse(parsed);

  if (!result.success) {
    const errors = result.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`);
    throw new Error(`Invalid LLM response structure: ${errors.join(', ')}`);
  }

  const winnerAttemptId = result.data.winner === 'A' ? leftAttemptId : rightAttemptId;

  return {
    winnerAttemptId,
    confidence: result.data.confidence,
    rationale: result.data.rationale,
    contentHash,
  };
}
