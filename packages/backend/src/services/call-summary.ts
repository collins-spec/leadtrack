// ─── Call Summary Service ────────────────────────────────────────────────────
// Generates a concise AI summary of a call transcript using GPT-4o-mini.

import { getOpenAIClient } from '../config/openai';

export async function generateCallSummary(
  transcriptText: string,
  durationSeconds: number,
): Promise<string> {
  if (!transcriptText || transcriptText.trim().length < 20) {
    return 'Call too short for meaningful summary.';
  }

  const openai = getOpenAIClient();

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You are a call analysis assistant for a call tracking platform. Generate a brief, actionable summary of business phone calls. Focus on: the caller\'s intent, key topics discussed, outcome, and any follow-up needed. Keep it to 2-3 sentences maximum. Use professional, concise language.',
      },
      {
        role: 'user',
        content: `Summarize this ${Math.ceil(durationSeconds / 60)}-minute business phone call:\n\n${transcriptText.slice(0, 4000)}`,
      },
    ],
    max_tokens: 200,
    temperature: 0.3,
  });

  return response.choices[0]?.message?.content?.trim() || 'Unable to generate summary.';
}
