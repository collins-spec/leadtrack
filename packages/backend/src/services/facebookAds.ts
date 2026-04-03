import { prisma } from '../config/prisma';
import { env } from '../config/env';

const FB_GRAPH_URL = 'https://graph.facebook.com/v21.0';

// ─── OAuth Helpers ──────────────────────────────────────

export function getFacebookOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.FACEBOOK_APP_ID,
    redirect_uri: `${env.BACKEND_URL}/api/facebook-ads/callback`,
    response_type: 'code',
    scope: 'ads_management,ads_read,pages_manage_ads,leads_retrieval,pages_show_list',
    state,
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
}

export async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string;
  expiresIn: number;
  email?: string;
}> {
  // Exchange code for short-lived token
  const tokenRes = await fetch(`${FB_GRAPH_URL}/oauth/access_token?` + new URLSearchParams({
    client_id: env.FACEBOOK_APP_ID,
    client_secret: env.FACEBOOK_APP_SECRET,
    redirect_uri: `${env.BACKEND_URL}/api/facebook-ads/callback`,
    code,
  }));
  const tokenData = (await tokenRes.json()) as Record<string, any>;
  if (!tokenData.access_token) throw new Error('No access token received from Facebook');

  // Exchange short-lived for long-lived token (~60 days)
  const longLivedRes = await fetch(`${FB_GRAPH_URL}/oauth/access_token?` + new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: env.FACEBOOK_APP_ID,
    client_secret: env.FACEBOOK_APP_SECRET,
    fb_exchange_token: tokenData.access_token,
  }));
  const longLivedData = (await longLivedRes.json()) as Record<string, any>;

  const accessToken = longLivedData.access_token || tokenData.access_token;
  const expiresIn = longLivedData.expires_in || tokenData.expires_in || 5184000; // Default ~60 days

  // Fetch user email
  let email: string | undefined;
  try {
    const meRes = await fetch(`${FB_GRAPH_URL}/me?fields=email&access_token=${accessToken}`);
    const meData = (await meRes.json()) as Record<string, any>;
    email = meData.email;
  } catch {
    // email is optional
  }

  return { accessToken, expiresIn, email };
}

// ─── Ad Account Listing ─────────────────────────────────

export async function getAdAccounts(accessToken: string): Promise<Array<{
  id: string;
  name: string;
  accountStatus: number;
}>> {
  const res = await fetch(
    `${FB_GRAPH_URL}/me/adaccounts?fields=id,name,account_status&access_token=${accessToken}&limit=100`
  );
  const data = (await res.json()) as Record<string, any>;

  return (data.data || []).map((acct: any) => ({
    id: acct.id, // e.g. "act_123456789"
    name: acct.name,
    accountStatus: acct.account_status,
  }));
}

// ─── Spend Sync ─────────────────────────────────────────

/**
 * Sync spend for a single Facebook Ads connection. Returns number of records synced.
 * Supports date range for backfill (defaults to yesterday).
 * Health tracking is handled by the sync runner — this function just throws on failure.
 */
export async function syncSpendForConnection(
  connectionId: string,
  dateRange?: { start: string; end: string },
): Promise<number> {
  const connection = await prisma.facebookAdsConnection.findUnique({
    where: { id: connectionId },
  });
  if (!connection || !connection.isActive || !connection.fbAdAccountId) return 0;

  // Check token expiry before making API calls
  if (connection.tokenExpiresAt && connection.tokenExpiresAt < new Date()) {
    throw new Error('Facebook access token has expired. User must reconnect.');
  }

  const startDate = dateRange?.start
    || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const endDate = dateRange?.end || startDate;

  const params = new URLSearchParams({
    fields: 'campaign_name,spend,clicks,impressions',
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    level: 'campaign',
    access_token: connection.accessToken,
  });

  const res = await fetch(`${FB_GRAPH_URL}/${connection.fbAdAccountId}/insights?${params}`);
  const data = (await res.json()) as Record<string, any>;

  if (data.error) {
    throw new Error(data.error.message || 'Facebook API error');
  }

  let recordsSynced = 0;

  for (const row of (data.data || [])) {
    const campaignName = row.campaign_name || '(unknown)';
    const spend = parseFloat(row.spend || '0');
    const clicks = parseInt(row.clicks || '0');
    const impressions = parseInt(row.impressions || '0');

    await prisma.spendEntry.upsert({
      where: {
        accountId_source_medium_campaign_date: {
          accountId: connection.accountId,
          source: 'Facebook Ads',
          medium: 'cpc',
          campaign: campaignName,
          date: new Date(startDate),
        },
      },
      update: { spend, clicks, impressions },
      create: {
        accountId: connection.accountId,
        source: 'Facebook Ads',
        medium: 'cpc',
        campaign: campaignName,
        date: new Date(startDate),
        spend,
        clicks,
        impressions,
        isManual: false,
      },
    });
    recordsSynced++;
  }

  return recordsSynced;
}

