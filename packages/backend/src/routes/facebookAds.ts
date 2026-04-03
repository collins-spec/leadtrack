import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  getFacebookOAuthUrl,
  exchangeCodeForToken,
  getAdAccounts,
  getPages,
  subscribePageToLeadgen,
  syncSpendForConnection,
} from '../services/facebookAds';

const router = Router();

const p = (v: string | string[]): string => Array.isArray(v) ? v[0] : v;

// Helper: verify account belongs to user's organization
async function verifyAccountAccess(accountId: string, organizationId: string) {
  return prisma.account.findFirst({
    where: { id: accountId, organizationId },
  });
}

// Helper: verify connection belongs to user's organization
async function verifyConnectionAccess(connectionId: string, organizationId: string) {
  const connection = await prisma.facebookAdsConnection.findUnique({
    where: { id: connectionId },
    include: { account: { select: { organizationId: true } } },
  });
  if (!connection || connection.account.organizationId !== organizationId) return null;
  return connection;
}

// ─── OAuth Flow ────────────────────────────────────────

// GET /connect?accountId=xxx&name=xxx — returns Facebook OAuth URL
router.get('/connect', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }

  const account = await verifyAccountAccess(accountId, req.user!.organizationId);
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const connectionName = (req.query.name as string) || null;

  const state = Buffer.from(JSON.stringify({
    accountId,
    userId: req.user!.userId,
    organizationId: req.user!.organizationId,
    connectionName,
  })).toString('base64url');

  const url = getFacebookOAuthUrl(state);
  res.json({ url });
}));

// GET /callback?code=xxx&state=xxx — OAuth redirect handler
router.get('/callback', asyncHandler(async (req: Request, res: Response) => {
  const { code, state } = req.query as { code: string; state: string };
  if (!code || !state) { res.status(400).json({ error: 'Missing code or state' }); return; }

  let stateData: { accountId: string; userId: string; organizationId: string; connectionName?: string };
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
  } catch {
    res.status(400).json({ error: 'Invalid state parameter' }); return;
  }

  const { accessToken, expiresIn, email } = await exchangeCodeForToken(code);

  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

  await prisma.facebookAdsConnection.create({
    data: {
      accountId: stateData.accountId,
      name: stateData.connectionName || null,
      fbAdAccountId: '', // User selects ad account after connecting
      accessToken,
      fbEmail: email || null,
      tokenExpiresAt,
    },
  });

  res.redirect(`${env.FRONTEND_URL}/dashboard/settings?facebookAdsConnected=true`);
}));

// ─── Connection Management ──────────────────────────────

