import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { uploadOfflineConversion } from '../services/googleAds';
import { uploadFacebookConversion } from '../services/facebookAds';

const router = Router();

const p = (v: string | string[]): string => Array.isArray(v) ? v[0] : v;

// Helper: verify account belongs to user's organization
async function verifyAccountAccess(accountId: string, organizationId: string) {
  return prisma.account.findFirst({
    where: { id: accountId, organizationId },
  });
}

// ─── Default Stage Templates ────────────────────────────

const DEFAULT_STAGES = [
  { name: 'New', position: 0, color: '#6366f1', isDefault: true, isWon: false, isLost: false },
  { name: 'Contacted', position: 1, color: '#3b82f6', isDefault: false, isWon: false, isLost: false },
  { name: 'Qualified', position: 2, color: '#10b981', isDefault: false, isWon: false, isLost: false },
  { name: 'Booked', position: 3, color: '#f59e0b', isDefault: false, isWon: false, isLost: false },
  { name: 'Won', position: 4, color: '#22c55e', isDefault: false, isWon: true, isLost: false },
  { name: 'Lost', position: 5, color: '#ef4444', isDefault: false, isWon: false, isLost: true },
];

// ─── Stage CRUD ─────────────────────────────────────────

// GET /stages?accountId=xxx
router.get('/stages', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }

  const account = await verifyAccountAccess(accountId, req.user!.organizationId);
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const stages = await prisma.pipelineStage.findMany({
    where: { accountId },
    orderBy: { position: 'asc' },
    include: {
      _count: { select: { callLogs: true, formLeads: true } },
    },
  });

  res.json({
    stages: stages.map((s) => ({
      id: s.id,
      name: s.name,
      position: s.position,
      color: s.color,
      isDefault: s.isDefault,
      isWon: s.isWon,
      isLost: s.isLost,
      leadCount: s._count.callLogs + s._count.formLeads,
    })),
  });
}));

// POST /stages/seed — seed default stages for an account
router.post('/stages/seed', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.body;
  if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }

  const account = await verifyAccountAccess(accountId, req.user!.organizationId);
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  // Check if stages already exist
  const existing = await prisma.pipelineStage.count({ where: { accountId } });
  if (existing > 0) {
    res.status(400).json({ error: 'Pipeline stages already exist. Delete them first to re-seed.' });
    return;
  }

  const stages = await prisma.$transaction(
    DEFAULT_STAGES.map((s) =>
      prisma.pipelineStage.create({ data: { accountId, ...s } }),
    ),
  );

  res.status(201).json({ stages });
}));

// POST /stages — create a new stage
const createStageSchema = z.object({
  accountId: z.string(),
  name: z.string().min(1),
  color: z.string().default('#6366f1'),
  position: z.number().int().min(0),
});

router.post('/stages', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const body = createStageSchema.parse(req.body);

  const account = await verifyAccountAccess(body.accountId, req.user!.organizationId);
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  // Shift positions of stages at or after the requested position
  await prisma.pipelineStage.updateMany({
    where: { accountId: body.accountId, position: { gte: body.position } },
    data: { position: { increment: 1 } },
  });

  const stage = await prisma.pipelineStage.create({
    data: {
      accountId: body.accountId,
      name: body.name,
      color: body.color,
      position: body.position,
    },
  });

  res.status(201).json(stage);
}));

// PATCH /stages/:id — update a stage
const updateStageSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  isDefault: z.boolean().optional(),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional(),
});

router.patch('/stages/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const stageId = p(req.params.id);
  const body = updateStageSchema.parse(req.body);

  const stage = await prisma.pipelineStage.findUnique({ where: { id: stageId } });
  if (!stage) { res.status(404).json({ error: 'Stage not found' }); return; }

  const account = await verifyAccountAccess(stage.accountId, req.user!.organizationId);
  if (!account) { res.status(404).json({ error: 'Stage not found' }); return; }

  // If setting as default, unset all other defaults for this account
  if (body.isDefault) {
    await prisma.pipelineStage.updateMany({
      where: { accountId: stage.accountId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.pipelineStage.update({
    where: { id: stageId },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
      ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
      ...(body.isWon !== undefined ? { isWon: body.isWon } : {}),
      ...(body.isLost !== undefined ? { isLost: body.isLost } : {}),
    },
  });

  res.json(updated);
}));

// DELETE /stages/:id — delete a stage (moves leads to default stage)
router.delete('/stages/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const stageId = p(req.params.id);

  const stage = await prisma.pipelineStage.findUnique({ where: { id: stageId } });
  if (!stage) { res.status(404).json({ error: 'Stage not found' }); return; }

  const account = await verifyAccountAccess(stage.accountId, req.user!.organizationId);
  if (!account) { res.status(404).json({ error: 'Stage not found' }); return; }

  if (stage.isDefault) {
    res.status(400).json({ error: 'Cannot delete the default stage. Set another stage as default first.' });
    return;
  }

  // Move leads to default stage
  const defaultStage = await prisma.pipelineStage.findFirst({
    where: { accountId: stage.accountId, isDefault: true },
  });

  if (defaultStage) {
    await Promise.all([
      prisma.callLog.updateMany({
        where: { pipelineStageId: stageId },
        data: { pipelineStageId: defaultStage.id },
      }),
      prisma.formLead.updateMany({
        where: { pipelineStageId: stageId },
        data: { pipelineStageId: defaultStage.id },
      }),
    ]);
  }

  await prisma.pipelineStage.delete({ where: { id: stageId } });

  // Reorder remaining stages to close the gap
  const remaining = await prisma.pipelineStage.findMany({
    where: { accountId: stage.accountId },
    orderBy: { position: 'asc' },
  });
  await prisma.$transaction(
    remaining.map((s, i) =>
      prisma.pipelineStage.update({ where: { id: s.id }, data: { position: i } }),
    ),
  );

  res.status(204).send();
}));

