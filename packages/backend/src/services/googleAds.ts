import { prisma } from '../config/prisma';
import { env } from '../config/env';

// ─── OAuth Helpers ──────────────────────────────────────

export function getGoogleOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_ADS_CLIENT_ID,
    redirect_uri: `${env.BACKEND_URL}/api/google-ads/callback`,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/adwords',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  refreshToken: string;
  accessToken: string;
  email?: string;
}> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_ADS_CLIENT_ID,
      client_secret: env.GOOGLE_ADS_CLIENT_SECRET,
      redirect_uri: `${env.BACKEND_URL}/api/google-ads/callback`,
      grant_type: 'authorization_code',
    }),
  });
  const data = (await res.json()) as Record<string, any>;
  if (!data.refresh_token) throw new Error('No refresh token received');

  // Try to fetch the user's email
  let email: string | undefined;
  if (data.access_token) {
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const userInfo = (await userRes.json()) as Record<string, any>;
      email = userInfo.email;
    } catch {
      // email is optional
    }
  }

  return { refreshToken: data.refresh_token, accessToken: data.access_token, email };
}

async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_ADS_CLIENT_ID,
      client_secret: env.GOOGLE_ADS_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const data = (await res.json()) as Record<string, any>;
  if (!data.access_token) throw new Error('Failed to refresh access token');
  return data.access_token;
}

// ─── Spend Sync ─────────────────────────────────────────

/**
 * Sync spend for a single connection. Returns number of records synced.
 * Supports date range for backfill (defaults to yesterday).
 */
export async function syncSpendForConnection(
  connectionId: string,
  dateRange?: { start: string; end: string },
): Promise<number> {
  const connection = await prisma.googleAdsConnection.findUnique({
    where: { id: connectionId },
  });
  if (!connection || !connection.isActive || !connection.googleCustomerId) return 0;

  const accessToken = await getAccessToken(connection.refreshToken);

  // Default to yesterday if no date range specified
  const startDate = dateRange?.start
    || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const endDate = dateRange?.end || startDate;

  const startStr = startDate.replace(/-/g, '');
  const endStr = endDate.replace(/-/g, '');

  const query = `
    SELECT
      campaign.name,
      campaign.id,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      segments.date
    FROM campaign
    WHERE segments.date >= '${startStr}'
      AND segments.date <= '${endStr}'
      AND campaign.status != 'REMOVED'
  `;

  const customerId = connection.googleCustomerId.replace(/-/g, '');
  const apiUrl = `https://googleads.googleapis.com/v19/customers/${customerId}/googleAds:searchStream`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google Ads API ${response.status}: ${errorBody.slice(0, 200)}`);
  }

  const results = await response.json();
  let recordsSynced = 0;

  for (const batch of (Array.isArray(results) ? results : [])) {
    for (const row of (batch.results || [])) {
      const campaignName = row.campaign?.name || '(unknown)';
      const costMicros = parseInt(row.metrics?.costMicros || '0');
      const spend = costMicros / 1_000_000;
      const clicks = parseInt(row.metrics?.clicks || '0');
      const impressions = parseInt(row.metrics?.impressions || '0');
      const segmentDate = row.segments?.date;

      if (!segmentDate) continue;

      await prisma.spendEntry.upsert({
        where: {
          accountId_source_medium_campaign_date: {
            accountId: connection.accountId,
            source: 'Google Ads',
            medium: 'cpc',
            campaign: campaignName,
            date: new Date(segmentDate),
          },
        },
        update: { spend, clicks, impressions },
        create: {
          accountId: connection.accountId,
          source: 'Google Ads',
          medium: 'cpc',
          campaign: campaignName,
          date: new Date(segmentDate),
          spend,
          clicks,
          impressions,
          isManual: false,
        },
      });
      recordsSynced++;
    }
  }

  return recordsSynced;
}

/**
 * Batched sync of all active Google Ads connections.
 * Uses the ConnectionSyncRunner for concurrency, rate limiting, and health tracking.
 */
export async function syncAllGoogleAdsSpend(): Promise<void> {
  const { runBatchedSync } = await import('./syncRunner');

  const connections = await prisma.googleAdsConnection.findMany({
    where: { isActive: true, googleCustomerId: { not: '' } },
    select: { id: true, accountId: true, isActive: true, consecutiveFailures: true, isThrottled: true, throttledUntil: true },
  });

  await runBatchedSync('google_ads', connections, syncSpendForConnection);
}

// ─── Conversion Upload ──────────────────────────────────

export async function uploadOfflineConversion(
  accountId: string,
  gclid: string,
  conversionAction: string,
  conversionDateTime: Date,
  conversionValue?: number,
): Promise<void> {
  // Try all active connections for this account until one succeeds
  const connections = await prisma.googleAdsConnection.findMany({
    where: { accountId, isActive: true, googleCustomerId: { not: '' } },
  });
  if (connections.length === 0) return;

  for (const connection of connections) {
    try {
      const accessToken = await getAccessToken(connection.refreshToken);
      const customerId = connection.googleCustomerId.replace(/-/g, '');

      // Look up conversion action ID from mapping table for this connection
      const mapping = await prisma.conversionActionMapping.findUnique({
        where: {
          connectionId_tagLabel: {
            connectionId: connection.id,
            tagLabel: conversionAction,
          },
        },
      });

      if (!mapping) continue; // No mapping for this connection, try next

      const apiUrl = `https://googleads.googleapis.com/v19/customers/${customerId}:uploadClickConversions`;

      await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversions: [{
            gclid,
            conversionAction: mapping.conversionActionId,
            conversionDateTime: conversionDateTime.toISOString().replace('T', ' ').slice(0, 19) + '+00:00',
            conversionValue: conversionValue || 1.0,
            currencyCode: 'USD',
          }],
          partialFailure: true,
        }),
      });

      console.log(`[GoogleAds] Uploaded conversion for gclid=${gclid} via connection=${connection.id} action=${mapping.conversionActionId} value=${conversionValue || 1.0}`);
      return; // Success — stop trying other connections
    } catch (err) {
      console.error(`[GoogleAds] Conversion upload failed for gclid=${gclid} on connection=${connection.id}:`, err);
    }
  }
}

