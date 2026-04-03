import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

async function verifyAccountAccess(accountId: string, organizationId: string) {
  return prisma.account.findFirst({
    where: { id: accountId, organizationId },
  });
}

// GET /summary?accountId=xxx — combined stats across Google + Facebook
router.get('/summary', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }

  const account = await verifyAccountAccess(accountId, req.user!.organizationId);
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const cutoff14d = new Date(); cutoff14d.setDate(cutoff14d.getDate() + 14);

  const [
    googleTotal, googleActive, googleFailing,
    fbTotal, fbActive, fbFailing, fbExpiring,
  ] = await Promise.all([
    prisma.googleAdsConnection.count({ where: { accountId } }),
    prisma.googleAdsConnection.count({ where: { accountId, isActive: true, consecutiveFailures: { lt: 3 } } }),
    prisma.googleAdsConnection.count({ where: { accountId, isActive: true, consecutiveFailures: { gte: 3 } } }),
    prisma.facebookAdsConnection.count({ where: { accountId } }),
    prisma.facebookAdsConnection.count({ where: { accountId, isActive: true, consecutiveFailures: { lt: 3 } } }),
    prisma.facebookAdsConnection.count({ where: { accountId, isActive: true, consecutiveFailures: { gte: 3 } } }),
    prisma.facebookAdsConnection.count({ where: { accountId, isActive: true, tokenExpiresAt: { lt: cutoff14d, gt: new Date() } } }),
  ]);

  // Get yesterday's total spend from SpendEntry
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);

  const dailySpend = await prisma.spendEntry.aggregate({
    where: { accountId, date: new Date(yStr), source: { in: ['Google Ads', 'Facebook Ads'] } },
    _sum: { spend: true },
  });

  // Last sync times
  const [googleLastSync, fbLastSync] = await Promise.all([
    prisma.googleAdsSyncLog.findFirst({
      where: { connection: { accountId } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, status: true },
    }),
    prisma.facebookAdsSyncLog.findFirst({
      where: { connection: { accountId } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, status: true },
    }),
  ]);

  res.json({
    google: {
      total: googleTotal,
      active: googleActive,
      failing: googleFailing,
      inactive: googleTotal - googleActive - googleFailing,
      lastSync: googleLastSync,
    },
    facebook: {
      total: fbTotal,
      active: fbActive,
      failing: fbFailing,
      expiring: fbExpiring,
      inactive: fbTotal - fbActive - fbFailing,
      lastSync: fbLastSync,
    },
    combined: {
      totalConnections: googleTotal + fbTotal,
      activeConnections: googleActive + fbActive,
      failingConnections: googleFailing + fbFailing,
      yesterdaySpend: dailySpend._sum.spend || 0,
    },
  });
}));

export default router;