// POST /stages/reorder — reorder stages
const reorderSchema = z.object({
  accountId: z.string(),
  stageIds: z.array(z.string()),
});

router.post('/stages/reorder', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const body = reorderSchema.parse(req.body);

  const account = await verifyAccountAccess(body.accountId, req.user!.organizationId);
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  await prisma.$transaction(
    body.stageIds.map((id, i) =>
      prisma.pipelineStage.update({ where: { id }, data: { position: i } }),
    ),
  );

  res.json({ success: true });
}));

// ─── Lead Stage Management ──────────────────────────────

// PATCH /leads/:leadType/:leadId/stage — move lead to a stage
const moveLeadSchema = z.object({
  stageId: z.string(),
});

router.patch('/leads/:leadType/:leadId/stage', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const leadType = p(req.params.leadType);
  const leadId = p(req.params.leadId);
  const body = moveLeadSchema.parse(req.body);

  if (leadType !== 'call' && leadType !== 'form') {
    res.status(400).json({ error: 'leadType must be "call" or "form"' });
    return;
  }

  // Verify stage exists and get account
  const toStage = await prisma.pipelineStage.findUnique({ where: { id: body.stageId } });
  if (!toStage) { res.status(404).json({ error: 'Stage not found' }); return; }

  const account = await verifyAccountAccess(toStage.accountId, req.user!.organizationId);
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  let fromStageId: string | null = null;
  let gclid: string | null = null;
  let fbclid: string | null = null;
  let accountId: string;

  if (leadType === 'call') {
    const callLog = await prisma.callLog.findUnique({ where: { id: leadId } });
    if (!callLog || callLog.accountId !== toStage.accountId) {
      res.status(404).json({ error: 'Lead not found' }); return;
    }
    fromStageId = callLog.pipelineStageId;
    gclid = callLog.gclid;
    fbclid = callLog.fbclid;
    accountId = callLog.accountId;

    await prisma.callLog.update({
      where: { id: leadId },
      data: { pipelineStageId: body.stageId },
    });
  } else {
    const formLead = await prisma.formLead.findUnique({ where: { id: leadId } });
    if (!formLead || formLead.accountId !== toStage.accountId) {
      res.status(404).json({ error: 'Lead not found' }); return;
    }
    fromStageId = formLead.pipelineStageId;
    gclid = formLead.gclid;
    fbclid = formLead.fbclid;
    accountId = formLead.accountId;

    await prisma.formLead.update({
      where: { id: leadId },
      data: { pipelineStageId: body.stageId },
    });
  }

  // Create audit log
  await prisma.pipelineStageChange.create({
    data: {
      leadType: leadType === 'call' ? 'CALL' : 'FORM',
      callLogId: leadType === 'call' ? leadId : null,
      formLeadId: leadType === 'form' ? leadId : null,
      fromStageId,
      toStageId: body.stageId,
      changedById: req.user!.userId,
    },
  });

  // Trigger conversion uploads if stage matches conversion tags
  const CONVERSION_STAGES = ['Qualified', 'Booked'];
  if (CONVERSION_STAGES.includes(toStage.name)) {
    if (gclid) {
      uploadOfflineConversion(accountId!, gclid, toStage.name, new Date())
        .catch((err) => console.error('[GoogleAds] Pipeline conversion upload failed:', err));
    }
    if (fbclid) {
      uploadFacebookConversion(accountId!, fbclid, toStage.name, new Date())
        .catch((err) => console.error('[FacebookAds] Pipeline conversion upload failed:', err));
    }

    // Auto-create matching tag for backward compatibility
    const tagData = {
      label: toStage.name,
      color: toStage.name === 'Qualified' ? '#10b981' : '#3b82f6',
      ...(leadType === 'call' ? { callLogId: leadId } : { formLeadId: leadId }),
    };

    // Only create if tag doesn't already exist
    const existingTag = await prisma.leadTag.findFirst({
      where: {
        label: toStage.name,
        ...(leadType === 'call' ? { callLogId: leadId } : { formLeadId: leadId }),
      },
    });
    if (!existingTag) {
      await prisma.leadTag.create({ data: tagData });
    }
  }

  res.json({ success: true, fromStageId, toStageId: body.stageId });
}));