/**
 * Batched sync of all active Facebook Ads connections.
 */
export async function syncAllFacebookAdsSpend(): Promise<void> {
  const { runBatchedSync } = await import('./syncRunner');

  const connections = await prisma.facebookAdsConnection.findMany({
    where: { isActive: true, fbAdAccountId: { not: '' } },
    select: { id: true, accountId: true, isActive: true, consecutiveFailures: true, isThrottled: true, throttledUntil: true },
  });

  await runBatchedSync('facebook_ads', connections, syncSpendForConnection);
}

// ─── Token Expiry Monitoring ────────────────────────────

/**
 * Returns connections with tokens expiring within the given number of days.
 */
export async function getExpiringTokenConnections(
  accountId: string,
  withinDays = 14,
): Promise<Array<{ id: string; name: string | null; fbEmail: string | null; tokenExpiresAt: Date | null }>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);

  return prisma.facebookAdsConnection.findMany({
    where: {
      accountId,
      isActive: true,
      tokenExpiresAt: { lt: cutoff },
    },
    select: { id: true, name: true, fbEmail: true, tokenExpiresAt: true },
    orderBy: { tokenExpiresAt: 'asc' },
  });
}

/**
 * Check all Facebook connections for expiring tokens and create notifications.
 */
export async function checkTokenExpiry(): Promise<void> {
  const expiringConnections = await prisma.facebookAdsConnection.findMany({
    where: {
      isActive: true,
      tokenExpiresAt: {
        lt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        gt: new Date(),
      },
    },
    include: { account: { select: { id: true, name: true, organizationId: true } } },
  });

  for (const conn of expiringConnections) {
    const daysUntilExpiry = conn.tokenExpiresAt
      ? Math.ceil((conn.tokenExpiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      : 0;

    // Only notify once per day per connection
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existing = await prisma.notification.findFirst({
      where: {
        accountId: conn.accountId,
        createdAt: { gte: today },
        body: { contains: conn.id },
      },
    });
    if (existing) continue;

    // Notify org admins/owners
    const users = await prisma.user.findMany({
      where: { organizationId: conn.account.organizationId, role: { in: ['OWNER', 'ADMIN'] } },
      select: { id: true },
    });

    for (const user of users) {
      await prisma.notification.create({
        data: {
          accountId: conn.accountId,
          userId: user.id,
          event: 'HIGH_VALUE_LEAD',
          title: `Facebook token expiring in ${daysUntilExpiry} days`,
          body: `Connection "${conn.name || conn.fbEmail}" (${conn.id}) needs reconnection before ${conn.tokenExpiresAt?.toLocaleDateString()}.`,
          link: '/dashboard/settings',
        },
      });
    }
  }

  if (expiringConnections.length > 0) {
    console.log(`[FacebookAds] ${expiringConnections.length} connections have tokens expiring within 14 days`);
  }
}

// ─── Facebook Conversions API ───────────────────────────

export async function uploadFacebookConversion(
  accountId: string,
  fbclid: string,
  eventName: string,
  eventTime: Date,
  value?: number,
): Promise<void> {
  // Try all active Facebook connections for this account
  const connections = await prisma.facebookAdsConnection.findMany({
    where: { accountId, isActive: true, fbAdAccountId: { not: '' } },
  });
  if (connections.length === 0) return;

  for (const connection of connections) {
    try {
      // Look up conversion mapping for this connection
      const mapping = await prisma.facebookConversionMapping.findUnique({
        where: {
          connectionId_tagLabel: {
            connectionId: connection.id,
            tagLabel: eventName,
          },
        },
      });

      if (!mapping) continue; // No mapping for this connection

      // Build fbc parameter from fbclid (Facebook Click Browser parameter)
      // Format: fb.1.{timestamp}.{fbclid}
      const fbc = `fb.1.${eventTime.getTime()}.${fbclid}`;

      const eventData = {
        data: [{
          event_name: mapping.pixelEventName,
          event_time: Math.floor(eventTime.getTime() / 1000),
          action_source: 'website',
          user_data: {
            fbc,
          },
          custom_data: {
            value: value || 1.0,
            currency: 'USD',
          },
        }],
      };

      const res = await fetch(
        `${FB_GRAPH_URL}/${connection.fbAdAccountId}/events?access_token=${connection.accessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(eventData),
        }
      );

      const result = (await res.json()) as Record<string, any>;

      if (result.error) {
        throw new Error(result.error.message);
      }

      console.log(`[FacebookAds] Uploaded conversion for fbclid=${fbclid} event=${mapping.pixelEventName} value=${value || 1.0}`);
      return; // Success
    } catch (err) {
      console.error(`[FacebookAds] Conversion upload failed for fbclid=${fbclid} on connection=${connection.id}:`, err);
    }
  }
}

// ─── Facebook Lead Ads ──────────────────────────────

export async function getPages(accessToken: string): Promise<Array<{
  id: string;
  name: string;
  accessToken: string;
}>> {
  const res = await fetch(
    `${FB_GRAPH_URL}/me/accounts?fields=id,name,access_token&access_token=${accessToken}&limit=100`
  );
  const data = (await res.json()) as Record<string, any>;
  return (data.data || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    accessToken: p.access_token,
  }));
}

export async function subscribePageToLeadgen(
  pageId: string,
  pageAccessToken: string,
): Promise<void> {
  const res = await fetch(
    `${FB_GRAPH_URL}/${pageId}/subscribed_apps?subscribed_fields=leadgen&access_token=${pageAccessToken}`,
    { method: 'POST' },
  );
  const data = (await res.json()) as Record<string, any>;
  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to subscribe to leadgen webhooks');
  }
  console.log(`[FacebookAds] Subscribed page ${pageId} to leadgen webhooks`);
}

export async function fetchLeadData(
  leadgenId: string,
  accessToken: string,
): Promise<{
  formData: Record<string, string>;
  campaignName: string | null;
  adName: string | null;
  createdTime: string | null;
}> {
  const res = await fetch(
    `${FB_GRAPH_URL}/${leadgenId}?fields=field_data,ad_id,ad_name,campaign_id,campaign_name,created_time,form_id&access_token=${accessToken}`,
  );
  const data = (await res.json()) as Record<string, any>;

  if (data.error) {
    throw new Error(data.error.message || 'Failed to fetch lead data');
  }

  // Convert field_data array to formData object
  const formData: Record<string, string> = {};
  for (const field of (data.field_data || [])) {
    formData[field.name] = Array.isArray(field.values) ? field.values[0] : field.values;
  }

  return {
    formData,
    campaignName: data.campaign_name || null,
    adName: data.ad_name || null,
    createdTime: data.created_time || null,
  };
}

// ─── Scheduler ──────────────────────────────────────────

export function startFacebookAdsSync(): void {
  // Process queue every 5 minutes
  setInterval(async () => {
    try {
      const { processQueuedSyncs } = await import('./syncRunner');
      await processQueuedSyncs('facebook_ads', syncSpendForConnection);
    } catch (err) {
      console.error('[FacebookAds] Queue processing error:', err);
    }
  }, 5 * 60 * 1000);

  // Schedule daily spend syncs at 4am UTC
  setInterval(async () => {
    const hour = new Date().getUTCHours();
    if (hour !== 4) return;

    try {
      const { enqueueSyncs } = await import('./syncRunner');
      const connections = await prisma.facebookAdsConnection.findMany({
        where: { isActive: true, fbAdAccountId: { not: '' }, isThrottled: false },
        select: { id: true },
      });

      const ids = connections.map((c) => c.id);
      const enqueued = await enqueueSyncs('facebook_ads', 'FACEBOOK_ADS_SPEND', ids);
      console.log(`[FacebookAds] Enqueued ${enqueued} daily spend syncs`);
    } catch (err) {
      console.error('[FacebookAds] Daily enqueue error:', err);
    }
  }, 60 * 60 * 1000);

  // Check token expiry every 6 hours
  setInterval(async () => {
    try {
      await checkTokenExpiry();
    } catch (err) {
      console.error('[FacebookAds] Token expiry check error:', err);
    }
  }, 6 * 60 * 60 * 1000);

  // Run token check immediately on startup
  checkTokenExpiry().catch((err) => console.error('[FacebookAds] Initial token check error:', err));

  console.log('[FacebookAds] Spend sync scheduler started (queue-based, with token expiry monitoring)');
}
