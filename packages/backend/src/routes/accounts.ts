import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { asyncHandler } from '../middleware/asyncHandler';

const p = (v: string | string[]): string => Array.isArray(v) ? v[0] : v;

const router = Router();
router.use(authMiddleware);

const createAccountSchema = z.object({
  name: z.string().min(1),
  businessPhone: z.string().min(10),
  timezone: z.string().default('America/New_York'),
});

const updateAccountSchema = z.object({
  name: z.string().min(1).optional(),
  businessPhone: z.string().min(10).optional(),
  timezone: z.string().optional(),
  missedCallSms: z.boolean().optional(),
  missedCallMsg: z.string().optional(),
});

// List all accounts for the organization
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const accounts = await prisma.account.findMany({
    where: { organizationId: req.user!.organizationId },
    include: {
      _count: { select: { callLogs: true, formLeads: true, trackingNumbers: true } },
    },
    orderBy: { name: 'asc' },
  });
  res.json(accounts);
}));

// Get single account
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const account = await prisma.account.findFirst({
    where: { id: p(req.params.id), organizationId: req.user!.organizationId },
    include: {
      trackingNumbers: { where: { isActive: true }, orderBy: { createdAt: 'desc' } },
      _count: { select: { callLogs: true, formLeads: true } },
    },
  });
  if (!account) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  res.json(account);
}));

// Create account
router.post('/', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req: Request, res: Response) => {
  try {
    const body = createAccountSchema.parse(req.body);
    const account = await prisma.account.create({
      data: { ...body, organizationId: req.user!.organizationId },
    });
    res.status(201).json(account);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    throw err;
  }
}));

// Update account
router.patch('/:id', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req: Request, res: Response) => {
  try {
    const body = updateAccountSchema.parse(req.body);
    const account = await prisma.account.updateMany({
      where: { id: p(req.params.id), organizationId: req.user!.organizationId },
      data: body,
    });
    if (account.count === 0) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    const updated = await prisma.account.findUnique({ where: { id: p(req.params.id) } });
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    throw err;
  }
}));

// Delete account
router.delete('/:id', requireRole('OWNER'), asyncHandler(async (req: Request, res: Response) => {
  const result = await prisma.account.deleteMany({
    where: { id: p(req.params.id), organizationId: req.user!.organizationId },
  });
  if (result.count === 0) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  res.status(204).send();
}));

export default router;