// ─── GCLID Resolution ────────────────────────────────

// Cache: accountId → Map<googleCustomerId, connectionId>
// Avoids iterating all connections per account on every GCLID resolution.
const gclidConnectionCache = new Map<string, Map<string, string>>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const cacheTimestamps = new Map<string, number>();

async function getConnectionsForAccount(accountId: string) {
  const now = Date.now();
  const cacheTs = cacheTimestamps.get(accountId) || 0;

  if (now - cacheTs < CACHE_TTL_MS && gclidConnectionCache.has(accountId)) {
    return gclidConnectionCache.get(accountId)!;
  }

  const connections = await prisma.googleAdsConnection.findMany({
    where: { accountId, isActive: true, googleCustomerId: { not: '' } },
    select: { id: true, googleCustomerId: true },
  });

  const map = new Map<string, string>();
  for (const c of connections) {
    map.set(c.googleCustomerId.replace(/-/g, ''), c.id);
  }
  gclidConnectionCache.set(accountId, map);
  cacheTimestamps.set(accountId, now);
  return map;
}

export async function resolveGclidAttribution(
  callLogId: string,
  gclid: string,
  accountId: string,
): Promise<void> {
  const connectionMap = await getConnectionsForAccount(accountId);
  if (connectionMap.size === 0) return;

  // Try each connection's customer ID
  for (const [customerId, connectionId] of connectionMap) {
    try {
      const connection = await prisma.googleAdsConnection.findUnique({
        where: { id: connectionId },
        select: { refreshToken: true },
      });
      if (!connection) continue;

      const accessToken = await getAccessToken(connection.refreshToken);

      const query = `
        SELECT
          click_view.gclid,
          click_view.keyword,
          click_view.keyword_info.text,
          click_view.keyword_info.match_type,
          click_view.ad_group_ad,
          campaign.name,
          campaign.id,
          ad_group.name,
          ad_group.id
        FROM click_view
        WHERE click_view.gclid = '${gclid}'
        LIMIT 1
      `;

      const apiUrl = `https://googleads.googleapis.com/v19/customers/${customerId}/googleAds:searchStream`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      const results = await response.json();

      for (const batch of (Array.isArray(results) ? results : [])) {
        for (const row of (batch.results || [])) {
          const campaignName = row.campaign?.name || null;
          const adGroupName = row.adGroup?.name || null;
          const keywordText = row.clickView?.keywordInfo?.text || null;
          const matchType = row.clickView?.keywordInfo?.matchType || null;

          if (campaignName || keywordText) {
            await prisma.callLog.update({
              where: { id: callLogId },
              data: {
                googleAdsCampaign: campaignName,
                googleAdsKeyword: keywordText,
                googleAdsMatchType: matchType,
                googleAdsAdGroup: adGroupName,
              },
            });
            console.log(
              `[GoogleAds] Resolved GCLID ${gclid}: campaign="${campaignName}", keyword="${keywordText}", matchType="${matchType}"`,
            );
            return; // Resolved successfully
          }
          break;
        }
      }
    } catch (err) {
      console.error(`[GoogleAds] GCLID resolution failed for ${gclid} on connection=${connectionId}:`, err);
    }
  }
}

