import { Router, Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';

const prisma = new PrismaClient();
const router = Router();

router.use(authMiddleware);

// ── helpers ────────────────────────────────────────────────────────

async function verifyAccount(req: Request, res: Response) {
  const accountId = req.query.accountId as string;
  if (!accountId) {
    res.status(400).json({ error: 'accountId query param required' });
    return null;
  }
  const account = await prisma.account.findFirst({
    where: { id: accountId, organizationId: req.user!.organizationId },
  });
  if (!account) {
    res.status(404).json({ error: 'Account not found' });
    return null;
  }
  return account;
}

function getDateRange(req: Request) {
  const days = parseInt(req.query.range as string) || 30;
  const range = [7, 30, 90].includes(days) ? days : 30;
  const now = new Date();
  const currentStart = new Date(now);
  currentStart.setDate(currentStart.getDate() - range);
  currentStart.setHours(0, 0, 0, 0);
  const previousStart = new Date(currentStart);
  previousStart.setDate(previousStart.getDate() - range);
  return { range, now, currentStart, previousStart };
}

// ── GET /overview  — KPI stats with trend comparison ───────────────

router.get('/overview', async (req: Request, res: Response) => {
  try {
    const account = await verifyAccount(req, res);
    if (!account) return;

    const { range, now, currentStart, previousStart } = getDateRange(req);

    const periodStats = async (from: Date, to: Date) => {
      const [calls, forms, missed, avgDur] = await Promise.all([
        prisma.callLog.count({
          where: { accountId: account.id, createdAt: { gte: from, lte: to } },
        }),
        prisma.formLead.count({
          where: { accountId: account.id, createdAt: { gte: from, lte: to } },
        }),
        prisma.callLog.count({
          where: {
            accountId: account.id,
            createdAt: { gte: from, lte: to },
            callStatus: { in: ['NO_ANSWER', 'BUSY'] },
          },
        }),
        prisma.callLog.aggregate({
          _avg: { duration: true },
          where: {
            accountId: account.id,
            createdAt: { gte: from, lte: to },
            callStatus: 'COMPLETED',
          },
        }),
      ]);
      return {
        calls,
        forms,
        totalLeads: calls + forms,
        missedCalls: missed,
        avgDuration: Math.round(avgDur._avg.duration || 0),
      };
    };

    const [current, previous, spendAgg] = await Promise.all([
      periodStats(currentStart, now),
      periodStats(previousStart, currentStart),
      prisma.spendEntry.aggregate({
        _sum: { spend: true },
        where: {
          accountId: account.id,
          date: { gte: currentStart, lte: now },
        },
      }),
    ]);

    const totalSpend = spendAgg._sum.spend || 0;
    const costPerLead = current.totalLeads > 0 ? +(totalSpend / current.totalLeads).toFixed(2) : 0;

    res.json({
      current: { ...current, totalSpend, costPerLead },
      previous,
      range,
    });
  } catch (err) {
    console.error('Analytics overview error:', err);
    res.status(500).json({ error: 'Failed to load overview' });
  }
});

// ── GET /lead-volume  — Daily time-series for area chart ──────────

router.get('/lead-volume', async (req: Request, res: Response) => {
  try {
    const account = await verifyAccount(req, res);
    if (!account) return;

    const { range, now, currentStart } = getDateRange(req);

    const [callRows, formRows] = await Promise.all([
      prisma.$queryRaw<{ date: Date; count: number }[]>`
        SELECT DATE_TRUNC('day', "createdAt") as date, COUNT(*)::int as count
        FROM "CallLog"
        WHERE "accountId" = ${account.id}
          AND "createdAt" >= ${currentStart}
          AND "createdAt" <= ${now}
        GROUP BY DATE_TRUNC('day', "createdAt")
        ORDER BY date
      `,
      prisma.$queryRaw<{ date: Date; count: number }[]>`
        SELECT DATE_TRUNC('day', "createdAt") as date, COUNT(*)::int as count
        FROM "FormLead"
        WHERE "accountId" = ${account.id}
          AND "createdAt" >= ${currentStart}
          AND "createdAt" <= ${now}
        GROUP BY DATE_TRUNC('day', "createdAt")
        ORDER BY date
      `,
    ]);

    // Build lookup maps
    const callMap = new Map(callRows.map((r: { date: Date; count: number }) => [r.date.toISOString().slice(0, 10), r.count]));
    const formMap = new Map(formRows.map((r: { date: Date; count: number }) => [r.date.toISOString().slice(0, 10), r.count]));

    // Zero-fill every day in range
    const series: { date: string; calls: number; forms: number; total: number }[] = [];
    const d = new Date(currentStart);
    while (d <= now) {
      const key = d.toISOString().slice(0, 10);
      const calls: number = callMap.get(key) || 0;
      const forms: number = formMap.get(key) || 0;
      series.push({ date: key, calls, forms, total: (calls as number) + (forms as number) });
      d.setDate(d.getDate() + 1);
    }

    res.json({ series, range });
  } catch (err) {
    console.error('Lead volume error:', err);
    res.status(500).json({ error: 'Failed to load lead volume' });
  }
});

// ── GET /sources  — Lead count by source for donut chart ──────────

router.get('/sources', async (req: Request, res: Response) => {
  try {
    const account = await verifyAccount(req, res);
    if (!account) return;

    const { now, currentStart } = getDateRange(req);

    const [callSources, formSources] = await Promise.all([
      prisma.$queryRaw<{ source: string; count: number }[]>`
        SELECT tn."source", COUNT(*)::int as count
        FROM "CallLog" cl
        JOIN "TrackingNumber" tn ON cl."trackingNumberId" = tn."id"
        WHERE cl."accountId" = ${account.id}
          AND cl."createdAt" >= ${currentStart}
          AND cl."createdAt" <= ${now}
        GROUP BY tn."source"
      `,
      prisma.$queryRaw<{ source: string; count: number }[]>`
        SELECT COALESCE("utmSource", 'Direct') as source, COUNT(*)::int as count
        FROM "FormLead"
        WHERE "accountId" = ${account.id}
          AND "createdAt" >= ${currentStart}
          AND "createdAt" <= ${now}
        GROUP BY COALESCE("utmSource", 'Direct')
      `,
    ]);

    // Merge by source name
    const merged = new Map<string, { calls: number; forms: number }>();
    for (const r of callSources) {
      const existing = merged.get(r.source) || { calls: 0, forms: 0 };
      existing.calls += r.count;
      merged.set(r.source, existing);
    }
    for (const r of formSources) {
      const existing = merged.get(r.source) || { calls: 0, forms: 0 };
      existing.forms += r.count;
      merged.set(r.source, existing);
    }

    const sources = Array.from(merged.entries())
      .map(([source, { calls, forms }]) => ({
        source,
        calls,
        forms,
        total: calls + forms,
      }))
      .sort((a, b) => b.total - a.total);

    res.json({ sources });
  } catch (err) {
    console.error('Sources error:', err);
    res.status(500).json({ error: 'Failed to load sources' });
  }
});

// ── GET /call-outcomes  — Status distribution for bar chart ───────

router.get('/call-outcomes', async (req: Request, res: Response) => {
  try {
    const account = await verifyAccount(req, res);
    if (!account) return;

    const { now, currentStart } = getDateRange(req);

    const groups = await prisma.callLog.groupBy({
      by: ['callStatus'],
      _count: true,
      where: {
        accountId: account.id,
        createdAt: { gte: currentStart, lte: now },
      },
    });

    const outcomes = groups.map((g: any) => ({
      status: g.callStatus,
      count: g._count,
    }));

    res.json({ outcomes });
  } catch (err) {
    console.error('Call outcomes error:', err);
    res.status(500).json({ error: 'Failed to load call outcomes' });
  }
});

// ── GET /campaigns  — Campaign performance table with ROI ─────────

router.get('/campaigns', async (req: Request, res: Response) => {
  try {
    const account = await verifyAccount(req, res);
    if (!account) return;

    const { now, currentStart } = getDateRange(req);

    const [callData, formData, qualifiedData, spendData] = await Promise.all([
      // Call metrics by campaign
      prisma.$queryRaw<
        {
          campaign: string | null;
          source: string;
          medium: string;
          calls: number;
          completed: number;
          missed: number;
          avg_duration: number;
        }[]
      >`
        SELECT
          tn."campaignTag" as campaign,
          tn."source",
          tn."medium",
          COUNT(*)::int as calls,
          COUNT(*) FILTER (WHERE cl."callStatus" = 'COMPLETED')::int as completed,
          COUNT(*) FILTER (WHERE cl."callStatus" IN ('NO_ANSWER','BUSY'))::int as missed,
          COALESCE(AVG(cl."duration") FILTER (WHERE cl."callStatus" = 'COMPLETED'), 0)::int as avg_duration
        FROM "CallLog" cl
        JOIN "TrackingNumber" tn ON cl."trackingNumberId" = tn."id"
        WHERE cl."accountId" = ${account.id}
          AND cl."createdAt" >= ${currentStart}
          AND cl."createdAt" <= ${now}
        GROUP BY tn."campaignTag", tn."source", tn."medium"
      `,

      // Form metrics by campaign
      prisma.$queryRaw<
        { campaign: string | null; source: string; medium: string; forms: number }[]
      >`
        SELECT
          "utmCampaign" as campaign,
          COALESCE("utmSource", 'Direct') as source,
          COALESCE("utmMedium", 'none') as medium,
          COUNT(*)::int as forms
        FROM "FormLead"
        WHERE "accountId" = ${account.id}
          AND "createdAt" >= ${currentStart}
          AND "createdAt" <= ${now}
        GROUP BY "utmCampaign", COALESCE("utmSource", 'Direct'), COALESCE("utmMedium", 'none')
      `,

      // Qualified leads (via LeadTag)
      prisma.$queryRaw<
        { campaign: string | null; source: string; qualified: number }[]
      >`
        SELECT sub.campaign, sub.source, COUNT(*)::int as qualified
        FROM (
          SELECT tn."campaignTag" as campaign, tn."source" as source
          FROM "LeadTag" lt
          JOIN "CallLog" cl ON lt."callLogId" = cl."id"
          JOIN "TrackingNumber" tn ON cl."trackingNumberId" = tn."id"
          WHERE cl."accountId" = ${account.id}
            AND cl."createdAt" >= ${currentStart}
            AND cl."createdAt" <= ${now}
            AND lt."label" IN ('Qualified','Booked')
          UNION ALL
          SELECT fl."utmCampaign" as campaign, COALESCE(fl."utmSource", 'Direct') as source
          FROM "LeadTag" lt
          JOIN "FormLead" fl ON lt."formLeadId" = fl."id"
          WHERE fl."accountId" = ${account.id}
            AND fl."createdAt" >= ${currentStart}
            AND fl."createdAt" <= ${now}
            AND lt."label" IN ('Qualified','Booked')
        ) sub
        GROUP BY sub.campaign, sub.source
      `,

      // Spend by campaign
      prisma.spendEntry.groupBy({
        by: ['campaign', 'source', 'medium'],
        _sum: { spend: true, clicks: true, impressions: true },
        where: {
          accountId: account.id,
          date: { gte: currentStart, lte: now },
        },
      }),
    ]);

    // Merge all data by campaign+source+medium key
    const map = new Map<
      string,
      {
        campaign: string;
        source: string;
        medium: string;
        calls: number;
        forms: number;
        totalLeads: number;
        completedCalls: number;
        missedCalls: number;
        avgDuration: number;
        qualifiedLeads: number;
        spend: number;
        clicks: number;
        impressions: number;
      }
    >();

    const makeKey = (campaign: string | null, source: string, medium: string) =>
      `${campaign || '(none)'}::${source}::${medium}`;

    const getOrCreate = (campaign: string | null, source: string, medium: string) => {
      const key = makeKey(campaign, source, medium);
      if (!map.has(key)) {
        map.set(key, {
          campaign: campaign || '(none)',
          source,
          medium,
          calls: 0,
          forms: 0,
          totalLeads: 0,
          completedCalls: 0,
          missedCalls: 0,
          avgDuration: 0,
          qualifiedLeads: 0,
          spend: 0,
          clicks: 0,
          impressions: 0,
        });
      }
      return map.get(key)!;
    };

    for (const r of callData) {
      const entry = getOrCreate(r.campaign, r.source, r.medium);
      entry.calls = r.calls;
      entry.completedCalls = r.completed;
      entry.missedCalls = r.missed;
      entry.avgDuration = r.avg_duration;
    }

    for (const r of formData) {
      const entry = getOrCreate(r.campaign, r.source, r.medium);
      entry.forms = r.forms;
    }

    for (const r of qualifiedData) {
      // Match by campaign + source (medium may differ)
      for (const [, entry] of map) {
        if (entry.campaign === (r.campaign || '(none)') && entry.source === r.source) {
          entry.qualifiedLeads += r.qualified;
        }
      }
    }

    for (const r of spendData) {
      const entry = getOrCreate(r.campaign, r.source, r.medium);
      entry.spend = r._sum.spend || 0;
      entry.clicks = r._sum.clicks || 0;
      entry.impressions = r._sum.impressions || 0;
    }

    // Compute totals and derived metrics
    const campaigns = Array.from(map.values()).map((c) => {
      c.totalLeads = c.calls + c.forms;
      const conversionRate =
        c.totalLeads > 0 ? +((c.qualifiedLeads / c.totalLeads) * 100).toFixed(1) : 0;
      const costPerLead = c.totalLeads > 0 ? +(c.spend / c.totalLeads).toFixed(2) : 0;
      return { ...c, conversionRate, costPerLead };
    });

    campaigns.sort((a, b) => b.totalLeads - a.totalLeads);
    res.json({ campaigns });
  } catch (err) {
    console.error('Campaigns error:', err);
    res.status(500).json({ error: 'Failed to load campaigns' });
  }
});

// ── POST /spend  — Upsert manual spend entry ──────────────────────

router.post('/spend', async (req: Request, res: Response) => {
  try {
    const { accountId, source, medium, campaign, date, spend, clicks, impressions } = req.body;

    if (!accountId || !source || !medium || !date || spend == null) {
      res.status(400).json({ error: 'accountId, source, medium, date, and spend are required' });
      return;
    }

    // Verify account ownership
    const account = await prisma.account.findFirst({
      where: { id: accountId, organizationId: req.user!.organizationId },
    });
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const entry = await prisma.spendEntry.upsert({
      where: {
        accountId_source_medium_campaign_date: {
          accountId,
          source,
          medium,
          campaign: campaign || null,
          date: new Date(date),
        },
      },
      update: {
        spend: parseFloat(spend),
        clicks: parseInt(clicks) || 0,
        impressions: parseInt(impressions) || 0,
      },
      create: {
        accountId,
        source,
        medium,
        campaign: campaign || null,
        date: new Date(date),
        spend: parseFloat(spend),
        clicks: parseInt(clicks) || 0,
        impressions: parseInt(impressions) || 0,
        isManual: true,
      },
    });

    res.status(201).json(entry);
  } catch (err) {
    console.error('Spend entry error:', err);
    res.status(500).json({ error: 'Failed to save spend entry' });
  }
});

// ── GET /spend  — List spend entries for an account ────────────────

router.get('/spend', async (req: Request, res: Response) => {
  try {
    const account = await verifyAccount(req, res);
    if (!account) return;

    const { now, currentStart } = getDateRange(req);

    const entries = await prisma.spendEntry.findMany({
      where: {
        accountId: account.id,
        date: { gte: currentStart, lte: now },
      },
      orderBy: { date: 'desc' },
    });

    res.json({ entries });
  } catch (err) {
    console.error('Spend list error:', err);
    res.status(500).json({ error: 'Failed to load spend entries' });
  }
});

export default router;
