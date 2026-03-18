import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  getGoogleOAuthUrl,
  exchangeCodeForTokens,
  syncSpendForConnection,
  fetchConversionActions,
} from '../services/googleAds';

const router = Router();

const p = (v: string | string[]): string => Array.isArray(v) ? v[0] : v;

// ─── OAuth Flow ────────────────────────────────────────

// GET /connect?accountId=xxx — returns OAuth consent URL
router.get('/connect', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }

  const account = await prisma.account.findFirst({
    where: { id: accountId, organizationId: req.user!.organizationId },
  });
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const state = Buffer.from(JSON.stringify({
    accountId,
    userId: req.user!.userId,
    organizationId: req.user!.organizationId,
  })).toString('base64url');

  const url = getGoogleOAuthUrl(state);
  res.json({ url });
}));

// GET /callback?code=xxx&state=xxx — OAuth redirect handler
router.get('/callback', asyncHandler(async (req: Request, res: Response) => {
  const { code, state } = req.query as { code: string; state: string };
  if (!code || !state) { res.status(400).json({ error: 'Missing code or state' }); return; }

  let stateData: { accountId: string; userId: string; organizationId: string };
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
  } catch {
    res.status(400).json({ error: 'Invalid state parameter' }); return;
  }

  const { refreshToken, email } = await exchangeCodeForTokens(code);

  await prisma.googleAdsConnection.upsert({
    where: { accountId: stateData.accountId },
    update: { refreshToken, googleEmail: email || null, isActive: true },
    create: {
      accountId: stateData.accountId,
      googleCustomerId: '',
      refreshToken,
      googleEmail: email || null,
    },
  });

  res.redirect(`${env.FRONTEND_URL}/dashboard/settings?googleAdsConnected=true`);
}));

// ─── Connection Management ──────────────────────────────

// GET /status?accountId=xxx
router.get('/status', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }

  const account = await prisma.account.findFirst({
    where: { id: accountId, organizationId: req.user!.organizationId },
  });
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const connection = await prisma.googleAdsConnection.findUnique({
    where: { accountId },
    include: { syncLogs: { take: 5, orderBy: { createdAt: 'desc' } } },
  });
  if (!connection) { res.json({ connected: false }); return; }

  // Calculate next sync time (6am UTC daily)
  const nextSyncAt = new Date();
  nextSyncAt.setHours(6, 0, 0, 0);
  if (nextSyncAt < new Date()) nextSyncAt.setDate(nextSyncAt.getDate() + 1);

  res.json({
    connected: true,
    isActive: connection.isActive,
    googleEmail: connection.googleEmail,
    googleCustomerId: connection.googleCustomerId,
    lastSyncAt: connection.lastSyncAt,
    lastSyncError: connection.lastSyncError,
    nextSyncAt,
    syncHistory: connection.syncLogs,
  });
}));

// PATCH /connection
const updateConnectionSchema = z.object({
  accountId: z.string(),
  googleCustomerId: z.string().optional(),
  isActive: z.boolean().optional(),
});

router.patch('/connection', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const body = updateConnectionSchema.parse(req.body);

  const account = await prisma.account.findFirst({
    where: { id: body.accountId, organizationId: req.user!.organizationId },
  });
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const connection = await prisma.googleAdsConnection.findUnique({
    where: { accountId: body.accountId },
  });
  if (!connection) { res.status(404).json({ error: 'No Google Ads connection found' }); return; }

  const updated = await prisma.googleAdsConnection.update({
    where: { accountId: body.accountId },
    data: {
      ...(body.googleCustomerId !== undefined ? { googleCustomerId: body.googleCustomerId } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
  });
  res.json(updated);
}));

// DELETE /disconnect?accountId=xxx
router.delete('/disconnect', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }

  const account = await prisma.account.findFirst({
    where: { id: accountId, organizationId: req.user!.organizationId },
  });
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  await prisma.googleAdsConnection.deleteMany({ where: { accountId } });
  res.status(204).send();
}));

// POST /sync — manual trigger
router.post('/sync', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.body;
  if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }

  const account = await prisma.account.findFirst({
    where: { id: accountId, organizationId: req.user!.organizationId },
  });
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const connection = await prisma.googleAdsConnection.findUnique({ where: { accountId } });
  if (!connection) { res.status(404).json({ error: 'No Google Ads connection found' }); return; }

  syncSpendForConnection(connection.id).catch((err) =>
    console.error('[GoogleAds] Manual sync error:', err),
  );

  res.json({ message: 'Sync started' });
}));

// ─── Conversion Actions ─────────────────────────────────

// GET /conversion-actions?accountId=xxx
router.get('/conversion-actions', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }

  const account = await prisma.account.findFirst({
    where: { id: accountId, organizationId: req.user!.organizationId },
  });
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const conversionActions = await fetchConversionActions(accountId);
  res.json({ conversionActions });
}));

// GET /conversion-mappings?accountId=xxx
router.get('/conversion-mappings', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }

  const account = await prisma.account.findFirst({
    where: { id: accountId, organizationId: req.user!.organizationId },
  });
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const mappings = await prisma.conversionActionMapping.findMany({
    where: { accountId },
    orderBy: { tagLabel: 'asc' },
  });

  res.json({ mappings });
}));

// POST /conversion-mappings
const conversionMappingSchema = z.object({
  accountId: z.string(),
  tagLabel: z.string(),
  conversionActionId: z.string(),
  conversionActionName: z.string(),
});

router.post('/conversion-mappings', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const body = conversionMappingSchema.parse(req.body);

  const account = await prisma.account.findFirst({
    where: { id: body.accountId, organizationId: req.user!.organizationId },
  });
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const mapping = await prisma.conversionActionMapping.upsert({
    where: {
      accountId_tagLabel: {
        accountId: body.accountId,
        tagLabel: body.tagLabel,
      },
    },
    create: {
      accountId: body.accountId,
      tagLabel: body.tagLabel,
      conversionActionId: body.conversionActionId,
      conversionActionName: body.conversionActionName,
    },
    update: {
      conversionActionId: body.conversionActionId,
      conversionActionName: body.conversionActionName,
    },
  });

  res.json(mapping);
}));

// DELETE /conversion-mappings/:id
router.delete('/conversion-mappings/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const id = p(req.params.id);

  const mapping = await prisma.conversionActionMapping.findUnique({ where: { id } });
  if (!mapping) { res.status(404).json({ error: 'Mapping not found' }); return; }

  const account = await prisma.account.findFirst({
    where: { id: mapping.accountId, organizationId: req.user!.organizationId },
  });
  if (!account) { res.status(404).json({ error: 'Mapping not found' }); return; }

  await prisma.conversionActionMapping.delete({ where: { id } });
  res.status(204).send();
}));

export default router;