// ─── Conversion Actions ─────────────────────────────────

export async function fetchConversionActions(
  connectionId: string
): Promise<Array<{ id: string; name: string; type: string }>> {
  const connection = await prisma.googleAdsConnection.findUnique({
    where: { id: connectionId },
  });
  if (!connection || !connection.isActive || !connection.googleCustomerId) {
    return [];
  }

  try {
    const accessToken = await getAccessToken(connection.refreshToken);
    const customerId = connection.googleCustomerId.replace(/-/g, '');

    const query = `
      SELECT
        conversion_action.id,
        conversion_action.name,
        conversion_action.type
      FROM conversion_action
      WHERE conversion_action.status != 'REMOVED'
    `;

    const apiUrl = `https://googleads.googleapis.com/v19/customers/${customerId}/googleAds:searchStream`;

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      throw new Error(`Google Ads API error: ${res.status}`);
    }

    const conversionActions: Array<{ id: string; name: string; type: string }> = [];
    const lines = (await res.text()).trim().split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;
      const data = JSON.parse(line);

      for (const result of data.results || []) {
        const action = result.conversionAction;
        if (action) {
          conversionActions.push({
            id: action.resourceName || action.id,
            name: action.name,
            type: action.type,
          });
        }
      }
    }

    return conversionActions;
  } catch (err) {
    console.error(`[GoogleAds] Failed to fetch conversion actions:`, err);
    throw err;
  }
}

// ─── Lead Form Submissions ──────────────────────────────

export async function syncLeadFormSubmissions(connectionId: string): Promise<void> {
  const connection = await prisma.googleAdsConnection.findUnique({
    where: { id: connectionId },
  });
  if (!connection || !connection.isActive || !connection.googleCustomerId || !connection.leadFormSyncEnabled) return;

  try {
    const accessToken = await getAccessToken(connection.refreshToken);
    const customerId = connection.googleCustomerId.replace(/-/g, '');

    // Query lead form submissions from last 7 days
    const query = `
      SELECT
        lead_form_submission_data.id,
        lead_form_submission_data.resource_name,
        lead_form_submission_data.submission_date_time,
        lead_form_submission_data.lead_form_submission_fields,
        campaign.name,
        ad_group.name
      FROM lead_form_submission_data
      WHERE segments.date DURING LAST_7_DAYS
    `;

    const apiUrl = `https://googleads.googleapis.com/v19/customers/${customerId}/googleAds:searchStream`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    const results = await response.json();

    // Look up default pipeline stage for auto-assignment
    const defaultStage = await prisma.pipelineStage.findFirst({
      where: { accountId: connection.accountId, isDefault: true },
    });

    let imported = 0;

    for (const batch of (Array.isArray(results) ? results : [])) {
      for (const row of (batch.results || [])) {
        const submission = row.leadFormSubmissionData;
        if (!submission?.resourceName) continue;

        const externalId = `gads_${submission.resourceName}`;

        // Deduplicate
        const existing = await prisma.formLead.findFirst({
          where: { externalId },
        });
        if (existing) continue;

        // Map submission fields to formData
        const formData: Record<string, string> = {};
        for (const field of (submission.leadFormSubmissionFields || [])) {
          const key = (field.fieldType || '').toLowerCase().replace(/_/g, '');
          formData[key] = field.fieldValue || '';
        }

        const campaignName = row.campaign?.name || null;
        const adGroupName = row.adGroup?.name || null;

        // Extract gclid if present in submission
        const gclid = formData.gclid || null;
        delete formData.gclid; // Remove from formData if present

        await prisma.formLead.create({
          data: {
            accountId: connection.accountId,
            formData,
            utmSource: 'Google Lead Form',
            utmCampaign: campaignName,
            gclid,
            externalId,
            pipelineStageId: defaultStage?.id || null,
          },
        });

        // Notify
        const { emitNotification } = await import('./notification');
        emitNotification(connection.accountId, 'NEW_FORM', {
          formData,
        }).catch((err) => console.error('[Notification] NEW_FORM emit failed:', err));

        imported++;
      }
    }

    if (imported > 0) {
      console.log(`[GoogleAds] Imported ${imported} lead form submissions for connection ${connectionId}`);
    }

    await prisma.googleAdsConnection.update({
      where: { id: connectionId },
      data: { lastLeadFormSyncAt: new Date() },
    });
  } catch (err: any) {
    console.error(`[GoogleAds] Lead form sync failed for ${connectionId}:`, err);
  }
}

