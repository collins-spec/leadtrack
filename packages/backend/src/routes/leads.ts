import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { emitNotification } from '../services/notification';
import { uploadOfflineConversion } from '../services/googleAds';

const p = (v: string | string[]): string => Array.isArray(v) ? v[0] : v;

const router = Router();

// ─── Public endpoint: form submission (called by client JS snippet) ──
router.post('/form', asyncHandler(async (req: Request, res: Response) => {
  const { accountId, formData, pageUrl, utmSource, utmMedium, utmCampaign, utmTerm, utmContent, gclid, referrer } = req.body;

  if (!accountId || !formData) {
    res.status(400).json({ error: 'accountId and formData are required' });
    return;
  }

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  const lead = await prisma.formLead.create({
    data: {
      accountId,
      formData,
      pageUrl,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      gclid,
      referrer,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    },
  });

  // Notify: new form lead
  emitNotification(accountId, 'NEW_FORM', {
    formData: formData as Record<string, any>,
  }).catch((err) => console.error('[Notification] NEW_FORM emit failed:', err));

  res.status(201).json({ id: lead.id, message: 'Lead captured' });
}));

// ─── Authenticated routes below ─────────────────────────────────────

// List form leads (paginated)
router.get('/form', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const accountId = req.query.accountId as string;
  if (!accountId) {
    res.status(400).json({ error: 'accountId query param required' });
    return;
  }

  const account = await prisma.account.findFirst({
    where: { id: accountId, organizationId: req.user!.organizationId },
  });
  if (!account) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
  const skip = (page - 1) * limit;

  const [leads, total] = await Promise.all([
    prisma.formLead.findMany({
      where: { accountId },
      include: { tags: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.formLead.count({ where: { accountId } }),
  ]);

  res.json({
    leads,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}));

// Get single form lead detail
router.get('/form/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const id = p(req.params.id);
  const formLead = await prisma.formLead.findUnique({
    where: { id },
    include: { tags: true },
  });
  if (!formLead) {
    res.status(404).json({ error: 'Form lead not found' });
    return;
  }

  // Verify org ownership
  const account = await prisma.account.findFirst({
    where: { id: formLead.accountId, organizationId: req.user!.organizationId },
  });
  if (!account) {
    res.status(404).json({ error: 'Form lead not found' });
    return;
  }

  res.json(formLead);
}));

// Add tag to a form lead
router.post('/form/:id/tags', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { label, color } = req.body;
  if (!label) {
    res.status(400).json({ error: 'label is required' });
    return;
  }

  const id = p(req.params.id);
  const formLead = await prisma.formLead.findUnique({ where: { id } });
  if (!formLead) {
    res.status(404).json({ error: 'Form lead not found' });
    return;
  }

  // Verify org ownership
  const account = await prisma.account.findFirst({
    where: { id: formLead.accountId, organizationId: req.user!.organizationId },
  });
  if (!account) {
    res.status(404).json({ error: 'Form lead not found' });
    return;
  }

  const tag = await prisma.leadTag.create({
    data: { label, color: color || '#6366f1', formLeadId: formLead.id },
  });

  // Trigger Google Ads conversion upload for qualifying tags
  const CONVERSION_TAGS = ['Qualified', 'Booked'];
  if (CONVERSION_TAGS.includes(label) && formLead.gclid) {
    uploadOfflineConversion(formLead.accountId, formLead.gclid, label, new Date())
      .catch((err) => console.error('[GoogleAds] Conversion upload failed:', err));
  }

  res.status(201).json(tag);
}));

// Remove tag from a form lead
router.delete('/form/:formId/tags/:tagId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  await prisma.leadTag.deleteMany({
    where: { id: p(req.params.tagId), formLeadId: p(req.params.formId) },
  });
  res.status(204).send();
}));

