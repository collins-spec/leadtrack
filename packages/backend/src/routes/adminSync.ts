import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

// GET /sync-health — admin-only monitoring endpoint
router.get('/sync-health', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  // Only allow OWNER role
  if (req.user!.role !== 'OWNER' && req.user!.role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  // Total connections across all accounts in this org
  const orgAccounts = await prisma.account.findMany({
    where: { organizationId: req.user!.organizationId },
    select: { id: true },
  });
  const accountIds = orgAccounts.map((a) => a.id);

  const [
    googleTotal, googleActive, googleFailing, googleThrottled,
    fbTotal, fbActive, fbFailing, fbThrottled, fbExpiring,
  ] = await Promise.all([
    prisma.googleAdsConnection.count({ where: { accountId: { in: accountIds } } }),
    prisma.googleAdsConnection.count({ where: { accountId: { in: accountIds }, isActive: true, consecutiveFailures: { lt: 3 } } }),
    prisma.googleAdsConnection.count({ where: { accountId: { in: accountIds }, isActive: true, consecutiveFailures: { gte: 3 } } }),
    prisma.googleAdsConnection.count({ where: { accountId: { in: accountIds }, isThrottled: true } }),
    prisma.facebookAdsConnection.count({ where: { accountId: { in: accountIds } } }),
    prisma.facebookAdsConnection.count({ where: { accountId: { in: accountIds }, isActive: true, consecutiveFailures: { lt: 3 } } }),
    prisma.facebookAdsConnection.count({ where: { accountId: { in: accountIds }, isActive: true, consecutiveFailures: { gte: 3 } } }),
    prisma.facebookAdsConnection.count({ where: { accountId: { in: accountIds }, isThrottled: true } }),
    prisma.facebookAdsConnection.count({
      where: {
        accountId: { in: accountIds }, isActive: true,
        tokenExpiresAt: { lt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), gt: now },
      },
    }),
  ]);

  // Syncs in last 24 hours
  const [googleSyncs24h, fbSyncs24h] = await Promise.all([
    prisma.googleAdsSyncLog.findMany({
      where: { connection: { accountId: { in: accountIds } }, createdAt: { gte: twentyFourHoursAgo } },
      select: { status: true, durationMs: true },
    }),
    prisma.facebookAdsSyncLog.findMany({
      where: { connection: { accountId: { in: accountIds } }, createdAt: { gte: twentyFourHoursAgo } },
      select: { status: true, durationMs: true },
    }),
  ]);

  const allSyncs24h = [...googleSyncs24h, ...fbSyncs24h];
  const successCount = allSyncs24h.filter((s) => s.status === 'SUCCESS').length;
  const failCount = allSyncs24h.filter((s) => s.status === 'ERROR').length;
  const durations = allSyncs24h.filter((s) => s.durationMs != null).map((s) => s.durationMs!);
  const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

  // Connections that haven't synced in 48h+
  const [googleStale, fbStale] = await Promise.all([
    prisma.googleAdsConnection.count({
      where: {
        accountId: { in: accountIds }, isActive: true,
        OR: [{ lastSyncAt: { lt: fortyEightHoursAgo } }, { lastSyncAt: null }],
      },
    }),
    prisma.facebookAdsConnection.count({
      where: {
        accountId: { in: accountIds }, isActive: true,
        OR: [{ lastSyncAt: { lt: fortyEightHoursAgo } }, { lastSyncAt: null }],
      },
    }),
  ]);

  // Queue status
  const [queuePending, queueInProgress, queueFailed] = await Promise.all([
    prisma.syncQueue.count({ where: { status: 'PENDING', accountId: { in: accountIds } } }),
    prisma.syncQueue.count({ where: { status: 'IN_PROGRESS', accountId: { in: accountIds } } }),
    prisma.syncQueue.count({ where: { status: 'FAILED', accountId: { in: accountIds }, createdAt: { gte: twentyFourHoursAgo } } }),
  ]);

  res.json({
    connections: {
      google: { total: googleTotal, active: googleActive, failing: googleFailing, throttled: googleThrottled },
      facebook: { total: fbTotal, active: fbActive, failing: fbFailing, throttled: fbThrottled, expiring: fbExpiring },
    },
    syncsLast24h: {
      total: allSyncs24h.length,
      success: successCount,
      failed: failCount,
      failureRate: allSyncs24h.length > 0 ? Math.round((failCount / allSyncs24h.length) * 100) : 0,
      avgDurationMs: avgDuration,
    },
    staleConnections: { google: googleStale, facebook: fbStale, total: googleStale + fbStale },
    queue: { pending: queuePending, inProgress: queueInProgress, failedLast24h: queueFailed },
  });
}));

export default router;
