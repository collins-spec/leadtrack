import { prisma } from '../config/prisma';
import { env } from '../config/env';
import nodemailer from 'nodemailer';
type NotificationEventType = 'NEW_CALL' | 'MISSED_CALL' | 'NEW_FORM' | 'HIGH_VALUE_LEAD' | 'DAILY_DIGEST';

// ─── Lazy SMTP transporter ───────────────────────────────

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

// ─── Payload types ───────────────────────────────────────

export interface NotificationPayload {
  callerNumber?: string;
  callerCity?: string;
  callerState?: string;
  source?: string;
  callStatus?: string;
  leadScore?: number;
  leadScoreLabel?: string;
  formData?: Record<string, any>;
  callLogId?: string;
  formLeadId?: string;
  accountName?: string;
  // digest
  totalCalls?: number;
  totalForms?: number;
  missedCalls?: number;
  highValueLeads?: number;
}

// ─── Format notification per event type ──────────────────

function formatNotification(
  event: NotificationEventType,
  data: NotificationPayload,
): { title: string; body: string; link: string } {
  switch (event) {
    case 'NEW_CALL':
      return {
        title: `New call from ${data.callerNumber || 'Unknown'}`,
        body: `Incoming call from ${data.callerNumber || 'Unknown'} (${data.callerCity || 'Unknown'}${data.callerState ? `, ${data.callerState}` : ''}) via ${data.source || 'Direct'}`,
        link: '/dashboard/calls',
      };
    case 'MISSED_CALL':
      return {
        title: `Missed call from ${data.callerNumber || 'Unknown'}`,
        body: `Missed call (${data.callStatus || 'NO ANSWER'}) from ${data.callerNumber || 'Unknown'} via ${data.source || 'Direct'}`,
        link: '/dashboard/calls',
      };
    case 'NEW_FORM':
      return {
        title: 'New form submission',
        body: `New lead from ${data.formData?.name || data.formData?.email || 'unknown contact'}`,
        link: '/dashboard/leads',
      };
    case 'HIGH_VALUE_LEAD':
      return {
        title: `High-value lead detected (Score: ${data.leadScore})`,
        body: `Call from ${data.callerNumber || 'Unknown'} scored ${data.leadScore}/100 (${data.leadScoreLabel})`,
        link: '/dashboard/leads',
      };
    case 'DAILY_DIGEST':
      return {
        title: `Daily Summary for ${data.accountName || 'your account'}`,
        body: `${data.totalCalls || 0} calls, ${data.totalForms || 0} forms, ${data.missedCalls || 0} missed, ${data.highValueLeads || 0} high-value leads`,
        link: '/dashboard',
      };
    default:
            throw new Error(`Unknown notification event: ${event}`);
  }
}

// ─── Channel dispatchers ─────────────────────────────────

async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  if (!env.SMTP_HOST) {
    console.warn('[Notification] SMTP not configured, skipping email');
    return;
  }
  const transport = getTransporter();
  await transport.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `[LeadTrack] ${subject}`,
    html: `<div style="font-family:sans-serif;max-width:600px;">
      <h2 style="margin:0 0 8px">${subject}</h2>
      <p style="color:#444;margin:0 0 16px">${body}</p>
      <hr style="border:none;border-top:1px solid #eee"/>
      <p style="color:#999;font-size:12px;margin-top:12px">You're receiving this from LeadTrack.</p>
    </div>`,
  });
}

async function sendSlack(webhookUrl: string, msg: { title: string; body: string }): Promise<void> {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `*${msg.title}*\n${msg.body}`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `*${msg.title}*\n${msg.body}` } },
      ],
    }),
  });
}

async function sendWebhook(url: string, event: NotificationEventType, payload: any): Promise<void> {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, ...payload }),
  });
}

// ─── Main entry point ────────────────────────────────────

export async function emitNotification(
  accountId: string,
  event: NotificationEventType,
  data: NotificationPayload,
): Promise<void> {
  const formatted = formatNotification(event, data);

  // 1. Find matching external configs
  const configs = await prisma.notificationConfig.findMany({
    where: { accountId, isActive: true, events: { has: event } },
  });

  // 2. Create in-app notifications for all org users
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { organizationId: true },
  });

  if (account) {
    const users = await prisma.user.findMany({
      where: { organizationId: account.organizationId },
      select: { id: true },
    });

    Promise.all(
      users.map((u: any) =>
        prisma.notification.create({
          data: {
            accountId,
            userId: u.id,
            event,
            title: formatted.title,
            body: formatted.body,
            link: formatted.link,
          },
        }),
      ),
    ).catch((err) => console.error('[Notification] Failed to create in-app:', err));
  }

  // 3. Dispatch to external channels
  for (const config of configs) {
    switch (config.channel) {
      case 'EMAIL':
        sendEmail(config.target, formatted.title, formatted.body)
          .catch((err) => console.error('[Notification] Email failed:', err));
        break;
      case 'SLACK':
        sendSlack(config.target, formatted)
          .catch((err) => console.error('[Notification] Slack failed:', err));
        break;
      case 'WEBHOOK':
        sendWebhook(config.target, event, { ...formatted, data })
          .catch((err) => console.error('[Notification] Webhook failed:', err));
        break;
    }
  }
}