// GET /connections?accountId=xxx&page=1&limit=25&status=active|inactive|failing|expiring&search=xxx
router.get('/connections', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }

  const account = await verifyAccountAccess(accountId, req.user!.organizationId);
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;

  const where: Record<string, any> = { accountId };
  if (status === 'active') { where.isActive = true; where.consecutiveFailures = { lt: 5 }; }
  else if (status === 'inactive') { where.isActive = false; }
  else if (status === 'failing') { where.isActive = true; where.consecutiveFailures = { gte: 3 }; }
  else if (status === 'expiring') {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + 14);
    where.isActive = true;
    where.tokenExpiresAt = { lt: cutoff, gt: new Date() };
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { fbEmail: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [connections, total] = await Promise.all([
    prisma.facebookAdsConnection.findMany({
      where,
      include: {
        syncLogs: { take: 5, orderBy: { createdAt: 'desc' } },
        conversionMappings: { orderBy: { tagLabel: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.facebookAdsConnection.count({ where }),
  ]);

  const nextSyncAt = new Date();
  nextSyncAt.setUTCHours(4, 0, 0, 0);
  if (nextSyncAt < new Date()) nextSyncAt.setDate(nextSyncAt.getDate() + 1);

  res.json({
    connections: connections.map((c) => ({
      id: c.id,
      name: c.name,
      fbEmail: c.fbEmail,
      fbAdAccountId: c.fbAdAccountId,
      fbPageId: c.fbPageId,
      isActive: c.isActive,
      leadFormSyncEnabled: c.leadFormSyncEnabled,
      lastSyncAt: c.lastSyncAt,
      lastSyncError: c.lastSyncError,
      tokenExpiresAt: c.tokenExpiresAt,
      tokenRefreshedAt: c.tokenRefreshedAt,
      consecutiveFailures: c.consecutiveFailures,
      isThrottled: c.isThrottled,
      throttledUntil: c.throttledUntil,
      nextSyncAt,
      syncHistory: c.syncLogs,
      conversionMappings: c.conversionMappings,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}));

// GET /connections/expiring?accountId=xxx — connections with tokens expiring within 14 days
router.get('/connections/expiring', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }

  const account = await verifyAccountAccess(accountId, req.user!.organizationId);
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const { getExpiringTokenConnections } = await import('../services/facebookAds');
  const expiring = await getExpiringTokenConnections(accountId);
  res.json({ connections: expiring });
}));

// GET /connections/health?accountId=xxx — health summary
router.get('/connections/health', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }

  const account = await verifyAccountAccess(accountId, req.user!.organizationId);
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + 14);

  const [total, active, failing, throttled, expiring] = await Promise.all([
    prisma.facebookAdsConnection.count({ where: { accountId } }),
    prisma.facebookAdsConnection.count({ where: { accountId, isActive: true, consecutiveFailures: { lt: 3 } } }),
    prisma.facebookAdsConnection.count({ where: { accountId, isActive: true, consecutiveFailures: { gte: 3 } } }),
    prisma.facebookAdsConnection.count({ where: { accountId, isThrottled: true } }),
    prisma.facebookAdsConnection.count({ where: { accountId, isActive: true, tokenExpiresAt: { lt: cutoff, gt: new Date() } } }),
  ]);

  const lastSync = await prisma.facebookAdsSyncLog.findFirst({
    where: { connection: { accountId } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, status: true },
  });

  res.json({ total, active, failing, throttled, expiring, inactive: total - active - failing, lastSync });
}));

// POST /bulk-sync — trigger sync for all active connections under an account (queued)
router.post('/bulk-sync', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { accountId, dateRangeStart, dateRangeEnd } = req.body;
  if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }

  const account = await verifyAccountAccess(accountId, req.user!.organizationId);
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const { enqueueSyncs } = await import('../services/syncRunner');
  const connections = await prisma.facebookAdsConnection.findMany({
    where: { accountId, isActive: true, fbAdAccountId: { not: '' } },
    select: { id: true },
  });

  const enqueued = await enqueueSyncs(
    'facebook_ads', 'FACEBOOK_ADS_SPEND',
    connections.map((c) => c.id),
    { priority: 1, dateRangeStart, dateRangeEnd },
  );

  res.json({ message: `Enqueued ${enqueued} syncs`, enqueued });
}));

// GET /ad-accounts?connectionId=xxx — list available ad accounts
router.get('/ad-accounts', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const connectionId = req.query.connectionId as string;
  if (!connectionId) { res.status(400).json({ error: 'connectionId required' }); return; }

  const connection = await verifyConnectionAccess(connectionId, req.user!.organizationId);
  if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

  const adAccounts = await getAdAccounts(connection.accessToken);
  res.json({ adAccounts });
}));

// GET /pages?connectionId=xxx — list Facebook Pages for Lead Ads
router.get('/pages', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const connectionId = req.query.connectionId as string;
  if (!connectionId) { res.status(400).json({ error: 'connectionId required' }); return; }

  const connection = await verifyConnectionAccess(connectionId, req.user!.organizationId);
  if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

  const pages = await getPages(connection.accessToken);
  res.json({ pages: pages.map((p) => ({ id: p.id, name: p.name })) });
}));

// PATCH /connection — update a specific connection
const updateConnectionSchema = z.object({
  connectionId: z.string(),
  name: z.string().optional(),
  fbAdAccountId: z.string().optional(),
  isActive: z.boolean().optional(),
  fbPageId: z.string().optional(),
  leadFormSyncEnabled: z.boolean().optional(),
});

