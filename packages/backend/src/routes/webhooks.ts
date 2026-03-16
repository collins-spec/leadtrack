import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { buildTwiML, buildWhisperTwiML } from '../services/twilio';
import { CallStatus } from '@prisma/client';
import { asyncHandler } from '../middleware/asyncHandler';
import { queueTranscription } from '../services/transcription';
import { emitNotification } from '../services/notification';
import { resolveGclidAttribution } from '../services/googleAds';

const router = Router();

// Twilio sends POST when a call comes in to a tracking number
router.post('/twilio/voice', asyncHandler(async (req: Request, res: Response) => {
  const { To, From, CallSid, FromCity, FromState } = req.body;

  // Find the tracking number
  const trackingNumber = await prisma.trackingNumber.findUnique({
    where: { phoneNumber: To },
    include: { account: true },
  });

  if (!trackingNumber) {
    console.error(`No tracking number found for ${To}`);
    res.type('text/xml').send('<Response><Say>Sorry, this number is not configured.</Say></Response>');
    return;
  }

  // ── DNI session lookup with 3-tier stale-call attribution ──────────────

  // Tier 1: Active session on this DNI number
  let dniSession = await prisma.dNISession.findFirst({
    where: {
      trackingNumberId: trackingNumber.id,
      isActive: true,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Tier 2: Most recently expired session on this number
  // (visitor wrote number down and called after session expired)
  if (!dniSession && trackingNumber.isDNIPool) {
    dniSession = await prisma.dNISession.findFirst({
      where: { trackingNumberId: trackingNumber.id },
      orderBy: { expiresAt: 'desc' },
    });
    if (dniSession) {
      console.log(
        `[DNI] Stale-call attribution: caller ${From} matched expired session ` +
          `(source: ${dniSession.utmSource}, gclid: ${dniSession.gclid || 'none'})`,
      );
    }
  }

  // Tier 3: Returning caller — check if this phone number has called before with a GCLID
  let fallbackGclid: string | null = null;
  if (!dniSession && trackingNumber.isDNIPool) {
    const previousCall = await prisma.callLog.findFirst({
      where: {
        callerNumber: From,
        accountId: trackingNumber.accountId,
        gclid: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (previousCall) {
      fallbackGclid = previousCall.gclid;
      console.log(
        `[DNI] Returning-caller attribution: ${From} previously had gclid ${fallbackGclid}`,
      );
    }
  }

  // Create call log with best available attribution
  const callLog = await prisma.callLog.create({
    data: {
      accountId: trackingNumber.accountId,
      trackingNumberId: trackingNumber.id,
      callerNumber: From,
      callerCity: FromCity || null,
      callerState: FromState || null,
      callStatus: 'RINGING',
      twilioCallSid: CallSid,
      gclid: dniSession?.gclid || fallbackGclid || null,
      utmSource: dniSession?.utmSource || null,
      utmMedium: dniSession?.utmMedium || null,
      utmCampaign: dniSession?.utmCampaign || null,
      utmTerm: dniSession?.utmTerm || null,
      utmContent: dniSession?.utmContent || null,
      landingPage: dniSession?.landingPage || null,
      whisperPlayed: `Call from ${trackingNumber.source} ${trackingNumber.campaignTag || trackingNumber.medium}`,
    },
  });

  // Async: resolve GCLID to Google Ads keyword/campaign data
  if (callLog.gclid) {
    resolveGclidAttribution(callLog.id, callLog.gclid, trackingNumber.accountId)
      .catch((err) => console.error('[GoogleAds] GCLID resolution failed:', err));
  }

  // Notify: new call
  emitNotification(trackingNumber.accountId, 'NEW_CALL', {
    callerNumber: From,
    callerCity: FromCity || undefined,
    callerState: FromState || undefined,
    source: trackingNumber.source,
  }).catch((err) => console.error('[Notification] NEW_CALL emit failed:', err));

  // Build TwiML to forward the call with a whisper
  const whisperMessage = `Call from ${trackingNumber.source} ${trackingNumber.campaignTag || trackingNumber.medium}`;
  const twiml = buildTwiML(trackingNumber.account.businessPhone, whisperMessage);

  res.type('text/xml').send(twiml);
}));

// Whisper endpoint — plays a message to the agent before connecting
router.post('/twilio/whisper', asyncHandler(async (req: Request, res: Response) => {
  const message = req.query.message as string || 'Incoming call';
  const twiml = buildWhisperTwiML(message);
  res.type('text/xml').send(twiml);
}));

// Call status callback
router.post('/twilio/status', asyncHandler(async (req: Request, res: Response) => {
  const { CallSid, CallStatus: status, CallDuration } = req.body;

  if (!CallSid) {
    res.sendStatus(200);
    return;
  }

  const statusMap: Record<string, CallStatus> = {
    'initiated': 'RINGING',
    'ringing': 'RINGING',
    'in-progress': 'IN_PROGRESS',
    'completed': 'COMPLETED',
    'no-answer': 'NO_ANSWER',
    'busy': 'BUSY',
    'failed': 'FAILED',
    'canceled': 'CANCELED',
  };

  const mappedStatus = statusMap[status] || 'COMPLETED';
  const duration = CallDuration ? parseInt(CallDuration) : undefined;

  try {
    const callLog = await prisma.callLog.findUnique({
      where: { twilioCallSid: CallSid },
      include: { account: true, trackingNumber: true },
    });

    if (callLog) {
      await prisma.callLog.update({
        where: { twilioCallSid: CallSid },
        data: {
          callStatus: mappedStatus,
          ...(duration !== undefined ? { duration } : {}),
        },
      });

      // Missed call notifications
      if (mappedStatus === 'NO_ANSWER' || mappedStatus === 'BUSY') {
        emitNotification(callLog.accountId, 'MISSED_CALL', {
          callerNumber: callLog.callerNumber,
          callerCity: callLog.callerCity || undefined,
          callerState: callLog.callerState || undefined,
          callStatus: mappedStatus,
          source: callLog.trackingNumber?.source,
        }).catch((err) => console.error('[Notification] MISSED_CALL emit failed:', err));

        if (callLog.account.missedCallSms) {
          console.log(`Missed call text-back triggered for ${callLog.callerNumber}`);
        }
      }
    }
  } catch (err) {
    console.error('Error updating call status:', err);
  }

  res.sendStatus(200);
}));

// Recording ready callback
router.post('/twilio/recording', asyncHandler(async (req: Request, res: Response) => {
  const { CallSid, RecordingUrl, RecordingSid } = req.body;

  if (!CallSid || !RecordingUrl) {
    res.sendStatus(200);
    return;
  }

  try {
    const callLog = await prisma.callLog.update({
      where: { twilioCallSid: CallSid },
      data: {
        recordingUrl: `${RecordingUrl}.mp3`,
        recordingSid: RecordingSid,
      },
      include: { account: true },
    });

    // Queue async transcription if enabled for this account
    if (callLog.account.transcriptionEnabled) {
      queueTranscription(callLog.id).catch((err) => {
        console.error('[Transcription] Failed to queue:', err);
      });
    }
  } catch (err) {
    console.error('Error updating recording:', err);
  }

  res.sendStatus(200);
}));

export default router;
