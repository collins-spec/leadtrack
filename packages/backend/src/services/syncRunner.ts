import { prisma } from '../config/prisma';

// ─── Types ──────────────────────────────────────────────

export interface SyncableConnection {
  id: string;
  accountId: string;
  isActive: boolean;
  consecutiveFailures: number;
  isThrottled: boolean;
  throttledUntil: Date | null;
}

export interface SyncResult {
  connectionId: string;
  success: boolean;
  recordsSynced: number;
  error?: string;
  durationMs: number;
}

export type SyncFunction = (connectionId: string, dateRange?: { start: string; end: string }) => Promise<number>;

// ─── Configuration ──────────────────────────────────────

const MAX_CONSECUTIVE_FAILURES = 5;
const THROTTLE_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours
const BATCH_SIZE = 10;

// ─── Rate Limiter ───────────────────────────────────────
// Simple in-memory sliding window rate limiter per platform

interface RateLimitWindow {
  timestamps: number[];
  windowMs: number;
  maxRequests: number;
}

const rateLimiters = new Map<string, RateLimitWindow>();

export function initRateLimiter(platform: string, maxRequests: number, windowMs: number) {
  rateLimiters.set(platform, { timestamps: [], windowMs, maxRequests });
}

async function waitForRateLimit(platform: string): Promise<void> {
  const limiter = rateLimiters.get(platform);
  if (!limiter) return;

  const now = Date.now();
  // Remove timestamps outside the window
  limiter.timestamps = limiter.timestamps.filter((t) => now - t < limiter.windowMs);

  if (limiter.timestamps.length >= limiter.maxRequests) {
    const oldestInWindow = limiter.timestamps[0];
    const waitMs = limiter.windowMs - (now - oldestInWindow) + 100; // +100ms buffer
    console.log(`[RateLimit] ${platform}: waiting ${Math.round(waitMs / 1000)}s before next request`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  limiter.timestamps.push(Date.now());
}

// Initialize rate limiters
// Google Ads: 15,000 requests/day ≈ 625/hour. Be conservative: 500/hour.
initRateLimiter('google_ads', 500, 60 * 60 * 1000);
// Facebook: 200 calls/hour per ad account. We batch across accounts: 150/hour.
initRateLimiter('facebook_ads', 150, 60 * 60 * 1000);

// ─── Health Management ──────────────────────────────────

export async function recordSyncSuccess(
  platform: 'google_ads' | 'facebook_ads',
  connectionId: string,
  recordsSynced: number,
  durationMs: number,
) {
  const now = new Date();

  if (platform === 'google_ads') {
    await prisma.googleAdsConnection.update({
      where: { id: connectionId },
      data: {
        lastSyncAt: now,
        lastSyncError: null,
        consecutiveFailures: 0,
        isThrottled: false,
        throttledUntil: null,
        lastHealthCheck: now,
      },
    });
    await prisma.googleAdsSyncLog.create({
      data: { connectionId, status: 'SUCCESS', recordsSynced, durationMs },
    });
  } else {
    await prisma.facebookAdsConnection.update({
      where: { id: connectionId },
      data: {
        lastSyncAt: now,
        lastSyncError: null,
        consecutiveFailures: 0,
        isThrottled: false,
        throttledUntil: null,
        lastHealthCheck: now,
      },
    });
    await prisma.facebookAdsSyncLog.create({
      data: { connectionId, status: 'SUCCESS', recordsSynced, durationMs },
    });
  }
}

export async function recordSyncFailure(
  platform: 'google_ads' | 'facebook_ads',
  connectionId: string,
  error: string,
  durationMs: number,
) {
  const now = new Date();

  if (platform === 'google_ads') {
    const conn = await prisma.googleAdsConnection.findUnique({ where: { id: connectionId } });
    const failures = (conn?.consecutiveFailures || 0) + 1;
    const shouldThrottle = failures >= MAX_CONSECUTIVE_FAILURES;

    await prisma.googleAdsConnection.update({
      where: { id: connectionId },
      data: {
        lastSyncError: error.slice(0, 500),
        consecutiveFailures: failures,
        isThrottled: shouldThrottle,
        throttledUntil: shouldThrottle ? new Date(Date.now() + THROTTLE_COOLDOWN_MS) : undefined,
        lastHealthCheck: now,
      },
    });
    await prisma.googleAdsSyncLog.create({
      data: { connectionId, status: 'ERROR', error: error.slice(0, 500), durationMs },
    });

    if (shouldThrottle) {
      console.warn(`[SyncRunner] Google Ads connection ${connectionId} throttled after ${failures} consecutive failures`);
    }
  } else {
    const conn = await prisma.facebookAdsConnection.findUnique({ where: { id: connectionId } });
    const failures = (conn?.consecutiveFailures || 0) + 1;
    const shouldThrottle = failures >= MAX_CONSECUTIVE_FAILURES;

    await prisma.facebookAdsConnection.update({
      where: { id: connectionId },
      data: {
        lastSyncError: error.slice(0, 500),
        consecutiveFailures: failures,
        isThrottled: shouldThrottle,
        throttledUntil: shouldThrottle ? new Date(Date.now() + THROTTLE_COOLDOWN_MS) : undefined,
        lastHealthCheck: now,
      },
    });
    await prisma.facebookAdsSyncLog.create({
      data: { connectionId, status: 'ERROR', error: error.slice(0, 500), durationMs },
    });

    if (shouldThrottle) {
      console.warn(`[SyncRunner] Facebook Ads connection ${connectionId} throttled after ${failures} consecutive failures`);
    }
  }
}

// ─── Batched Sync Runner ────────────────────────────────

export async function runBatchedSync(
  platform: 'google_ads' | 'facebook_ads',
  connections: SyncableConnection[],
  syncFn: SyncFunction,
  dateRange?: { start: string; end: string },
): Promise<SyncResult[]> {
  const now = new Date();

  // Filter out throttled connections
  const eligible = connections.filter((c) => {
    if (!c.isActive) return false;
    if (c.isThrottled && c.throttledUntil && c.throttledUntil > now) {
      console.log(`[SyncRunner] Skipping throttled connection ${c.id} (until ${c.throttledUntil.toISOString()})`);
      return false;
    }
    // Un-throttle if cooldown has passed
    if (c.isThrottled && (!c.throttledUntil || c.throttledUntil <= now)) {
      return true; // Retry after cooldown
    }
    return true;
  });

  console.log(`[SyncRunner] ${platform}: ${eligible.length}/${connections.length} connections eligible for sync`);

  const results: SyncResult[] = [];

  // Process in batches of BATCH_SIZE with Promise.allSettled
  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const batch = eligible.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(eligible.length / BATCH_SIZE);

    console.log(`[SyncRunner] ${platform}: Processing batch ${batchNum}/${totalBatches} (${batch.length} connections)`);

    const batchResults = await Promise.allSettled(
      batch.map(async (conn) => {
        await waitForRateLimit(platform);
        const startTime = Date.now();
        try {
          const recordsSynced = await syncFn(conn.id, dateRange);
          const durationMs = Date.now() - startTime;
          await recordSyncSuccess(platform, conn.id, recordsSynced, durationMs);
          return { connectionId: conn.id, success: true, recordsSynced, durationMs };
        } catch (err: any) {
          const durationMs = Date.now() - startTime;
          const errorMsg = err.message || 'Unknown error';
          await recordSyncFailure(platform, conn.id, errorMsg, durationMs);
          return { connectionId: conn.id, success: false, recordsSynced: 0, error: errorMsg, durationMs };
        }
      }),
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          connectionId: 'unknown',
          success: false,
          recordsSynced: 0,
          error: result.reason?.message || 'Batch processing error',
          durationMs: 0,
        });
      }
    }

    // Small delay between batches to avoid API bursts
    if (i + BATCH_SIZE < eligible.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  console.log(`[SyncRunner] ${platform}: Completed ${successCount} succeeded, ${failCount} failed`);

  return results;
}

