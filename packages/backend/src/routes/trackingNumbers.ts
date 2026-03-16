import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { asyncHandler } from '../middleware/asyncHandler';
import { searchAvailableNumbers, provisionNumber, releaseNumber } from '../services/twilio';

const p = (v: string | string[]): string => Array.isArray(v) ? v[0] : v;

const router = Router();
router.use(authMiddleware);

const provisionSchema = z.object({
  phoneNumber: z.string(),
  accountId: z.string(),
  source: z.string(),
  medium: z.string(),
  campaignTag: z.string().optional(),
  friendlyName: z.string().optional(),
  isDNIPool: z.boolean().default(false),
});

// List tracking numbers for an account
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

  const numbers = await prisma.trackingNumber.findMany({
    where: { accountId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(numbers);
}));

// Search available numbers from Twilio
router.get('/available', asyncHandler(async (req: Request, res: Response) => {
  try {
    const areaCode = req.query.areaCode as string | undefined;
    const numbers = await searchAvailableNumbers(areaCode);
    res.json(numbers);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to search numbers', message: err.message });
  }
}));

// Provision a new tracking number
router.post('/provision', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req: Request, res: Response) => {
  try {
    const body = provisionSchema.parse(req.body);

    // Verify account belongs to org
    const account = await prisma.account.findFirst({
      where: { id: body.accountId, organizationId: req.user!.organizationId },
    });
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const trackingNumber = await provisionNumber(
      body.phoneNumber,
      body.accountId,
      body.source,
      body.medium,
      body.campaignTag,
      body.friendlyName,
      body.isDNIPool
    );

    res.status(201).json(trackingNumber);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to provision number', message: err.message });
  }
}));

// Deactivate a tracking number
router.patch('/:id/deactivate', asyncHandler(async (req: Request, res: Response) => {
  const number = await prisma.trackingNumber.findUnique({
    where: { id: p(req.params.id) },
    include: { account: true },
  });

  if (!number || number.account.organizationId !== req.user!.organizationId) {
    res.status(404).json({ error: 'Tracking number not found' });
    return;
  }

  // Release from Twilio if it has a SID
  if (number.twilioSid) {
    try {
      await releaseNumber(number.twilioSid);
    } catch (err: any) {
      console.error('Failed to release Twilio number:', err.message);
    }
  }

  const updated = await prisma.trackingNumber.update({
    where: { id: p(req.params.id) },
    data: { isActive: false },
  });

  res.json(updated);
}));

export default router;