router.patch('/connection', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const body = updateConnectionSchema.parse(req.body);

  const connection = await verifyConnectionAccess(body.connectionId, req.user!.organizationId);
  if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

  // If enabling lead form sync with a page, subscribe to leadgen webhooks
  if (body.leadFormSyncEnabled && body.fbPageId && body.fbPageId !== connection.fbPageId) {
    try {
      const pages = await getPages(connection.accessToken);
      const page = pages.find((p) => p.id === body.fbPageId);
      if (page) {
        await subscribePageToLeadgen(page.id, page.accessToken);
      }
    } catch (err) {
      console.error('[FacebookAds] Failed to subscribe page to leadgen:', err);
    }
  }

  const updated = await prisma.facebookAdsConnection.update({
    where: { id: body.connectionId },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.fbAdAccountId !== undefined ? { fbAdAccountId: body.fbAdAccountId } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.fbPageId !== undefined ? { fbPageId: body.fbPageId } : {}),
      ...(body.leadFormSyncEnabled !== undefined ? { leadFormSyncEnabled: body.leadFormSyncEnabled } : {}),
    },
  });
  res.json(updated);
}));

// DELETE /disconnect?connectionId=xxx
router.delete('/disconnect', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const connectionId = req.query.connectionId as string;
  if (!connectionId) { res.status(400).json({ error: 'connectionId required' }); return; }

  const connection = await verifyConnectionAccess(connectionId, req.user!.organizationId);
  if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

  await prisma.facebookAdsConnection.delete({ where: { id: connectionId } });
  res.status(204).send();
}));

// POST /sync — manual spend sync trigger
router.post('/sync', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { connectionId } = req.body;
  if (!connectionId) { res.status(400).json({ error: 'connectionId required' }); return; }

  const connection = await verifyConnectionAccess(connectionId, req.user!.organizationId);
  if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

  syncSpendForConnection(connection.id).catch((err) =>
    console.error('[FacebookAds] Manual sync error:', err),
  );

  res.json({ message: 'Sync started' });
}));

// ─── Conversion Mappings ────────────────────────────────

// GET /conversion-mappings?connectionId=xxx
router.get('/conversion-mappings', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const connectionId = req.query.connectionId as string;
  if (!connectionId) { res.status(400).json({ error: 'connectionId required' }); return; }

  const connection = await verifyConnectionAccess(connectionId, req.user!.organizationId);
  if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

  const mappings = await prisma.facebookConversionMapping.findMany({
    where: { connectionId },
    orderBy: { tagLabel: 'asc' },
  });

  res.json({ mappings });
}));

// POST /conversion-mappings
const conversionMappingSchema = z.object({
  connectionId: z.string(),
  tagLabel: z.string(),
  pixelEventName: z.string(),
});

router.post('/conversion-mappings', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const body = conversionMappingSchema.parse(req.body);

  const connection = await verifyConnectionAccess(body.connectionId, req.user!.organizationId);
  if (!connection) { res.status(404).json({ error: 'Connection not found' }); return; }

  const mapping = await prisma.facebookConversionMapping.upsert({
    where: {
      connectionId_tagLabel: {
        connectionId: body.connectionId,
        tagLabel: body.tagLabel,
      },
    },
    create: {
      connectionId: body.connectionId,
      tagLabel: body.tagLabel,
      pixelEventName: body.pixelEventName,
    },
    update: {
      pixelEventName: body.pixelEventName,
    },
  });

  res.json(mapping);
}));

// DELETE /conversion-mappings/:id
router.delete('/conversion-mappings/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const id = p(req.params.id);

  const mapping = await prisma.facebookConversionMapping.findUnique({ where: { id } });
  if (!mapping) { res.status(404).json({ error: 'Mapping not found' }); return; }

  const connection = await verifyConnectionAccess(mapping.connectionId, req.user!.organizationId);
  if (!connection) { res.status(404).json({ error: 'Mapping not found' }); return; }

  await prisma.facebookConversionMapping.delete({ where: { id } });
  res.status(204).send();
}));

export default router;