export async function syncAllGoogleLeadForms(): Promise<void> {
  const { runBatchedSync } = await import('./syncRunner');

  const connections = await prisma.googleAdsConnection.findMany({
    where: { isActive: true, leadFormSyncEnabled: true, googleCustomerId: { not: '' } },
    select: { id: true, accountId: true, isActive: true, consecutiveFailures: true, isThrottled: true, throttledUntil: true },
  });

  // Wrap syncLeadFormSubmissions to return a number
  const syncFn = async (connId: string) => {
    await syncLeadFormSubmissions(connId);
    return 0; // Lead form sync doesn't return count easily
  };

  await runBatchedSync('google_ads', connections, syncFn);
}

// ─── Scheduler ──────────────────────────────────────────
// Uses DB-backed queue processing instead of setInterval fire-and-forget.

let syncInterval: NodeJS.Timeout | null = null;
let leadFormInterval: NodeJS.Timeout | null = null;

export function startGoogleAdsSync(): void {
  // Process queue every 5 minutes
  syncInterval = setInterval(async () => {
    try {
      const { processQueuedSyncs } = await import('./syncRunner');
      await processQueuedSyncs('google_ads', syncSpendForConnection);
    } catch (err) {
      console.error('[GoogleAds] Queue processing error:', err);
    }
  }, 5 * 60 * 1000);

  // Schedule daily spend syncs: enqueue all active connections
  // Check every hour, enqueue at staggered times in the 4am–7am UTC window
  setInterval(async () => {
    const hour = new Date().getUTCHours();
    if (hour !== 4) return; // Only enqueue once at 4am UTC

    try {
      const { enqueueSyncs, getStaggeredSyncTime } = await import('./syncRunner');
      const connections = await prisma.googleAdsConnection.findMany({
        where: { isActive: true, googleCustomerId: { not: '' }, isThrottled: false },
        select: { id: true },
      });

      const ids = connections.map((c) => c.id);
      const enqueued = await enqueueSyncs('google_ads', 'GOOGLE_ADS_SPEND', ids);
      console.log(`[GoogleAds] Enqueued ${enqueued} daily spend syncs`);
    } catch (err) {
      console.error('[GoogleAds] Daily enqueue error:', err);
    }
  }, 60 * 60 * 1000);

  console.log('[GoogleAds] Spend sync scheduler started (queue-based)');
}

export function startGoogleLeadFormSync(): void {
  leadFormInterval = setInterval(async () => {
    try {
      await syncAllGoogleLeadForms();
    } catch (err) {
      console.error('[GoogleAds] Lead form sync error:', err);
    }
  }, 15 * 60 * 1000);

  console.log('[GoogleAds] Lead form sync scheduler started (15min interval, batched)');
}
