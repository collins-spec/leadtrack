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

export async function syncSpendForConnection(connectionId: string): Promise<void> {
  const connection = await prisma.googleAdsConnection.findUnique({
    where: { id: connectionId },
  });
  if (!connection || !connection.isActive || !connection.googleCustomerId) return;

  try {
    const accessToken = await getAccessToken(connection.refreshToken);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10).replace(/-/g, '');

    const query = `
      SELECT
        campaign.name,
        campaign.id,
        metrics.cost_micros,
        metrics.clicks,
        metrics.impressions,
        segments.date
      FROM campaign
      WHERE segments.date = '${dateStr}'
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

    const results = await response.json();

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
      }
    }

    await prisma.googleAdsConnection.update({
      where: { id: connectionId },
      data: { lastSyncAt: new Date(), lastSyncError: null },
    });
  } catch (err: any) {
    console.error(`[GoogleAds] Spend sync failed for ${connectionId}:`, err);
    await prisma.googleAdsConnection.update({
      where: { id: connectionId },
      data: { lastSyncError: err.message || 'Sync failed' },
    });
  }
}

export async function syncAllGoogleAdsSpend(): Promise<void> {
  const connections = await prisma.googleAdsConnection.findMany({
    where: { isActive: true },
  });
  for (const conn of connections) {
    await syncSpendForConnection(conn.id);
  }
}

// ─── Conversion Upload ──────────────────────────────────

export async function uploadOfflineConversion(
  accountId: string,
  gclid: string,
  conversionAction: string,
  conversionDateTime: Date,
  conversionValue?: number,
): Promise<void> {
  const connection = await prisma.googleAdsConnection.findUnique({
    where: { accountId },
  });
  if (!connection || !connection.isActive || !connection.googleCustomerId) return;

  try {
    const accessToken = await getAccessToken(connection.refreshToken);
    const customerId = connection.googleCustomerId.replace(/-/g, '');

    // Look up conversion action ID from mapping table
    const mapping = await prisma.conversionActionMapping.findUnique({
      where: {
        accountId_tagLabel: {
          accountId,
          tagLabel: conversionAction,
        },
      },
    });

    // Use mapped conversion action ID if available, otherwise fall back to tag name
    const conversionActionResource = mapping?.conversionActionId ||
      `customers/${customerId}/conversionActions/${conversionAction}`;

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
          conversionAction: conversionActionResource,
          conversionDateTime: conversionDateTime.toISOString().replace('T', ' ').slice(0, 19) + '+00:00',
          conversionValue: conversionValue || 1.0,
          currencyCode: 'USD',
        }],
        partialFailure: true,
      }),
    });

    console.log(`[GoogleAds] Uploaded conversion for gclid=${gclid} using action=${conversionActionResource} with value=${conversionValue || 1.0}`);
  } catch (err) {
    console.error(`[GoogleAds] Conversion upload failed for gclid=${gclid}:`, err);
  }
}

// ─── GCLID Resolution ────────────────────────────────

export async function resolveGclidAttribution(
  callLogId: string,
  gclid: string,
  accountId: string,
): Promise<void> {
  const connection = await prisma.googleAdsConnection.findUnique({
    where: { accountId },
  });
  if (!connection || !connection.isActive || !connection.googleCustomerId) return;

  try {
    const accessToken = await getAccessToken(connection.refreshToken);
    const customerId = connection.googleCustomerId.replace(/-/g, '');

    // Query click_view to resolve GCLID to keyword/campaign/ad group
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
        }
        break; // Only need first result
      }
    }
  } catch (err) {
    console.error(`[GoogleAds] GCLID resolution failed for ${gclid}:`, err);
  }
}

// ─── Conversion Actions ─────────────────────────────────

export async function fetchConversionActions(
  accountId: string
): Promise<Array<{ id: string; name: string; type: string }>> {
  const connection = await prisma.googleAdsConnection.findUnique({
    where: { accountId },
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

// ─── Scheduler ──────────────────────────────────────────

export function startGoogleAdsSync(): void {
  setInterval(async () => {
    const hour = new Date().getUTCHours();
    if (hour !== 6) return;
    try {
      await syncAllGoogleAdsSpend();
    } catch (err) {
      console.error('[GoogleAds] Daily sync error:', err);
    }
  }, 60 * 60 * 1000);

  console.log('[GoogleAds] Spend sync scheduler started');
}
