import PDFDocument from 'pdfkit';
import { prisma } from '../config/prisma';

// ─── Types ──────────────────────────────────────────────

export interface ReportData {
  accountName: string;
  dateRange: { from: Date; to: Date };
  kpis: {
    totalCalls: number;
    totalForms: number;
    totalLeads: number;
    missedCalls: number;
    avgDuration: number;
    totalSpend: number;
    costPerLead: number;
  };
  calls: {
    id: string
    callerNumber: string;
    source: string;
    callStatus: string;
    duration: number;
    leadScoreLabel: string | null;
    createdAt: Date;
  }[];
  formLeads: {
    id: string;
    contact: string;
    source: string | null;
    pageUrl: string | null;
    createdAt: Date;
  }[];
  campaigns: {
    campaign: string;
    source: string;
    medium: string;
    spend: number;
    clicks: number;
    impressions: number;
  }[];
}

// ─── Data Gathering ─────────────────────────────────────

export async function gatherReportData(accountId: string, days: number = 30): Promise<ReportData> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw new Error('Account not found');

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);

  const [totalCalls, totalForms, missedCalls, avgDur, spendAgg, calls, formLeads, campaignData] =
    await Promise.all([
      prisma.callLog.count({ where: { accountId, createdAt: { gte: from, lte: to } } }),
      prisma.formLead.count({ where: { accountId, createdAt: { gte: from, lte: to } } }),
      prisma.callLog.count({
        where: { accountId, createdAt: { gte: from, lte: to }, callStatus: { in: ['NO_ANSWER', 'BUSY'] } },
      }),
      prisma.callLog.aggregate({
        _avg: { duration: true },
        where: { accountId, createdAt: { gte: from, lte: to }, callStatus: 'COMPLETED' },
      }),
      prisma.spendEntry.aggregate({
        _sum: { spend: true },
        where: { accountId, date: { gte: from, lte: to } },
      }),
      prisma.callLog.findMany({
        where: { accountId, createdAt: { gte: from, lte: to } },
        include: { trackingNumber: { select: { source: true } } },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      prisma.formLead.findMany({
        where: { accountId, createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      prisma.spendEntry.groupBy({
        by: ['campaign', 'source', 'medium'],
        _sum: { spend: true, clicks: true, impressions: true },
        where: { accountId, date: { gte: from, lte: to } },
      }),
    ]);

  const totalLeads = totalCalls + totalForms;
  const totalSpend = spendAgg._sum.spend || 0;

  return {
    accountName: account.name,
    dateRange: { from, to },
    kpis: {
      totalCalls,
      totalForms,
      totalLeads,
      missedCalls,
      avgDuration: Math.round(avgDur._avg.duration || 0),
      totalSpend,
      costPerLead: totalLeads > 0 ? +(totalSpend / totalLeads).toFixed(2) : 0,
    },
    calls: calls.map((c: any) => ({
      id: c.id,
      callerNumber: c.callerNumber,
      source: c.trackingNumber.source,
      callStatus: c.callStatus,
      duration: c.duration,
      leadScoreLabel: c.leadScoreLabel,
      createdAt: c.createdAt,
    })),
    formLeads: formLeads.map((f: any) => ({
      id: f.id,
      contact: (f.formData as any)?.name || (f.formData as any)?.email || 'N/A',
      source: f.utmSource,
      pageUrl: f.pageUrl,
      createdAt: f.createdAt,
    })),
    campaigns: campaignData.map((c: any) => ({
      campaign: c.campaign || '(none)',
      source: c.source,
      medium: c.medium,
      spend: c._sum.spend || 0,
      clicks: c._sum.clicks || 0,
      impressions: c._sum.impressions || 0,
    })),
  };
}

// ─── CSV Generation ─────────────────────────────────────

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function generateCallsCsv(calls: ReportData['calls']): string {
  const headers = ['ID', 'Caller Number', 'Source', 'Status', 'Duration (s)', 'Lead Score', 'Date'];
  const rows = calls.map((c) => [
    c.id,
    c.callerNumber,
    c.source,
    c.callStatus,
    String(c.duration),
    c.leadScoreLabel || '',
    c.createdAt.toISOString(),
  ]);
  return [headers, ...rows].map((row) => row.map(escapeCsvField).join(',')).join('\n');
}

export function generateFormLeadsCsv(leads: ReportData['formLeads']): string {
  const headers = ['ID', 'Contact', 'Source', 'Page URL', 'Date'];
  const rows = leads.map((l) => [
    l.id,
    l.contact,
    l.source || '',
    l.pageUrl || '',
    l.createdAt.toISOString(),
  ]);
  return [headers, ...rows].map((row) => row.map(escapeCsvField).join(',')).join('\n');
}

export function generateCampaignsCsv(data: ReportData): string {
  const headers = ['Campaign', 'Source', 'Medium', 'Spend', 'Clicks', 'Impressions'];
  const rows = data.campaigns.map((c) => [
    c.campaign,
    c.source,
    c.medium,
    c.spend.toFixed(2),
    String(c.clicks),
    String(c.impressions),
  ]);
  return [headers, ...rows].map((row) => row.map(escapeCsvField).join(',')).join('\n');
}

// ─── PDF Generation ─────────────────────────────────────

export async function generateSummaryPdf(data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Title
    doc.fontSize(20).text(`LeadTrack Report: ${data.accountName}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#666')
      .text(`${data.dateRange.from.toLocaleDateString()} – ${data.dateRange.to.toLocaleDateString()}`, { align: 'center' });
    doc.moveDown(1.5);

    // KPIs
    doc.fontSize(14).fillColor('#000').text('Key Metrics');
    doc.moveDown(0.5);
    doc.fontSize(10);

    const k = data.kpis;
    const mins = Math.floor(k.avgDuration / 60);
    const secs = String(k.avgDuration % 60).padStart(2, '0');
    const kpiLines = [
      `Total Leads: ${k.totalLeads}`,
      `Calls: ${k.totalCalls}  |  Form Submissions: ${k.totalForms}`,
      `Missed Calls: ${k.missedCalls}`,
      `Avg Call Duration: ${mins}:${secs}`,
      `Total Ad Spend: $${k.totalSpend.toFixed(2)}`,
      `Cost per Lead: $${k.costPerLead.toFixed(2)}`,
    ];
    for (const line of kpiLines) {
      doc.text(line);
    }
    doc.moveDown(1);

    // Campaigns
    if (data.campaigns.length > 0) {
      doc.fontSize(14).text('Campaign Spend');
      doc.moveDown(0.5);
      doc.fontSize(9);
      for (const c of data.campaigns.slice(0, 15)) {
        doc.text(`${c.campaign} (${c.source}/${c.medium}): $${c.spend.toFixed(2)} — ${c.clicks} clicks, ${c.impressions} impressions`);
      }
      doc.moveDown(1);
    }

    // Recent calls summary
    if (data.calls.length > 0) {
      doc.fontSize(14).text(`Recent Calls (${data.calls.length})`);
      doc.moveDown(0.5);
      doc.fontSize(8);
      for (const c of data.calls.slice(0, 25)) {
        doc.text(`${c.callerNumber} — ${c.source} — ${c.callStatus} — ${c.duration}s — ${c.leadScoreLabel || 'N/A'} — ${c.createdAt.toLocaleDateString()}`);
      }
      doc.moveDown(1);
    }

    // Form leads summary
    if (data.formLeads.length > 0) {
      doc.fontSize(14).text(`Recent Form Leads (${data.formLeads.length})`);
      doc.moveDown(0.5);
      doc.fontSize(8);
      for (const f of data.formLeads.slice(0, 25)) {
        doc.text(`${f.contact} — ${f.source || 'Direct'} — ${f.createdAt.toLocaleDateString()}`);
      }
    }

    doc.end();
  });
}
