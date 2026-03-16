import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { Prisma } from '@prisma/client';

const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const EXHAUSTION_THRESHOLD = 5; // alerts after N exhaustion events per hour

// In-memory exhaustion counter (per account, per hour)
const exhaustionCounters = new Map<string, { count: number; windowStart: number }>();

export interface DNISessionParams {
  accountId: string;
  sessionToken?: string;
  visitorId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  referrer?: string;
  landingPage?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface DNISessionResult {
  trackingNumber: string;
  sessionToken: string;
  expiresAt: string;
  isShared: boolean;
}

/**
 * Get or create a DNI session for a website visitor.
 *
 * 5-tier allocation:
 * 1. Existing active session for this visitor+source → refresh
 * 2. Available number from pool (LRU) → assign
 * 3. Expired session's number → recycle and reassign
 * 4. Pool exhaustion → share number with same-source session
 * 5. Absolute fallback → return account's default number
 *
 * Uses serializable transactions to prevent race conditions.
 */
export async function getOrCreateDNISession(
  params: DNISessionParams,
): Promise<DNISessionResult> {
  const now = new Date();
  const newExpiry = new Date(now.getTime() + SESSION_DURATION_MS);

  // ── Step 1: Check existing session by sessionToken ──────────────────────

  if (params.sessionToken) {
    const existing = await prisma.dNISession.findFirst({
      where: {
        sessionToken: params.sessionToken,
        isActive: true,
        expiresAt: { gt: now },
      },
      include: { trackingNumber: true },
    });

    if (existing) {
      // Source-change detection: if visitor came from a different source,
      // create a NEW session with a new number
      const sourceChanged =
        params.utmSource &&
        existing.utmSource &&
        params.utmSource !== existing.utmSource;

      if (!sourceChanged) {
        // Same source or no source info — just refresh the session
        await prisma.dNISession.update({
          where: { id: existing.id },
          data: { expiresAt: newExpiry, lastHeartbeat: now },
        });

        return {
          trackingNumber: existing.trackingNumber.phoneNumber,
          sessionToken: existing.sessionToken,
          expiresAt: newExpiry.toISOString(),
          isShared: existing.isShared,
        };
      }
      // Source changed → fall through to allocate a new number
    }
  }

  // ── Step 1b: Check existing session by visitorId + same source ─────────

  if (params.visitorId) {
    const visitorSession = await prisma.dNISession.findFirst({
      where: {
        visitorId: params.visitorId,
        accountId: params.accountId,
        isActive: true,
        expiresAt: { gt: now },
        ...(params.utmSource ? { utmSource: params.utmSource } : {}),
      },
      include: { trackingNumber: true },
      orderBy: { createdAt: 'desc' },
    });

    if (visitorSession) {
      await prisma.dNISession.update({
        where: { id: visitorSession.id },
        data: { expiresAt: newExpiry, lastHeartbeat: now },
      });

      return {
        trackingNumber: visitorSession.trackingNumber.phoneNumber,
        sessionToken: visitorSession.sessionToken,
        expiresAt: newExpiry.toISOString(),
        isShared: visitorSession.isShared,
      };
    }
  }

  // ── Steps 2–5: Allocate a new number (serializable transaction) ────────

  return await prisma.$transaction(
    async (tx) => {
      // Step 2: Find an available DNI pool number (no active sessions)
      let trackingNumber = await tx.trackingNumber.findFirst({
        where: {
          accountId: params.accountId,
          isDNIPool: true,
          isActive: true,
          dniSessions: {
            none: {
              isActive: true,
              expiresAt: { gt: now },
            },
          },
        },
        orderBy: { updatedAt: 'asc' }, // LRU: least recently used first
      });

      let isShared = false;

      if (!trackingNumber) {
        // Step 3: Recycle expired session's number
        const expiredSession = await tx.dNISession.findFirst({
          where: {
            accountId: params.accountId,
            isActive: true,
            expiresAt: { lt: now },
            trackingNumber: { isDNIPool: true, isActive: true },
          },
          include: { trackingNumber: true },
          orderBy: { expiresAt: 'asc' },
        });

        if (expiredSession) {
          // Mark the expired session as inactive
          await tx.dNISession.update({
            where: { id: expiredSession.id },
            data: { isActive: false },
          });
          trackingNumber = expiredSession.trackingNumber;
        }
      }

      if (!trackingNumber) {
        // Step 4: Pool exhausted — share a number with same-source session
        const sameSourceSession = await tx.dNISession.findFirst({
          where: {
            accountId: params.accountId,
            isActive: true,
            expiresAt: { gt: now },
            trackingNumber: { isDNIPool: true, isActive: true },
            ...(params.utmSource
              ? { utmSource: params.utmSource }
              : {}),
          },
          include: { trackingNumber: true },
          orderBy: { expiresAt: 'desc' }, // most time remaining
        });

        if (sameSourceSession) {
          trackingNumber = sameSourceSession.trackingNumber;
          isShared = true;
          trackPoolExhaustion(params.accountId);
        }
      }

      if (!trackingNumber) {
        // Step 4b: Any active DNI number (cross-source sharing)
        const anyDniNumber = await tx.trackingNumber.findFirst({
          where: {
            accountId: params.accountId,
            isDNIPool: true,
            isActive: true,
          },
        });

        if (anyDniNumber) {
          trackingNumber = anyDniNumber;
          isShared = true;
          trackPoolExhaustion(params.accountId);
        }
      }

      if (!trackingNumber) {
        // Step 5: No DNI numbers at all
        throw new Error('NO_DNI_NUMBERS');
      }

      // Create a new session
      const sessionToken = crypto.randomUUID();

      await tx.dNISession.create({
        data: {
          accountId: params.accountId,
          trackingNumberId: trackingNumber.id,
          sessionToken,
          visitorId: params.visitorId || null,
          isActive: true,
          isShared,
          expiresAt: newExpiry,
          lastHeartbeat: now,
          utmSource: params.utmSource || null,
          utmMedium: params.utmMedium || null,
          utmCampaign: params.utmCampaign || null,
          utmTerm: params.utmTerm || null,
          utmContent: params.utmContent || null,
          gclid: params.gclid || null,
          gbraid: params.gbraid || null,
          wbraid: params.wbraid || null,
          referrer: params.referrer || null,
          landingPage: params.landingPage || null,
          ipAddress: params.ipAddress || null,
          userAgent: params.userAgent || null,
        },
      });

      // Update tracking number's updatedAt for LRU ordering
      await tx.trackingNumber.update({
        where: { id: trackingNumber.id },
        data: { updatedAt: new Date() },
      });

      return {
        trackingNumber: trackingNumber.phoneNumber,
        sessionToken,
        expiresAt: newExpiry.toISOString(),
        isShared,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 10000,
    },
  );
}

/**
 * Extend a session's expiry (heartbeat from page navigation)
 */
export async function heartbeatSession(sessionToken: string): Promise<{
  extended: boolean;
  newExpiry: string;
} | null> {
  const now = new Date();
  const newExpiry = new Date(now.getTime() + SESSION_DURATION_MS);

  const session = await prisma.dNISession.findFirst({
    where: {
      sessionToken,
      isActive: true,
      expiresAt: { gt: now },
    },
  });

  if (!session) return null;

  await prisma.dNISession.update({
    where: { id: session.id },
    data: { expiresAt: newExpiry, lastHeartbeat: now },
  });

  return { extended: true, newExpiry: newExpiry.toISOString() };
}

/**
 * Background job: expire stale sessions and free numbers back to pool.
 * Run every 60 seconds.
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const now = new Date();

  const result = await prisma.dNISession.updateMany({
    where: {
      isActive: true,
      expiresAt: { lt: now },
    },
    data: { isActive: false },
  });

  if (result.count > 0) {
    console.log(`[DNI Cleanup] Expired ${result.count} sessions`);
  }

  return result.count;
}

/**
 * Track pool exhaustion events for alerting
 */
function trackPoolExhaustion(accountId: string) {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  let counter = exhaustionCounters.get(accountId);
  if (!counter || now - counter.windowStart > hourMs) {
    counter = { count: 0, windowStart: now };
    exhaustionCounters.set(accountId, counter);
  }

  counter.count++;

  if (counter.count >= EXHAUSTION_THRESHOLD) {
    console.warn(
      `[DNI ALERT] Pool exhaustion for account ${accountId}: ` +
        `${counter.count} events in the last hour. Add more DNI pool numbers.`,
    );
    // In production: send email/Slack notification to account owner
  }
}

// Start the cleanup interval
let cleanupInterval: NodeJS.Timeout | null = null;

export function startSessionCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    cleanupExpiredSessions().catch((err) =>
      console.error('[DNI Cleanup] Error:', err),
    );
  }, 60_000); // every 60 seconds
  console.log('[DNI] Session cleanup job started (60s interval)');
}

export function stopSessionCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
