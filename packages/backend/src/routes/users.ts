import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { asyncHandler } from '../middleware/asyncHandler';
import nodemailer from 'nodemailer';

const router = Router();
router.use(authMiddleware);

const p = (v: string | string[]): string => Array.isArray(v) ? v[0] : v;

// Lazy mailer
let transporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

// ─── List Organization Members ──────────────────────────

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const members = await prisma.user.findMany({
    where: { organizationId: req.user!.organizationId },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(members);
}));

// ─── Invite a User ──────────────────────────────────────

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
});

router.post('/invite', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req: Request, res: Response) => {
  const body = inviteSchema.parse(req.body);

  // Check if user already in org
  const existing = await prisma.user.findFirst({
    where: { email: body.email, organizationId: req.user!.organizationId },
  });
  if (existing) { res.status(409).json({ error: 'User already in organization' }); return; }

  // Check for existing pending invite
  const existingInvite = await prisma.invite.findFirst({
    where: { email: body.email, organizationId: req.user!.organizationId, usedAt: null },
  });
  if (existingInvite) { res.status(409).json({ error: 'Invite already pending for this email' }); return; }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invite = await prisma.invite.create({
    data: {
      organizationId: req.user!.organizationId,
      email: body.email,
      role: body.role,
      token,
      expiresAt,
      createdById: req.user!.userId,
    },
  });

  // Send invite email
  if (env.SMTP_HOST) {
    const org = await prisma.organization.findUnique({ where: { id: req.user!.organizationId } });
    const inviteUrl = `${env.FRONTEND_URL}/invite?token=${token}`;

    getTransporter().sendMail({
      from: env.SMTP_FROM,
      to: body.email,
      subject: `You're invited to join ${org?.name || 'LeadTrack'}`,
      html: `
        <h2>You've been invited!</h2>
        <p>You've been invited to join <strong>${org?.name || 'a team'}</strong> on LeadTrack as a ${body.role}.</p>
        <p><a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:white;text-decoration:none;border-radius:6px;">Accept Invite</a></p>
        <p>This invite expires in 7 days.</p>
        <p><small>If you didn't expect this invite, you can safely ignore this email.</small></p>
      `,
    }).catch((err) => console.error('[Users] Failed to send invite email:', err));
  }

  res.status(201).json({
    id: invite.id,
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
  });
}));

// ─── Update Member Role ─────────────────────────────────

const updateRoleSchema = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
});

router.patch('/:id/role', requireRole('OWNER'), asyncHandler(async (req: Request, res: Response) => {
  const id = p(req.params.id);
  const body = updateRoleSchema.parse(req.body);

  const member = await prisma.user.findFirst({
    where: { id, organizationId: req.user!.organizationId },
  });
  if (!member) { res.status(404).json({ error: 'Member not found' }); return; }

  const updated = await prisma.user.update({
    where: { id },
    data: { role: body.role },
    select: { id: true, email: true, name: true, role: true },
  });
  res.json(updated);
}));

// ─── Remove Member ──────────────────────────────────────

router.delete('/:id', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req: Request, res: Response) => {
  const id = p(req.params.id);

  // Cannot remove self
  if (id === req.user!.userId) {
    res.status(400).json({ error: 'Cannot remove yourself' }); return;
  }

  const member = await prisma.user.findFirst({
    where: { id, organizationId: req.user!.organizationId },
  });
  if (!member) { res.status(404).json({ error: 'Member not found' }); return; }

  // Cannot remove an OWNER unless you are OWNER
  if (member.role === 'OWNER' && req.user!.role !== 'OWNER') {
    res.status(403).json({ error: 'Only owners can remove other owners' }); return;
  }

  // Ensure at least one OWNER remains
  if (member.role === 'OWNER') {
    const ownerCount = await prisma.user.count({
      where: { organizationId: req.user!.organizationId, role: 'OWNER' },
    });
    if (ownerCount <= 1) {
      res.status(400).json({ error: 'Cannot remove the last owner' }); return;
    }
  }

  await prisma.user.delete({ where: { id } });
  res.status(204).send();
}));

// ─── List Pending Invites ───────────────────────────────

router.get('/invites', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req: Request, res: Response) => {
  const invites = await prisma.invite.findMany({
    where: {
      organizationId: req.user!.organizationId,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(invites);
}));

// ─── Cancel Invite ──────────────────────────────────────

router.delete('/invites/:id', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req: Request, res: Response) => {
  const id = p(req.params.id);

  const invite = await prisma.invite.findFirst({
    where: { id, organizationId: req.user!.organizationId },
  });
  if (!invite) { res.status(404).json({ error: 'Invite not found' }); return; }

  await prisma.invite.delete({ where: { id } });
  res.status(204).send();
}));

export default router;
