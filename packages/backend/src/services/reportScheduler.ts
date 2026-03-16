import { prisma } from '../config/prisma';
import { env } from '../config/env';
import nodemailer from 'nodemailer';
import { gatherReportData, generateSummaryPdf } from './reportGenerator';

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

async function processScheduledReports(): Promise<void> {
  const reports = await prisma.scheduledReport.findMany({
    where: { isActive: true },
    include: { account: { select: { name: true, timezone: true } } },
  });

  for (const report of reports) {
    try {
      // Determine current time in account's timezone
      const now = new Date();
      const localTime = new Date(now.toLocaleString('en-US', { timeZone: report.account.timezone }));
      const localHour = localTime.getHours();
      const localDayOfWeek = localTime.getDay();
      const localDayOfMonth = localTime.getDate();

      // Check if it's the right hour
      if (localHour !== report.hour) continue;

      // Check frequency
      if (report.frequency === 'WEEKLY' && report.dayOfWeek !== null && localDayOfWeek !== report.dayOfWeek) continue;
      if (report.frequency === 'MONTHLY' && report.dayOfMonth !== null && localDayOfMonth !== report.dayOfMonth) continue;

      // Skip if already sent this hour
      if (report.lastSentAt) {
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (report.lastSentAt > hourAgo) continue;
      }

      // Determine date range
      const days = report.frequency === 'WEEKLY' ? 7 : 30;
      const data = await gatherReportData(report.accountId, days);
      const pdfBuffer = await generateSummaryPdf(data);

      // Send email to all recipients
      if (env.SMTP_HOST && report.recipients.length > 0) {
        const frequencyLabel = report.frequency === 'WEEKLY' ? 'Weekly' : 'Monthly';
        await getTransporter().sendMail({
          from: env.SMTP_FROM,
          to: report.recipients.join(', '),
          subject: `LeadTrack ${frequencyLabel} Report — ${report.account.name}`,
          html: `
            <h2>LeadTrack ${frequencyLabel} Report</h2>
            <p>Account: <strong>${report.account.name}</strong></p>
            <p>Period: Last ${days} days</p>
            <ul>
              <li>Total Leads: ${data.kpis.totalLeads}</li>
              <li>Calls: ${data.kpis.totalCalls}</li>
              <li>Form Submissions: ${data.kpis.totalForms}</li>
              <li>Missed Calls: ${data.kpis.missedCalls}</li>
              <li>Total Spend: $${data.kpis.totalSpend.toFixed(2)}</li>
              <li>Cost per Lead: $${data.kpis.costPerLead.toFixed(2)}</li>
            </ul>
            <p>See the attached PDF for the full report.</p>
          `,
          attachments: [{
            filename: `leadtrack-report-${report.account.name.toLowerCase().replace(/\s+/g, '-')}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          }],
        });
      }

      await prisma.scheduledReport.update({
        where: { id: report.id },
        data: { lastSentAt: new Date() },
      });

      console.log(`[Reports] Sent ${report.frequency} report for account ${report.accountId}`);
    } catch (err) {
      console.error(`[Reports] Failed to send report ${report.id}:`, err);
    }
  }
}

export function startReportScheduler(): void {
  setInterval(async () => {
    try {
      await processScheduledReports();
    } catch (err) {
      console.error('[Reports] Scheduler error:', err);
    }
  }, 60 * 60 * 1000);

  console.log('[Reports] Report scheduler started');
}
