import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { asyncHandler } from '../middleware/asyncHandler';
import { getOrCreateDNISession, heartbeatSession } from '../services/dni';

const router = Router();

// ── Validation schemas ───────────────────────────────────────────────────────

const sessionSchema = z.object({
  accountId: z.string().min(1),
  sessionToken: z.string().optional(),
  visitorId: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmTerm: z.string().optional(),
  utmContent: z.string().optional(),
  gclid: z.string().optional(),
  gbraid: z.string().optional(),
  wbraid: z.string().optional(),
  fbclid: z.string().optional(),
  referrer: z.string().optional(),
  landingPage: z.string().optional(),
  userAgent: z.string().optional(),
});

const heartbeatSchema = z.object({
  sessionToken: z.string().min(1),
});

// ── POST /session — Create or refresh a DNI session ──────────────────────────
// Public, no auth (called by client-site snippet)

router.post('/session', asyncHandler(async (req: Request, res: Response) => {
  let body;
  try {
    body = sessionSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    throw err;
  }

  // Verify account exists
  const account = await prisma.account.findUnique({ where: { id: body.accountId } });
  if (!account) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  // Extract IP address
  const forwarded = req.headers['x-forwarded-for'];
  const ipAddress = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : req.ip || undefined;

  try {
    const result = await getOrCreateDNISession({
      ...body,
      ipAddress,
      userAgent: body.userAgent || (req.headers['user-agent'] as string) || undefined,
    });
    res.json(result);
  } catch (err: any) {
    if (err.message === 'NO_DNI_NUMBERS') {
      res.status(503).json({ error: 'No DNI pool numbers available for this account' });
      return;
    }
    throw err;
  }
}));

// ── POST /heartbeat — Extend an active session ──────────────────────────────
// Called on page navigations to keep the session alive

router.post('/heartbeat', asyncHandler(async (req: Request, res: Response) => {
  let body;
  try {
    body = heartbeatSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed' });
      return;
    }
    throw err;
  }

  const result = await heartbeatSession(body.sessionToken);
  if (!result) {
    res.status(404).json({ error: 'Session not found or expired' });
    return;
  }

  res.json(result);
}));

// ── GET /config/:accountId — DNI config for the snippet ──────────────────────

router.get('/config/:accountId', asyncHandler(async (req: Request, res: Response) => {
  const accountId = String(req.params.accountId);

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, businessPhone: true },
  });

  if (!account) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  const poolSize = await prisma.trackingNumber.count({
    where: { accountId, isDNIPool: true, isActive: true },
  });

  res.set('Cache-Control', 'public, max-age=300'); // 5 min cache
  res.json({
    defaultNumber: account.businessPhone,
    sessionTimeoutMinutes: 30,
    poolSize,
  });
}));

export default router;
