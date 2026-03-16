import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { uploadOfflineConversion } from '../services/googleAds';

const p = (v: string | string[]): string => Array.isArray(v) ? v[0] : v;

const router = Router();
router.use(authMiddleware);

// List calls for an account with filters
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const accountId = req.query.accountId as string;
  if (!accountId) {
    res.status(400).json({ error: 'accountId query param required' });
    return;
  }

  // Verify account belongs to org
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

  // Filters
  const where: any = { accountId };

  if (req.query.status) {
    where.callStatus = req.query.status;
  }
  if (req.query.source) {
    where.trackingNumber = { source: req.query.source };
  }
  if (req.query.dateFrom) {
    where.createdAt = { ...where.createdAt, gte: new Date(req.query.dateFrom as string) };
  }
  if (req.query.dateTo) {
    where.createdAt = { ...where.createdAt, lte: new Date(req.query.dateTo as string) };
  }
  if (req.query.minDuration) {
    where.duration = { gte: parseInt(req.query.minDuration as string) };
  }

  const [calls, total] = await Promise.all([
    prisma.callLog.findMany({
      where,
      include: {
        trackingNumber: { select: { phoneNumber: true, friendlyName: true, source: true, medium: true, campaignTag: true } },
        tags: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.callLog.count({ where }),
  ]);

  res.json({
    calls,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}));

// Get single call
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const call = await prisma.callLog.findUnique({
    where: { id: p(req.params.id) },
    include: {
      trackingNumber: true,
      tags: true,
      account: { select: { id: true, organizationId: true } },
    },
  });

  if (!call || call.account.organizationId !== req.user!.organizationId) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }

  res.json(call);
}));

// Add tag to a call
router.post('/:id/tags', asyncHandler(async (req: Request, res: Response) => {
  const { label, color } = req.body;
  if (!label) {
    res.status(400).json({ error: 'label is required' });
    return;
  }

  const call = await prisma.callLog.findUnique({
    where: { id: p(req.params.id) },
    include: { account: { select: { organizationId: true } } },
  });

  if (!call || call.account.organizationId !== req.user!.organizationId) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }

  const tag = await prisma.leadTag.create({
    data: { label, color: color || '#6366f1', callLogId: call.id },
  });

  // Trigger Google Ads conversion upload for qualifying tags
  const CONVERSION_TAGS = ['Qualified', 'Booked'];
  if (CONVERSION_TAGS.includes(label) && call.gclid) {
    uploadOfflineConversion(call.accountId, call.gclid, label, new Date())
      .catch((err) => console.error('[GoogleAds] Conversion upload failed:', err));
  }

  res.status(201).json(tag);
}));

// Remove tag from a call
router.delete('/:callId/tags/:tagId', asyncHandler(async (req: Request, res: Response) => {
  await prisma.leadTag.deleteMany({
    where: { id: p(req.params.tagId), callLogId: p(req.params.callId) },
  });
  res.status(204).send();
}));

export default router;
