// ─── Transcription Pipeline ──────────────────────────────────────────────────
// Downloads call recordings from Twilio, transcribes via OpenAI Whisper,
// runs keyword analysis + AI summary, and stores results on CallLog.

import { prisma } from '../config/prisma';
import { getOpenAIClient } from '../config/openai';
import { env } from '../config/env';
import { analyzeKeywords, calculateLeadScore } from './keyword-scoring';
import { generateCallSummary } from './call-summary';
import { emitNotification } from './notification';

// ── In-memory processing queue ───────────────────────────────────────────────

const processingQueue: string[] = [];
const MAX_CONCURRENT = 2;
let activeCount = 0;

/**
 * Queue a call for transcription. Sets status to PENDING and adds to queue.
 */
export async function queueTranscription(callLogId: string): Promise<void> {
  await prisma.callLog.update({
    where: { id: callLogId },
    data: { transcriptionStatus: 'PENDING' },
  });

  processingQueue.push(callLogId);
  processNext();
}

function processNext(): void {
  if (activeCount >= MAX_CONCURRENT || processingQueue.length === 0) return;

  const callLogId = processingQueue.shift()!;
  activeCount++;

  transcribeCall(callLogId)
    .catch((err) => {
      console.error(`[Transcription] Failed for ${callLogId}:`, err);
    })
    .finally(() => {
      activeCount--;
      processNext();
    });
}

// ── Core transcription logic ─────────────────────────────────────────────────

async function transcribeCall(callLogId: string): Promise<void> {
  const callLog = await prisma.callLog.findUnique({
    where: { id: callLogId },
    include: { account: { include: { keywordConfigs: true } } },
  });

  if (!callLog || !callLog.recordingUrl) {
    console.error(`[Transcription] No recording URL for call ${callLogId}`);
    return;
  }

  // Mark as processing
  await prisma.callLog.update({
    where: { id: callLogId },
    data: { transcriptionStatus: 'PROCESSING' },
  });

  try {
    // Step 1: Download recording from Twilio (needs auth)
    const authHeader =
      'Basic ' +
      Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');

    const response = await fetch(callLog.recordingUrl, {
      headers: { Authorization: authHeader },
    });

    if (!response.ok) {
      throw new Error(`Failed to download recording: ${response.status}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    // Step 2: Transcribe with Whisper
    const openai = getOpenAIClient();
    const file = new File([audioBuffer], 'recording.mp3', { type: 'audio/mpeg' });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    const transcriptText = transcription.text;
    const segments =
      (transcription as any).segments?.map((seg: any) => ({
        start: seg.start,
        end: seg.end,
        text: (seg.text as string).trim(),
      })) || [];

    // Step 3: Keyword analysis
    const keywordConfigs = callLog.account.keywordConfigs;
    const keywordResults = analyzeKeywords(transcriptText, keywordConfigs);
    const { score, label } = calculateLeadScore(keywordResults, callLog.duration);

    // Step 4: AI summary (non-fatal if it fails)
    let summary: string | null = null;
    try {
      summary = await generateCallSummary(transcriptText, callLog.duration);
    } catch (err) {
      console.error(`[Summary] Failed for call ${callLogId}:`, err);
    }

    // Step 5: Save everything
    await prisma.callLog.update({
      where: { id: callLogId },
      data: {
        transcriptionStatus: 'COMPLETED',
        transcriptText,
        transcriptSegments: segments as any,
        callSummary: summary,
        leadScore: score,
        leadScoreLabel: label,
        keywordsFound: keywordResults as any,
        transcribedAt: new Date(),
        transcriptionError: null,
      },
    });

    console.log(
      `[Transcription] Completed for call ${callLogId} (score: ${score}, label: ${label})`,
    );

    // Notify if high-value lead
    if (score >= 70) {
      emitNotification(callLog.accountId, 'HIGH_VALUE_LEAD', {
        callerNumber: callLog.callerNumber,
        callerCity: callLog.callerCity || undefined,
        callerState: callLog.callerState || undefined,
        leadScore: score,
        leadScoreLabel: label,
        callLogId,
      }).catch((err) => console.error('[Notification] HIGH_VALUE_LEAD emit failed:', err));
    }
  } catch (err: any) {
    await prisma.callLog.update({
      where: { id: callLogId },
      data: {
        transcriptionStatus: 'FAILED',
        transcriptionError: err.message || 'Unknown error',
      },
    });
    console.error(`[Transcription] Error for call ${callLogId}:`, err);
  }
}

/**
 * Re-queue failed transcriptions. Call manually or on a timer.
 */
export async function retryFailedTranscriptions(): Promise<number> {
  const failed = await prisma.callLog.findMany({
    where: {
      transcriptionStatus: 'FAILED',
      recordingUrl: { not: null },
    },
    take: 10,
    orderBy: { createdAt: 'desc' },
  });

  for (const call of failed) {
    await queueTranscription(call.id);
  }

  return failed.length;
}
