import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { queueTranscription, retryFailedTranscriptions } from '../services/transcription';

const router = Router();
router.use(authMiddleware);

// ── GET /calls/:callId/transcript — Transcript data for a call ───────────────

router.get('/calls/:callId/transcript', asyncHandler(async (req: Request, res: Response) => {
  const callLog = await prisma.callLog.findUnique({
    where: { id: String(req.params.callId) },
    select: {
      id: true,
      transcriptionStatus: true,
      transcriptText: true,
      transcriptSegments: true,
      callSummary: true,
      leadScore: true,
      leadScoreLabel: true,
      keywordsFound: true,
      transcriptionError: true,
      transcribedAt: true,
      account: { select: { organizationId: true } },
    },
  });

  if (!callLog || callLog.account.organizationId !== req.user!.organizationId) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }

  res.json({
    transcriptionStatus: callLog.transcriptionStatus,
    transcriptText: callLog.transcriptText,
    transcriptSegments: callLog.transcriptSegments,
    callSummary: callLog.callSummary,
    leadScore: callLog.leadScore,
    leadScoreLabel: callLog.leadScoreLabel,
    keywordsFound: callLog.keywordsFound,
    transcriptionError: callLog.transcriptionError,
    transcribedAt: callLog.transcribedAt,
  });
}));

// ── POST /calls/:callId/transcribe — Manually trigger / retry transcription ──

router.post('/calls/:callId/transcribe', asyncHandler(async (req: Request, res: Response) => {
  const callLog = await prisma.callLog.findUnique({
    where: { id: String(req.params.callId) },
    include: { account: { select: { organizationId: true } } },
  });

  if (!callLog || callLog.account.organizationId !== req.user!.organizationId) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }

  if (!callLog.recordingUrl) {
    res.status(400).json({ error: 'No recording available for this call' });
    return;
  }

  await queueTranscription(callLog.id);
  res.json({ message: 'Transcription queued', status: 'PENDING' });
}));

// ── POST /transcriptions/retry-failed — Bulk retry all failed ────────────────

router.post('/transcriptions/retry-failed', asyncHandler(async (req: Request, res: Response) => {
  const count = await retryFailedTranscriptions();
  res.json({ queued: count });
}));

export default router;
