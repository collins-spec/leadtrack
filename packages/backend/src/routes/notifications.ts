import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { emitNotification } from '../services/notification';

const router = Router();
router.use(authMiddleware);

const p = (v: string | string[]): string => Array.isArray(v) ? v[0] : v;

// Helper: verify config belongs to user's org
async function verifyConfigOwnership(configId: string, orgId: string) {
  const config = await prisma.notificationConfig.findUnique({ where: { id: configId } });
  if (!config) return null;
  const account = await prisma.account.findFirst({
    where: { id: config.accountId, organizationId: orgId },
  });
  if (!account) return null;
  return config;
}

// ─── Notification Config CRUD ──────────────────────────────

router.get('/configs', asyncHandler(async (req: Request, res: Response) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }

  const account = await prisma.account.findFirst({
    where: { id: accountId, organizationId: req.user!.organizationId },
  });
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const configs = await prisma.notificationConfig.findMany({
    where: { accountId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(configs);
}));

const createConfigSchema = z.object({
  accountId: z.string(),
  channel: z.enum(['EMAIL', 'SLACK', 'WEBHOOK']),
  target: z.string().min(1),
  events: z.array(z.enum(['NEW_CALL', 'MISSED_CALL', 'NEW_FORM', 'HIGH_VALUE_LEAD', 'DAILY_DIGEST'])).min(1),
  isActive: z.boolean().default(true),
});

router.post('/configs', asyncHandler(async (req: Request, res: Response) => {
  const body = createConfigSchema.parse(req.body);

  const account = await prisma.account.findFirst({
    where: { id: body.accountId, organizationId: req.user!.organizationId },
  });
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const config = await prisma.notificationConfig.create({ data: body });
  res.status(201).json(config);
}));

const updateConfigSchema = z.object({
  isActive: z.boolean().optional(),
  events: z.array(z.enum(['NEW_CALL', 'MISSED_CALL', 'NEW_FORM', 'HIGH_VALUE_LEAD', 'DAILY_DIGEST'])).optional(),
});

router.patch('/configs/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = p(req.params.id);
  const body = updateConfigSchema.parse(req.body);

  const config = await verifyConfigOwnership(id, req.user!.organizationId);
  if (!config) { res.status(404).json({ error: 'Config not found' }); return; }

  const updated = await prisma.notificationConfig.update({
    where: { id },
    data: body,
  });
  res.json(updated);
}));

router.delete('/configs/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = p(req.params.id);

  const config = await verifyConfigOwnership(id, req.user!.organizationId);
  if (!config) { res.status(404).json({ error: 'Config not found' }); return; }

  await prisma.notificationConfig.delete({ where: { id } });
  res.status(204).send();
}));

router.post('/configs/:id/test', asyncHandler(async (req: Request, res: Response) => {
  const id = p(req.params.id);

  const config = await verifyConfigOwnership(id, req.user!.organizationId);
  if (!config) { res.status(404).json({ error: 'Config not found' }); return; }

  await emitNotification(config.accountId, 'NEW_CALL', {
    callerNumber: '+15551234567',
    callerCity: 'Test City',
    callerState: 'TS',
    source: 'Test Source',
  });

  res.json({ ok: true, message: 'Test notification sent' });
}));

// ─── In-App Notifications ──────────────────────────────────

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  const cursor = req.query.cursor as string | undefined;

  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = notifications.length > limit;
  if (hasMore) notifications.pop();

  res.json({
    notifications,
    nextCursor: hasMore ? notifications[notifications.length - 1].id : null,
  });
}));

router.get('/unread-count', asyncHandler(async (req: Request, res: Response) => {
  const count = await prisma.notification.count({
    where: { userId: req.user!.userId, isRead: false },
  });
  res.json({ count });
}));

router.post('/:id/read', asyncHandler(async (req: Request, res: Response) => {
  const id = p(req.params.id);
  await prisma.notification.updateMany({
    where: { id, userId: req.user!.userId },
    data: { isRead: true },
  });
  res.json({ ok: true });
}));

router.post('/read-all', asyncHandler(async (req: Request, res: Response) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.userId, isRead: false },
    data: { isRead: true },
  });
  res.json({ ok: true });
}));

export default router;
