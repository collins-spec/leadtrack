// ─── Keyword Scoring Service ─────────────────────────────────────────────────
// Pure functions for analysing call transcripts against per-account keyword configs.

export interface KeywordConfig {
  keyword: string;
  category: string;
  weight: number;
}

export interface KeywordMatch {
  keyword: string;
  category: string;
  weight: number;
  count: number;
  positions: number[]; // character offsets for UI highlighting
}

// Category multipliers for lead scoring
const CATEGORY_MULTIPLIERS: Record<string, number> = {
  high_intent: 3,
  booking: 3,
  pricing: 2,
  general: 1,
  negative: -1,
  spam: -2,
};

/**
 * Scan transcript text for keyword matches.
 * Returns an array of matches with occurrence counts and character positions.
 */
export function analyzeKeywords(
  transcriptText: string,
  keywordConfigs: KeywordConfig[],
): KeywordMatch[] {
  const lowerText = transcriptText.toLowerCase();
  const results: KeywordMatch[] = [];

  for (const config of keywordConfigs) {
    const lowerKeyword = config.keyword.toLowerCase();
    const positions: number[] = [];
    let idx = 0;

    while ((idx = lowerText.indexOf(lowerKeyword, idx)) !== -1) {
      positions.push(idx);
      idx += lowerKeyword.length;
    }

    if (positions.length > 0) {
      results.push({
        keyword: config.keyword,
        category: config.category,
        weight: config.weight,
        count: positions.length,
        positions,
      });
    }
  }

  return results;
}

/**
 * Calculate a 0-100 lead quality score from keyword matches and call duration.
 */
export function calculateLeadScore(
  keywordMatches: KeywordMatch[],
  callDuration: number,
): { score: number; label: string } {
  // Duration bonus: 1 point per 30 seconds, max 10
  let score = 0;
  if (callDuration > 0) {
    score += Math.min(10, Math.floor(callDuration / 30));
  }

  // Keyword scoring
  for (const match of keywordMatches) {
    const multiplier = CATEGORY_MULTIPLIERS[match.category] || 1;
    score += match.count * match.weight * multiplier;
  }

  // Normalize to 0-100
  score = Math.max(0, Math.min(100, score));

  // Label assignment
  let label: string;
  if (score >= 70) label = 'HIGH';
  else if (score >= 40) label = 'MEDIUM';
  else if (score >= 10) label = 'LOW';
  else label = 'SPAM';

  return { score, label };
}

/**
 * Default keywords seeded for new accounts.
 */
export const DEFAULT_KEYWORDS: Omit<KeywordConfig, 'id'>[] = [
  { keyword: 'appointment', category: 'booking', weight: 5 },
  { keyword: 'schedule', category: 'booking', weight: 5 },
  { keyword: 'book', category: 'booking', weight: 4 },
  { keyword: 'available', category: 'booking', weight: 3 },
  { keyword: 'price', category: 'pricing', weight: 3 },
  { keyword: 'cost', category: 'pricing', weight: 3 },
  { keyword: 'quote', category: 'pricing', weight: 4 },
  { keyword: 'estimate', category: 'pricing', weight: 4 },
  { keyword: 'interested', category: 'high_intent', weight: 5 },
  { keyword: 'need help', category: 'high_intent', weight: 4 },
  { keyword: 'looking for', category: 'high_intent', weight: 3 },
  { keyword: 'how much', category: 'pricing', weight: 3 },
  { keyword: 'wrong number', category: 'spam', weight: 5 },
  { keyword: 'not interested', category: 'negative', weight: 4 },
  { keyword: 'do not call', category: 'spam', weight: 5 },
  { keyword: 'remove my number', category: 'spam', weight: 5 },
];
