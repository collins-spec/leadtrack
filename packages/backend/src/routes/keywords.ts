import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { DEFAULT_KEYWORDS } from '../services/keyword-scoring';

const router = Router();
router.use(authMiddleware);

const keywordSchema = z.object({
  keyword: z.string().min(1).max(100),
  category: z.enum(['high_intent', 'booking', 'pricing', 'general', 'negative', 'spam']),
  weight: z.number().int().min(1).max(10).default(1),
});

// ── GET /:accountId/keywords — List keywords for account ─────────────────────

router.get('/:accountId/keywords', asyncHandler(async (req: Request, res: Response) => {
  const account = await prisma.account.findFirst({
    where: { id: String(req.params.accountId), organizationId: req.user!.organizationId },
  });
  if (!account) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  const keywords = await prisma.keywordConfig.findMany({
    where: { accountId: account.id },
    orderBy: [{ category: 'asc' }, { keyword: 'asc' }],
  });

  res.json(keywords);
}));

// ── POST /:accountId/keywords — Add a keyword ───────────────────────────────

router.post('/:accountId/keywords', asyncHandler(async (req: Request, res: Response) => {
  const account = await prisma.account.findFirst({
    where: { id: String(req.params.accountId), organizationId: req.user!.organizationId },
  });
  if (!account) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  const body = keywordSchema.parse(req.body);
  const keyword = await prisma.keywordConfig.create({
    data: { ...body, accountId: account.id },
  });

  res.status(201).json(keyword);
}));

// ── DELETE /:accountId/keywords/:keywordId — Remove a keyword ────────────────

router.delete('/:accountId/keywords/:keywordId', asyncHandler(async (req: Request, res: Response) => {
  await prisma.keywordConfig.deleteMany({
    where: {
      id: String(req.params.keywordId),
      account: { id: String(req.params.accountId), organizationId: req.user!.organizationId },
    },
  });
  res.status(204).send();
}));

// ── POST /:accountId/keywords/seed-defaults — Seed default keywords ─────────

router.post('/:accountId/keywords/seed-defaults', asyncHandler(async (req: Request, res: Response) => {
  const account = await prisma.account.findFirst({
    where: { id: String(req.params.accountId), organizationId: req.user!.organizationId },
  });
  if (!account) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  const created = await prisma.keywordConfig.createMany({
    data: DEFAULT_KEYWORDS.map((k) => ({ ...k, accountId: account.id })),
    skipDuplicates: true,
  });

  res.json({ created: created.count });
}));

export default router;
