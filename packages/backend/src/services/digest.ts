import { prisma } from '../config/prisma';
import { emitNotification } from './notification';

export function startDailyDigest() {
  // Check every hour whether it's 8 AM in each account's timezone
  setInterval(async () => {
    try {
      await sendDigestsIfDue();
    } catch (err) {
      console.error('[Digest] Error:', err);
    }
  }, 60 * 60 * 1000);

  console.log('[Digest] Daily digest scheduler started');
}

async function sendDigestsIfDue() {
  // Find accounts that have DAILY_DIGEST in any active notification config
  const configs = await prisma.notificationConfig.findMany({
    where: { isActive: true, events: { has: 'DAILY_DIGEST' } },
    include: { account: true },
  });

  const accountIds = [...new Set(configs.map((c) => c.accountId))];
  const now = new Date();

  for (const accountId of accountIds) {
    const account = configs.find((c) => c.accountId === accountId)!.account;

    // Check if current hour in account timezone is 8 AM
    const accountHour = new Date(
      now.toLocaleString('en-US', { timeZone: account.timezone || 'America/New_York' }),
    ).getHours();

    if (accountHour !== 8) continue;

    // Gather last 24h stats
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [totalCalls, missedCalls, totalForms, highValueLeads] = await Promise.all([
      prisma.callLog.count({ where: { accountId, createdAt: { gte: yesterday } } }),
      prisma.callLog.count({
        where: { accountId, createdAt: { gte: yesterday }, callStatus: { in: ['NO_ANSWER', 'BUSY'] } },
      }),
      prisma.formLead.count({ where: { accountId, createdAt: { gte: yesterday } } }),
      prisma.callLog.count({
        where: { accountId, createdAt: { gte: yesterday }, leadScore: { gte: 70 } },
      }),
    ]);

    // Only send if there was any activity
    if (totalCalls + totalForms === 0) continue;

    await emitNotification(accountId, 'DAILY_DIGEST', {
      accountName: account.name,
      totalCalls,
      totalForms,
      missedCalls,
      highValueLeads,
    });
  }
}
