import { CallLog, FormLead, TrackingNumber } from '@prisma/client';

/**
 * Calculate auto-score for call leads
 * Scoring criteria:
 * - Duration: >60s = 80pts, 30-60s = 50pts, 15-30s = 30pts, <15s = 10pts
 * - Source: paid (Google/Meta) = +15pts, organic = +10pts, direct = +5pts
 */
export function scoreCallLead(
  call: CallLog & { trackingNumber?: Pick<TrackingNumber, 'source'> | null }
): number {
  let score = 0;

  // Duration-based scoring
  if (call.duration >= 60) {
    score += 80;
  } else if (call.duration >= 30) {
    score += 50;
  } else if (call.duration >= 15) {
    score += 30;
  } else {
    score += 10;
  }

  // Source-based scoring
  if (call.trackingNumber?.source) {
    const source = call.trackingNumber.source.toLowerCase();
    if (source.includes('google') || source.includes('meta') || source.includes('facebook')) {
      score += 15;
    } else if (source.includes('organic') || source.includes('gmb')) {
      score += 10;
    } else {
      score += 5;
    }
  }

  return Math.min(score, 100); // Cap at 100
}

/**
 * Calculate auto-score for form leads
 * Scoring criteria:
 * - Base: 40pts
 * - Has phone: +20pts
 * - Has email: +10pts
 * - Has message/comments: +10pts
 * - Source: Google/Meta = +15pts, organic = +10pts, direct = +5pts
 */
export function scoreFormLead(form: FormLead): number {
  let score = 40; // Base score for filling out a form

  // Check form data for key fields
  const formData = form.formData as Record<string, any> | null;
  if (formData) {
    if (formData.phone || formData.phoneNumber || formData.tel) {
      score += 20;
    }
    if (formData.email) {
      score += 10;
    }
    if (formData.message || formData.comments || formData.description) {
      score += 10;
    }
  }

  // Source-based scoring
  if (form.utmSource) {
    const source = form.utmSource.toLowerCase();
    if (source.includes('google') || source.includes('facebook') || source.includes('meta')) {
      score += 15;
    } else if (source === 'organic' || source.includes('gmb')) {
      score += 10;
    } else {
      score += 5;
    }
  }

  return Math.min(score, 100); // Cap at 100
}

/**
 * Get score color class based on score value
 */
export function getScoreColor(score: number): string {
  if (score >= 70) return 'green';
  if (score >= 40) return 'yellow';
  return 'red';
}