// ─── Queue-based Sync ───────────────────────────────────

export async function enqueueSyncs(
  platform: 'google_ads' | 'facebook_ads',
  syncType: 'GOOGLE_ADS_SPEND' | 'GOOGLE_ADS_LEAD_FORMS' | 'FACEBOOK_ADS_SPEND',
  connectionIds: string[],
  options?: { priority?: number; dateRangeStart?: string; dateRangeEnd?: string },
): Promise<number> {
  const isGoogle = platform === 'google_ads';
  let enqueued = 0;

  for (const connId of connectionIds) {
    // Skip if already pending/in-progress for this connection and type
    const existing = await prisma.syncQueue.findFirst({
      where: {
        ...(isGoogle ? { googleAdsConnectionId: connId } : { facebookAdsConnectionId: connId }),
        syncType,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
    });
    if (existing) continue;

    // Look up accountId
    let accountId: string;
    if (isGoogle) {
      const conn = await prisma.googleAdsConnection.findUnique({ where: { id: connId }, select: { accountId: true } });
      if (!conn) continue;
      accountId = conn.accountId;
    } else {
      const conn = await prisma.facebookAdsConnection.findUnique({ where: { id: connId }, select: { accountId: true } });
      if (!conn) continue;
      accountId = conn.accountId;
    }

    await prisma.syncQueue.create({
      data: {
        platform,
        syncType,
        ...(isGoogle ? { googleAdsConnectionId: connId } : { facebookAdsConnectionId: connId }),
        accountId,
        priority: options?.priority ?? 0,
        dateRangeStart: options?.dateRangeStart,
        dateRangeEnd: options?.dateRangeEnd,
      },
    });
    enqueued++;
  }

  return enqueued;
}

export async function processQueuedSyncs(
  platform: 'google_ads' | 'facebook_ads',
  syncFn: SyncFunction,
  limit = BATCH_SIZE,
): Promise<SyncResult[]> {
  const now = new Date();

  // Fetch pending items ordered by priority (desc) then scheduledFor (asc)
  const items = await prisma.syncQueue.findMany({
    where: {
      platform,
      status: 'PENDING',
      scheduledFor: { lte: now },
    },
    orderBy: [{ priority: 'desc' }, { scheduledFor: 'asc' }],
    take: limit,
  });

  if (items.length === 0) return [];

  const results: SyncResult[] = [];

  for (const item of items) {
    // Mark as in-progress
    await prisma.syncQueue.update({
      where: { id: item.id },
      data: { status: 'IN_PROGRESS', startedAt: now, attempt: item.attempt + 1 },
    });

    const connId = item.googleAdsConnectionId || item.facebookAdsConnectionId;
    if (!connId) continue;

    await waitForRateLimit(platform);
    const startTime = Date.now();

    try {
      const dateRange = item.dateRangeStart && item.dateRangeEnd
        ? { start: item.dateRangeStart, end: item.dateRangeEnd }
        : undefined;
      const recordsSynced = await syncFn(connId, dateRange);
      const durationMs = Date.now() - startTime;

      await prisma.syncQueue.update({
        where: { id: item.id },
        data: { status: 'COMPLETED', completedAt: new Date(), recordsSynced, durationMs },
      });
      await recordSyncSuccess(platform, connId, recordsSynced, durationMs);
      results.push({ connectionId: connId, success: true, recordsSynced, durationMs });
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err.message || 'Unknown error';

      const shouldRetry = item.attempt + 1 < item.maxAttempts;
      await prisma.syncQueue.update({
        where: { id: item.id },
        data: {
          status: shouldRetry ? 'PENDING' : 'FAILED',
          error: errorMsg.slice(0, 500),
          durationMs,
          // Exponential backoff: 5min, 20min, 80min
          scheduledFor: shouldRetry ? new Date(Date.now() + Math.pow(4, item.attempt) * 5 * 60 * 1000) : undefined,
        },
      });
      await recordSyncFailure(platform, connId, errorMsg, durationMs);
      results.push({ connectionId: connId, success: false, recordsSynced: 0, error: errorMsg, durationMs });
    }
  }

  return results;
}

// ─── Staggered Scheduling ───────────────────────────────
// Distribute syncs across a 4am–7am UTC window to avoid API throttling

export function getStaggeredSyncTime(connectionIndex: number, totalConnections: number): Date {
  const now = new Date();
  const syncDate = new Date(now);
  syncDate.setUTCHours(4, 0, 0, 0);
  if (syncDate < now) syncDate.setDate(syncDate.getDate() + 1);

  // Spread across 3-hour window (4am–7am UTC = 180 minutes)
  const windowMinutes = 180;
  const minuteOffset = totalConnections > 1
    ? Math.floor((connectionIndex / (totalConnections - 1)) * windowMinutes)
    : 0;

  syncDate.setMinutes(syncDate.getMinutes() + minuteOffset);
  return syncDate;
}
