import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { buildTwiML, buildWhisperTwiML } from '../services/twilio';
import { CallStatus } from '@prisma/client';
import { asyncHandler } from '../middleware/asyncHandler';
import { queueTranscription } from '../services/transcription';
import { emitNotification } from '../services/notification';
import { resolveGclidAttribution } from '../services/googleAds';
import { fetchLeadData } from '../services/facebookAds';

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

  // Look up default pipeline stage for auto-assignment
  const defaultStage = await prisma.pipelineStage.findFirst({
    where: { accountId: trackingNumber.accountId, isDefault: true },
  });

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
      fbclid: dniSession?.fbclid || null,
      utmSource: dniSession?.utmSource || null,
      utmMedium: dniSession?.utmMedium || null,
      utmCampaign: dniSession?.utmCampaign || null,
      utmTerm: dniSession?.utmTerm || null,
      utmContent: dniSession?.utmContent || null,
      landingPage: dniSession?.landingPage || null,
      whisperPlayed: `Call from ${trackingNumber.source} ${trackingNumber.campaignTag || trackingNumber.medium}`,
      pipelineStageId: defaultStage?.id || null,
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

// ─── Facebook Lead Ads Webhook ──────────────────────────

// GET /facebook/leadgen — Webhook verification
router.get('/facebook/leadgen', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'] as string;
  const token = req.query['hub.verify_token'] as string;
  const challenge = req.query['hub.challenge'] as string;

  if (mode === 'subscribe' && token === env.FACEBOOK_WEBHOOK_VERIFY_TOKEN) {
    console.log('[FacebookAds] Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// POST /facebook/leadgen — Receive leadgen events
router.post('/facebook/leadgen', asyncHandler(async (req: Request, res: Response) => {
  // Validate signature
  const signature = req.headers['x-hub-signature-256'] as string;
  if (signature && env.FACEBOOK_APP_SECRET) {
    const expectedSig = 'sha256=' + crypto
      .createHmac('sha256', env.FACEBOOK_APP_SECRET)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (signature !== expectedSig) {
      console.error('[FacebookAds] Invalid webhook signature');
      res.sendStatus(403);
      return;
    }
  }

  const body = req.body;

  // Process each entry
  for (const entry of (body.entry || [])) {
    for (const change of (entry.changes || [])) {
      if (change.field !== 'leadgen') continue;

      const leadgenId = change.value?.leadgen_id;
      const pageId = change.value?.page_id?.toString();

      if (!leadgenId || !pageId) continue;

      // Find the Facebook connection for this page
      const connection = await prisma.facebookAdsConnection.findFirst({
        where: { fbPageId: pageId, leadFormSyncEnabled: true, isActive: true },
      });

      if (!connection) {
        console.log(`[FacebookAds] No active connection found for page ${pageId}`);
        continue;
      }

      // Check for duplicate
      const existing = await prisma.formLead.findFirst({
        where: { externalId: `fb_${leadgenId}` },
      });
      if (existing) {
        console.log(`[FacebookAds] Duplicate lead ${leadgenId}, skipping`);
        continue;
      }

      try {
        const leadData = await fetchLeadData(leadgenId, connection.accessToken);

        // Look up default pipeline stage
        const defaultStage = await prisma.pipelineStage.findFirst({
          where: { accountId: connection.accountId, isDefault: true },
        });

        await prisma.formLead.create({
          data: {
            accountId: connection.accountId,
            formData: leadData.formData,
            utmSource: 'Facebook Lead Ad',
            utmCampaign: leadData.campaignName,
            externalId: `fb_${leadgenId}`,
            pipelineStageId: defaultStage?.id || null,
          },
        });

        // Notify
        emitNotification(connection.accountId, 'NEW_FORM', {
          formData: leadData.formData,
        }).catch((err) => console.error('[Notification] NEW_FORM emit failed:', err));

        console.log(`[FacebookAds] Created form lead from leadgen ${leadgenId} for account ${connection.accountId}`);
      } catch (err) {
        console.error(`[FacebookAds] Failed to process leadgen ${leadgenId}:`, err);
      }
    }
  }

  res.sendStatus(200);
}));

export default router;
