import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  gatherReportData,
  generateCallsCsv,
  generateFormLeadsCsv,
  generateCampaignsCsv,
  generateSummaryPdf,
} from '../services/reportGenerator';

const router = Router();
router.use(authMiddleware);

const p = (v: string | string[]): string => Array.isArray(v) ? v[0] : v;

// Helper: verify account ownership
async function verifyAccount(accountId: string, orgId: string) {
  return prisma.account.findFirst({
    where: { id: accountId, organizationId: orgId },
  });
}

// ─── Export Endpoints ───────────────────────────────────

router.get('/export/calls', asyncHandler(async (req: Request, res: Response) => {
  const accountId = req.query.accountId as string;
  const range = parseInt(req.query.range as string) || 30;
  if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }

  const account = await verifyAccount(accountId, req.user!.organizationId);
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const data = await gatherReportData(accountId, range);
  const csv = generateCallsCsv(data.calls);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="calls-${accountId}.csv"`);
  res.send(csv);
}));

router.get('/export/forms', asyncHandler(async (req: Request, res: Response) => {
  const accountId = req.query.accountId as string;
  const range = parseInt(req.query.range as string) || 30;
  if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }

  const account = await verifyAccount(accountId, req.user!.organizationId);
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const data = await gatherReportData(accountId, range);
  const csv = generateFormLeadsCsv(data.formLeads);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="form-leads-${accountId}.csv"`);
  res.send(csv);
}));

router.get('/export/campaigns', asyncHandler(async (req: Request, res: Response) => {
  const accountId = req.query.accountId as string;
  const range = parseInt(req.query.range as string) || 30;
  if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }

  const account = await verifyAccount(accountId, req.user!.organizationId);
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const data = await gatherReportData(accountId, range);
  const csv = generateCampaignsCsv(data);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="campaigns-${accountId}.csv"`);
  res.send(csv);
}));

router.get('/export/pdf', asyncHandler(async (req: Request, res: Response) => {
  const accountId = req.query.accountId as string;
  const range = parseInt(req.query.range as string) || 30;
  if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }

  const account = await verifyAccount(accountId, req.user!.organizationId);
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const data = await gatherReportData(accountId, range);
  const pdfBuffer = await generateSummaryPdf(data);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="report-${accountId}.pdf"`);
  res.send(pdfBuffer);
}));

// ─── Scheduled Report CRUD ──────────────────────────────

router.get('/schedules', asyncHandler(async (req: Request, res: Response) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }

  const account = await verifyAccount(accountId, req.user!.organizationId);
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const schedules = await prisma.scheduledReport.findMany({
    where: { accountId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(schedules);
}));

const createScheduleSchema = z.object({
  accountId: z.string(),
  reportType: z.enum(['FULL_SUMMARY', 'CALLS_ONLY', 'FORMS_ONLY', 'CAMPAIGN_PERFORMANCE']).default('FULL_SUMMARY'),
  frequency: z.enum(['WEEKLY', 'MONTHLY']),
  recipients: z.array(z.string().email()).min(1),
  dayOfWeek: z.number().min(0).max(6).optional(),
  dayOfMonth: z.number().min(1).max(28).optional(),
  hour: z.number().min(0).max(23).default(8),
});

router.post('/schedules', asyncHandler(async (req: Request, res: Response) => {
  const body = createScheduleSchema.parse(req.body);

  const account = await verifyAccount(body.accountId, req.user!.organizationId);
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const schedule = await prisma.scheduledReport.create({
    data: {
      ...body,
      createdById: req.user!.userId,
    },
  });
  res.status(201).json(schedule);
}));

const updateScheduleSchema = z.object({
  isActive: z.boolean().optional(),
  recipients: z.array(z.string().email()).optional(),
  hour: z.number().min(0).max(23).optional(),
});

router.patch('/schedules/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = p(req.params.id);
  const body = updateScheduleSchema.parse(req.body);

  const schedule = await prisma.scheduledReport.findUnique({
    where: { id },
    include: { account: { select: { organizationId: true } } },
  });
  if (!schedule || schedule.account.organizationId !== req.user!.organizationId) {
    res.status(404).json({ error: 'Schedule not found' }); return;
  }

  const updated = await prisma.scheduledReport.update({
    where: { id },
    data: body,
  });
  res.json(updated);
}));

router.delete('/schedules/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = p(req.params.id);

  const schedule = await prisma.scheduledReport.findUnique({
    where: { id },
    include: { account: { select: { organizationId: true } } },
  });
  if (!schedule || schedule.account.organizationId !== req.user!.organizationId) {
    res.status(404).json({ error: 'Schedule not found' }); return;
  }

  await prisma.scheduledReport.delete({ where: { id } });
  res.status(204).send();
}));

export default router;