// ─── Unified lead inbox (paginated, filterable, searchable) ──────────
router.get('/all', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const accountId = req.query.accountId as string;
  if (!accountId) {
    res.status(400).json({ error: 'accountId query param required' });
    return;
  }

  const account = await prisma.account.findFirst({
    where: { id: accountId, organizationId: req.user!.organizationId },
  });
  if (!account) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
  const skip = (page - 1) * limit;
  const type = (req.query.type as string) || 'all';
  const source = req.query.source as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const tag = req.query.tag as string | undefined;
  const search = req.query.search as string | undefined;

  // Build call where clause
  const callWhere: any = { accountId };
  const formWhere: any = { accountId };

  // Date filters
  if (dateFrom) {
    callWhere.createdAt = { ...callWhere.createdAt, gte: new Date(dateFrom) };
    formWhere.createdAt = { ...formWhere.createdAt, gte: new Date(dateFrom) };
  }
  if (dateTo) {
    callWhere.createdAt = { ...callWhere.createdAt, lte: new Date(dateTo) };
    formWhere.createdAt = { ...formWhere.createdAt, lte: new Date(dateTo) };
  }

  // Source filter
  if (source) {
    callWhere.trackingNumber = { source: { contains: source, mode: 'insensitive' } };
    formWhere.utmSource = { contains: source, mode: 'insensitive' };
  }

  // Tag filter
  if (tag) {
    callWhere.tags = { some: { label: { equals: tag, mode: 'insensitive' } } };
    formWhere.tags = { some: { label: { equals: tag, mode: 'insensitive' } } };
  }

  // Search filter
  if (search) {
    callWhere.callerNumber = { contains: search, mode: 'insensitive' };
    // For forms, search across common formData fields using raw JSON path
    formWhere.OR = [
      { formData: { path: ['name'], string_contains: search } },
      { formData: { path: ['email'], string_contains: search } },
      { formData: { path: ['phone'], string_contains: search } },
    ];
  }

  // Fetch based on type filter — over-fetch then merge
  const fetchCalls = type === 'all' || type === 'call';
  const fetchForms = type === 'all' || type === 'form';

  const [calls, callCount, forms, formCount] = await Promise.all([
    fetchCalls
      ? prisma.callLog.findMany({
          where: callWhere,
          include: {
            trackingNumber: { select: { source: true, medium: true, campaignTag: true, friendlyName: true } },
            tags: true,
          },
          orderBy: { createdAt: 'desc' },
          take: skip + limit, // over-fetch for merge
        })
      : Promise.resolve([]),
    fetchCalls ? prisma.callLog.count({ where: callWhere }) : Promise.resolve(0),
    fetchForms
      ? prisma.formLead.findMany({
          where: formWhere,
          include: { tags: true },
          orderBy: { createdAt: 'desc' },
          take: skip + limit, // over-fetch for merge
        })
      : Promise.resolve([]),
    fetchForms ? prisma.formLead.count({ where: formWhere }) : Promise.resolve(0),
  ]);

  const total = callCount + formCount;

  // Transform and merge
  const merged = [
    ...calls.map((c) => ({
      type: 'call' as const,
      id: c.id,
      source: c.trackingNumber.source,
      medium: c.trackingNumber.medium,
      campaign: c.trackingNumber.campaignTag,
      contact: c.callerNumber,
      contactName: null as string | null,
      contactEmail: null as string | null,
      contactPhone: c.callerNumber,
      duration: c.duration,
      callStatus: c.callStatus,
      tags: c.tags,
      recordingUrl: c.recordingUrl,
      formData: null as any,
      pageUrl: null as string | null,
      callerCity: c.callerCity,
      callerState: c.callerState,
      transcriptionStatus: c.transcriptionStatus,
      callSummary: c.callSummary,
      leadScore: c.leadScore,
      leadScoreLabel: c.leadScoreLabel,
      // Google Ads attribution
      keyword: c.googleAdsKeyword || c.utmTerm || null,
      adsCampaign: c.googleAdsCampaign || c.utmCampaign || null,
      matchType: c.googleAdsMatchType || null,
      adGroup: c.googleAdsAdGroup || null,
      landingPage: c.landingPage || null,
      gclid: c.gclid || null,
      createdAt: c.createdAt,
    })),
    ...forms.map((f) => {
      const fd = f.formData as any;
      return {
        type: 'form' as const,
        id: f.id,
        source: f.utmSource,
        medium: f.utmMedium,
        campaign: f.utmCampaign,
        contact: fd?.name || fd?.email || fd?.phone || 'N/A',
        contactName: fd?.name || null,
        contactEmail: fd?.email || null,
        contactPhone: fd?.phone || null,
        duration: null as number | null,
        callStatus: null as string | null,
        tags: f.tags,
        recordingUrl: null as string | null,
        formData: f.formData,
        pageUrl: f.pageUrl,
        callerCity: null as string | null,
        callerState: null as string | null,
        transcriptionStatus: null as string | null,
        callSummary: null as string | null,
        leadScore: null as number | null,
        leadScoreLabel: null as string | null,
        // Google Ads attribution
        keyword: f.utmTerm || null,
        adsCampaign: f.utmCampaign || null,
        matchType: null as string | null,
        adGroup: null as string | null,
        landingPage: f.pageUrl || null,
        gclid: f.gclid || null,
        createdAt: f.createdAt,
      };
    }),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(skip, skip + limit);

  res.json({
    leads: merged,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}));

export default router;