// ─── Pipeline Leads View ────────────────────────────────

// GET /leads?accountId=xxx — leads grouped by stage for pipeline view
router.get('/leads', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const accountId = req.query.accountId as string;
  if (!accountId) { res.status(400).json({ error: 'accountId required' }); return; }

  const account = await verifyAccountAccess(accountId, req.user!.organizationId);
  if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

  const typeFilter = req.query.type as string | undefined;
  const sourceFilter = req.query.source as string | undefined;
  const searchFilter = req.query.search as string | undefined;

  // Build where clauses
  const callWhere: any = { accountId, pipelineStageId: { not: null } };
  const formWhere: any = { accountId, pipelineStageId: { not: null } };

  if (sourceFilter) {
    callWhere.trackingNumber = { source: { contains: sourceFilter, mode: 'insensitive' } };
    formWhere.utmSource = { contains: sourceFilter, mode: 'insensitive' };
  }
  if (searchFilter) {
    callWhere.callerNumber = { contains: searchFilter, mode: 'insensitive' };
    formWhere.OR = [
      { formData: { path: ['name'], string_contains: searchFilter } },
      { formData: { path: ['email'], string_contains: searchFilter } },
      { formData: { path: ['phone'], string_contains: searchFilter } },
    ];
  }

  const fetchCalls = !typeFilter || typeFilter === 'all' || typeFilter === 'call';
  const fetchForms = !typeFilter || typeFilter === 'all' || typeFilter === 'form';

  const [calls, forms, stages] = await Promise.all([
    fetchCalls
      ? prisma.callLog.findMany({
          where: callWhere,
          include: {
            trackingNumber: { select: { source: true, medium: true, campaignTag: true } },
            tags: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 500, // Cap for pipeline view
        })
      : Promise.resolve([]),
    fetchForms
      ? prisma.formLead.findMany({
          where: formWhere,
          include: { tags: true },
          orderBy: { createdAt: 'desc' },
          take: 500,
        })
      : Promise.resolve([]),
    prisma.pipelineStage.findMany({
      where: { accountId },
      orderBy: { position: 'asc' },
    }),
  ]);

  // Transform leads
  const allLeads = [
    ...calls.map((c) => ({
      type: 'call' as const,
      id: c.id,
      stageId: c.pipelineStageId,
      contact: c.callerNumber,
      contactName: null as string | null,
      contactEmail: null as string | null,
      contactPhone: c.callerNumber,
      source: c.trackingNumber.source,
      medium: c.trackingNumber.medium,
      campaign: c.trackingNumber.campaignTag,
      duration: c.duration,
      callStatus: c.callStatus,
      leadScore: c.leadScore,
      leadScoreLabel: c.leadScoreLabel,
      tags: c.tags,
      gclid: c.gclid,
      fbclid: c.fbclid,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    ...forms.map((f) => {
      const fd = f.formData as any;
      return {
        type: 'form' as const,
        id: f.id,
        stageId: f.pipelineStageId,
        contact: fd?.name || fd?.email || fd?.phone || 'N/A',
        contactName: fd?.name || null,
        contactEmail: fd?.email || null,
        contactPhone: fd?.phone || null,
        source: f.utmSource,
        medium: f.utmMedium,
        campaign: f.utmCampaign,
        duration: null as number | null,
        callStatus: null as string | null,
        leadScore: null as number | null,
        leadScoreLabel: null as string | null,
        tags: f.tags,
        gclid: f.gclid,
        fbclid: f.fbclid,
        createdAt: f.createdAt,
        updatedAt: null as Date | null,
      };
    }),
  ];

  // Group by stage
  const grouped = stages.map((stage) => ({
    stage: {
      id: stage.id,
      name: stage.name,
      position: stage.position,
      color: stage.color,
      isDefault: stage.isDefault,
      isWon: stage.isWon,
      isLost: stage.isLost,
    },
    leads: allLeads
      .filter((l) => l.stageId === stage.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  }));

  res.json({ pipeline: grouped });
}));

// ─── Stage Change History ───────────────────────────────

// GET /history/:leadType/:leadId
router.get('/history/:leadType/:leadId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const leadType = p(req.params.leadType);
  const leadId = p(req.params.leadId);

  const where = leadType === 'call'
    ? { callLogId: leadId }
    : { formLeadId: leadId };

  const history = await prisma.pipelineStageChange.findMany({
    where,
    include: {
      fromStage: { select: { name: true, color: true } },
      toStage: { select: { name: true, color: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ history });
}));

export default router;
