const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      if (typeof window !== 'undefined') localStorage.setItem('leadtrack_token', token);
    } else {
      if (typeof window !== 'undefined') localStorage.removeItem('leadtrack_token');
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('leadtrack_token');
    }
    return this.token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_URL}${path}`, { ...options, headers });

    if (res.status === 401) {
      this.setToken(null);
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new Error('Unauthorized');
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed: ${res.status}`);
    }

    if (res.status === 204) return null as T;
    return res.json();
  }

  private async requestBlob(path: string): Promise<Blob> {
    const token = this.getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_URL}${path}`, { headers });

    if (res.status === 401) {
      this.setToken(null);
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new Error('Unauthorized');
    }

    if (!res.ok) {
      throw new Error(`Export failed: ${res.status}`);
    }

    return res.blob();
  }

  // Auth
  async login(email: string, password: string) {
    const data = await this.request<{
      token: string;
      user: { id: string; email: string; name: string; role: string };
      organization: { id: string; name: string };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.token);
    return data;
  }

  async register(email: string, password: string, name: string, organizationName: string) {
    const data = await this.request<{
      token: string;
      user: { id: string; email: string; name: string; role: string };
      organization: { id: string; name: string };
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, organizationName }),
    });
    this.setToken(data.token);
    return data;
  }

  async getMe() {
    return this.request<{
      user: { id: string; email: string; name: string; role: string };
      organization: { id: string; name: string };
    }>('/auth/me');
  }

  // Accounts
  async getAccounts() {
    return this.request<any[]>('/accounts');
  }

  async getAccount(id: string) {
    return this.request<any>(`/accounts/${id}`);
  }

  async createAccount(data: { name: string; businessPhone: string; timezone?: string }) {
    return this.request<any>('/accounts', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateAccount(id: string, data: any) {
    return this.request<any>(`/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  async deleteAccount(id: string) {
    return this.request<void>(`/accounts/${id}`, { method: 'DELETE' });
  }

  // Tracking Numbers
  async getTrackingNumbers(accountId: string) {
    return this.request<any[]>(`/tracking-numbers?accountId=${accountId}`);
  }

  async searchAvailableNumbers(areaCode?: string) {
    const qs = areaCode ? `?areaCode=${areaCode}` : '';
    return this.request<any[]>(`/tracking-numbers/available${qs}`);
  }

  async provisionNumber(data: {
    phoneNumber: string;
    accountId: string;
    source: string;
    medium: string;
    campaignTag?: string;
    friendlyName?: string;
  }) {
    return this.request<any>('/tracking-numbers/provision', { method: 'POST', body: JSON.stringify(data) });
  }

  // Calls
  async getCalls(accountId: string, params?: { page?: number; status?: string; source?: string }) {
    const qs = new URLSearchParams({ accountId });
    if (params?.page) qs.set('page', String(params.page));
    if (params?.status) qs.set('status', params.status);
    if (params?.source) qs.set('source', params.source);
    return this.request<{ calls: any[]; pagination: any }>(`/calls?${qs}`);
  }

  // Leads — unified inbox
  async getUnifiedLeads(accountId: string, params?: {
    page?: number;
    limit?: number;
    type?: 'call' | 'form' | 'all';
    source?: string;
    dateFrom?: string;
    dateTo?: string;
    tag?: string;
    search?: string;
    minScore?: number;
  }) {
    const qs = new URLSearchParams({ accountId });
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.type && params.type !== 'all') qs.set('type', params.type);
    if (params?.source) qs.set('source', params.source);
    if (params?.dateFrom) qs.set('dateFrom', params.dateFrom);
    if (params?.dateTo) qs.set('dateTo', params.dateTo);
    if (params?.tag) qs.set('tag', params.tag);
    if (params?.search) qs.set('search', params.search);
    if (params?.minScore) qs.set('minScore', String(params.minScore));
    return this.request<{ leads: any[]; pagination: any }>(`/leads/all?${qs}`);
  }

  // Alias for unified leads (Phase 3)
  async getLeads(accountId: string, params?: {
    page?: number;
    limit?: number;
    type?: 'call' | 'form' | 'all';
    source?: string;
    dateFrom?: string;
    dateTo?: string;
    tag?: string;
    search?: string;
    minScore?: number;
  }) {
    return this.getUnifiedLeads(accountId, params);
  }

  async getAllLeads(accountId: string) {
    return this.request<any[]>(`/leads/all?accountId=${accountId}`);
  }

  // Single form lead detail
  async getFormLead(id: string) {
    return this.request<any>(`/leads/form/${id}`);
  }

  // Tags — calls (Phase 3 endpoints)
  async addCallTag(callId: string, label: string, color?: string) {
    return this.request<any>(`/leads/call/${callId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ label, color }),
    });
  }

  async addTagToCall(callId: string, label: string, color?: string) {
    return this.addCallTag(callId, label, color);
  }

  async removeCallTag(callId: string, tagId: string) {
    return this.request<void>(`/leads/call/${callId}/tags/${tagId}`, {
      method: 'DELETE',
    });
  }

  async updateCallRevenue(callId: string, quotedValue?: number | null, salesValue?: number | null) {
    return this.request<any>(`/leads/call/${callId}/revenue`, {
      method: 'PATCH',
      body: JSON.stringify({ quotedValue, salesValue }),
    });
  }

  // Tags — form leads (Phase 3 endpoints)
  async addFormLeadTag(formLeadId: string, label: string, color?: string) {
    return this.request<any>(`/leads/form/${formLeadId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ label, color }),
    });
  }

  async addTagToForm(formLeadId: string, label: string, color?: string) {
    return this.addFormLeadTag(formLeadId, label, color);
  }

  async removeFormLeadTag(formLeadId: string, tagId: string) {
    return this.request<void>(`/leads/form/${formLeadId}/tags/${tagId}`, {
      method: 'DELETE',
    });
  }

  // Universal tag removal (requires lead type and ID)
  async removeTag(leadId: string, leadType: 'call' | 'form', tagId: string) {
    if (leadType === 'call') {
      return this.removeCallTag(leadId, tagId);
    } else {
      return this.removeFormLeadTag(leadId, tagId);
    }
  }

  // Analytics
  async getAnalyticsOverview(accountId: string, range: number = 30) {
    return this.request<{
      current: {
        calls: number;
        forms: number;
        totalLeads: number;
        missedCalls: number;
        avgDuration: number;
        totalSpend: number;
        costPerLead: number;
      };
      previous: {
        calls: number;
        forms: number;
        totalLeads: number;
        missedCalls: number;
        avgDuration: number;
      };
      range: number;
    }>(`/analytics/overview?accountId=${accountId}&range=${range}`);
  }

  async getLeadVolume(accountId: string, range: number = 30) {
    return this.request<{
      series: { date: string; calls: number; forms: number; total: number }[];
      range: number;
    }>(`/analytics/lead-volume?accountId=${accountId}&range=${range}`);
  }

  async getSourceBreakdown(accountId: string, range: number = 30) {
    return this.request<{
      sources: { source: string; calls: number; forms: number; total: number }[];
    }>(`/analytics/sources?accountId=${accountId}&range=${range}`);
  }

  async getCallOutcomes(accountId: string, range: number = 30) {
    return this.request<{
      outcomes: { status: string; count: number }[];
    }>(`/analytics/call-outcomes?accountId=${accountId}&range=${range}`);
  }

  async getCampaignPerformance(accountId: string, range: number = 30) {
    return this.request<{
      campaigns: {
        campaign: string;
        source: string;
        medium: string;
        calls: number;
        forms: number;
        totalLeads: number;
        completedCalls: number;
        missedCalls: number;
        avgDuration: number;
        qualifiedLeads: number;
        conversionRate: number;
        spend: number;
        clicks: number;
        impressions: number;
        costPerLead: number;
      }[];
    }>(`/analytics/campaigns?accountId=${accountId}&range=${range}`);
  }

  async getKeywordPerformance(accountId: string, range: number = 30) {
    return this.request<{
      keywords: Array<{
        keyword: string;
        match_type: string | null;
        campaign: string | null;
        calls: number;
        qualified: number;
        avg_duration: number;
        conv_rate: number;
      }>;
    }>(`/analytics/keywords?accountId=${accountId}&range=${range}`);
  }

  async createSpendEntry(data: {
    accountId: string;
    source: string;
    medium: string;
    campaign?: string;
    date: string;
    spend: number;
    clicks?: number;
    impressions?: number;
  }) {
    return this.request<any>('/analytics/spend', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSpendEntries(accountId: string, range: number = 30) {
    return this.request<{
      entries: any[];
    }>(`/analytics/spend?accountId=${accountId}&range=${range}`);
  }

  // Transcription
  async getCallTranscript(callId: string) {
    return this.request<{
      transcriptionStatus: string | null;
      transcriptText: string | null;
      transcriptSegments: { start: number; end: number; text: string }[] | null;
      callSummary: string | null;
      leadScore: number | null;
      leadScoreLabel: string | null;
      keywordsFound: { keyword: string; category: string; count: number; positions: number[] }[] | null;
      transcriptionError: string | null;
      transcribedAt: string | null;
    }>(`/transcription/calls/${callId}/transcript`);
  }

  async retryTranscription(callId: string) {
    return this.request<{ message: string; status: string }>(
      `/transcription/calls/${callId}/transcribe`,
      { method: 'POST' },
    );
  }

  // Keywords
  async getKeywords(accountId: string) {
    return this.request<{ id: string; keyword: string; category: string; weight: number }[]>(
      `/accounts/${accountId}/keywords`,
    );
  }

  async addKeyword(accountId: string, data: { keyword: string; category: string; weight?: number }) {
    return this.request<any>(`/accounts/${accountId}/keywords`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteKeyword(accountId: string, keywordId: string) {
    return this.request<void>(`/accounts/${accountId}/keywords/${keywordId}`, {
      method: 'DELETE',
    });
  }

  async seedDefaultKeywords(accountId: string) {
    return this.request<{ created: number }>(`/accounts/${accountId}/keywords/seed-defaults`, {
      method: 'POST',
    });
  }

  // Notification Configs
  async getNotificationConfigs(accountId: string) {
    return this.request<any[]>(`/notifications/configs?accountId=${accountId}`);
  }

  async createNotificationConfig(data: {
    accountId: string;
    channel: 'EMAIL' | 'SLACK' | 'WEBHOOK';
    target: string;
    events: string[];
  }) {
    return this.request<any>('/notifications/configs', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateNotificationConfig(id: string, data: { isActive?: boolean; events?: string[] }) {
    return this.request<any>(`/notifications/configs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteNotificationConfig(id: string) {
    return this.request<void>(`/notifications/configs/${id}`, { method: 'DELETE' });
  }

  async testNotificationConfig(id: string) {
    return this.request<{ ok: boolean }>(`/notifications/configs/${id}/test`, { method: 'POST' });
  }

  // In-app Notifications
  async getNotifications(cursor?: string, limit: number = 20) {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (cursor) qs.set('cursor', cursor);
    return this.request<{
      notifications: Array<{
        id: string;
        event: string;
        title: string;
        body: string;
        link: string | null;
        isRead: boolean;
        createdAt: string;
      }>;
      nextCursor: string | null;
    }>(`/notifications?${qs}`);
  }

  async getUnreadCount() {
    return this.request<{ count: number }>('/notifications/unread-count');
  }

  async markNotificationRead(id: string) {
    return this.request<{ ok: boolean }>(`/notifications/${id}/read`, { method: 'POST' });
  }

  async markAllNotificationsRead() {
    return this.request<{ ok: boolean }>('/notifications/read-all', { method: 'POST' });
  }

  // Google Ads (multi-connection)
  async getGoogleAdsConnectUrl(accountId: string, name?: string) {
    const params = new URLSearchParams({ accountId });
    if (name) params.set('name', name);
    return this.request<{ url: string }>(`/google-ads/connect?${params}`);
  }

  async getGoogleAdsConnections(accountId: string, params?: URLSearchParams) {
    const qs = params ? params.toString() : `accountId=${accountId}`;
    return this.request<{
      connections: Array<{
        id: string;
        name: string | null;
        googleEmail: string | null;
        googleCustomerId: string;
        isActive: boolean;
        leadFormSyncEnabled: boolean;
        lastSyncAt: string | null;
        lastSyncError: string | null;
        lastLeadFormSyncAt: string | null;
        consecutiveFailures: number;
        isThrottled: boolean;
        throttledUntil: string | null;
        nextSyncAt: string;
        syncHistory: Array<{
          id: string;
          status: string;
          error?: string;
          recordsSynced: number;
          createdAt: string;
        }>;
        conversionMappings: Array<{
          id: string;
          tagLabel: string;
          conversionActionId: string;
          conversionActionName: string;
        }>;
      }>;
      pagination?: { page: number; limit: number; total: number; totalPages: number };
    }>(`/google-ads/connections?${qs}`);
  }

  async bulkSyncGoogleAds(accountId: string, dateRangeStart?: string, dateRangeEnd?: string) {
    return this.request<{ message: string; enqueued: number }>('/google-ads/bulk-sync', {
      method: 'POST',
      body: JSON.stringify({ accountId, dateRangeStart, dateRangeEnd }),
    });
  }

  async updateGoogleAdsConnection(data: {
    connectionId: string;
    name?: string;
    googleCustomerId?: string;
    isActive?: boolean;
    leadFormSyncEnabled?: boolean;
  }) {
    return this.request<any>('/google-ads/connection', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async disconnectGoogleAds(connectionId: string) {
    return this.request<void>(`/google-ads/disconnect?connectionId=${connectionId}`, {
      method: 'DELETE',
    });
  }

  async triggerGoogleAdsSync(connectionId: string) {
    return this.request<{ message: string }>('/google-ads/sync', {
      method: 'POST',
      body: JSON.stringify({ connectionId }),
    });
  }

  async getConversionActions(connectionId: string) {
    return this.request<{
      conversionActions: Array<{ id: string; name: string; type: string }>;
    }>(`/google-ads/conversion-actions?connectionId=${connectionId}`);
  }

  async getConversionMappings(connectionId: string) {
    return this.request<{
      mappings: Array<{
        id: string;
        tagLabel: string;
        conversionActionId: string;
        conversionActionName: string;
        isActive: boolean;
      }>;
    }>(`/google-ads/conversion-mappings?connectionId=${connectionId}`);
  }

  async createConversionMapping(data: {
    connectionId: string;
    tagLabel: string;
    conversionActionId: string;
    conversionActionName: string;
  }) {
    return this.request<any>('/google-ads/conversion-mappings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteConversionMapping(id: string) {
    return this.request<void>(`/google-ads/conversion-mappings/${id}`, {
      method: 'DELETE',
    });
  }

  // Facebook Ads (multi-connection)
  async getFacebookAdsConnectUrl(accountId: string, name?: string) {
    const params = new URLSearchParams({ accountId });
    if (name) params.set('name', name);
    return this.request<{ url: string }>(`/facebook-ads/connect?${params}`);
  }

  async getFacebookAdsConnections(accountId: string, params?: URLSearchParams) {
    const qs = params ? params.toString() : `accountId=${accountId}`;
    return this.request<{
      connections: Array<{
        id: string;
        name: string | null;
        fbEmail: string | null;
        fbAdAccountId: string;
        isActive: boolean;
        lastSyncAt: string | null;
        lastSyncError: string | null;
        nextSyncAt: string;
        tokenExpiresAt: string | null;
        tokenRefreshedAt: string | null;
        consecutiveFailures: number;
        isThrottled: boolean;
        throttledUntil: string | null;
        syncHistory: Array<{
          id: string;
          status: string;
          error?: string;
          recordsSynced: number;
          createdAt: string;
        }>;
        conversionMappings: Array<{
          id: string;
          tagLabel: string;
          pixelEventName: string;
        }>;
      }>;
      pagination?: { page: number; limit: number; total: number; totalPages: number };
    }>(`/facebook-ads/connections?${qs}`);
  }

  async bulkSyncFacebookAds(accountId: string, dateRangeStart?: string, dateRangeEnd?: string) {
    return this.request<{ message: string; enqueued: number }>('/facebook-ads/bulk-sync', {
      method: 'POST',
      body: JSON.stringify({ accountId, dateRangeStart, dateRangeEnd }),
    });
  }

  async getAdConnectionsSummary(accountId: string) {
    return this.request<any>(`/ad-connections/summary?accountId=${accountId}`);
  }

  async getFacebookAdAccounts(connectionId: string) {
    return this.request<{
      adAccounts: Array<{ id: string; name: string; accountStatus: number }>;
    }>(`/facebook-ads/ad-accounts?connectionId=${connectionId}`);
  }

  async updateFacebookAdsConnection(data: {
    connectionId: string;
    name?: string;
    fbAdAccountId?: string;
    isActive?: boolean;
    fbPageId?: string;
    leadFormSyncEnabled?: boolean;
  }) {
    return this.request<any>('/facebook-ads/connection', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async disconnectFacebookAds(connectionId: string) {
    return this.request<void>(`/facebook-ads/disconnect?connectionId=${connectionId}`, {
      method: 'DELETE',
    });
  }

  async triggerFacebookAdsSync(connectionId: string) {
    return this.request<{ message: string }>('/facebook-ads/sync', {
      method: 'POST',
      body: JSON.stringify({ connectionId }),
    });
  }

  async getFacebookConversionMappings(connectionId: string) {
    return this.request<{
      mappings: Array<{
        id: string;
        tagLabel: string;
        pixelEventName: string;
        isActive: boolean;
      }>;
    }>(`/facebook-ads/conversion-mappings?connectionId=${connectionId}`);
  }

  async createFacebookConversionMapping(data: {
    connectionId: string;
    tagLabel: string;
    pixelEventName: string;
  }) {
    return this.request<any>('/facebook-ads/conversion-mappings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteFacebookConversionMapping(id: string) {
    return this.request<void>(`/facebook-ads/conversion-mappings/${id}`, {
      method: 'DELETE',
    });
  }

  // Facebook Lead Ads — Pages
  async getFacebookPages(connectionId: string) {
    return this.request<{ pages: Array<{ id: string; name: string }> }>(
      `/facebook-ads/pages?connectionId=${connectionId}`,
    );
  }

  // Pipeline
  async getPipelineStages(accountId: string) {
    return this.request<{
      stages: Array<{
        id: string;
        name: string;
        position: number;
        color: string;
        isDefault: boolean;
        isWon: boolean;
        isLost: boolean;
        leadCount: number;
      }>;
    }>(`/pipeline/stages?accountId=${accountId}`);
  }

  async seedDefaultStages(accountId: string) {
    return this.request<any>('/pipeline/stages/seed', {
      method: 'POST',
      body: JSON.stringify({ accountId }),
    });
  }

  async createPipelineStage(data: { accountId: string; name: string; color?: string; position: number }) {
    return this.request<any>('/pipeline/stages', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePipelineStage(stageId: string, data: { name?: string; color?: string; isDefault?: boolean; isWon?: boolean; isLost?: boolean }) {
    return this.request<any>(`/pipeline/stages/${stageId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deletePipelineStage(stageId: string) {
    return this.request<void>(`/pipeline/stages/${stageId}`, { method: 'DELETE' });
  }

  async reorderPipelineStages(accountId: string, stageIds: string[]) {
    return this.request<any>('/pipeline/stages/reorder', {
      method: 'POST',
      body: JSON.stringify({ accountId, stageIds }),
    });
  }

  async getPipelineLeads(accountId: string, filters?: { type?: string; source?: string; search?: string }) {
    const params = new URLSearchParams({ accountId });
    if (filters?.type) params.set('type', filters.type);
    if (filters?.source) params.set('source', filters.source);
    if (filters?.search) params.set('search', filters.search);
    return this.request<{ pipeline: Array<{ stage: any; leads: any[] }> }>(`/pipeline/leads?${params}`);
  }

  async moveLead(leadType: 'call' | 'form', leadId: string, stageId: string) {
    return this.request<{ success: boolean; fromStageId: string | null; toStageId: string }>(
      `/pipeline/leads/${leadType}/${leadId}/stage`,
      { method: 'PATCH', body: JSON.stringify({ stageId }) },
    );
  }

  async getLeadStageHistory(leadType: 'call' | 'form', leadId: string) {
    return this.request<{ history: any[] }>(`/pipeline/history/${leadType}/${leadId}`);
  }

  // Reports & Exports
  async exportCallsCsv(accountId: string, range: number = 30) {
    return this.requestBlob(`/reports/export/calls?accountId=${accountId}&range=${range}`);
  }

  async exportFormsCsv(accountId: string, range: number = 30) {
    return this.requestBlob(`/reports/export/forms?accountId=${accountId}&range=${range}`);
  }

  async exportCampaignsCsv(accountId: string, range: number = 30) {
    return this.requestBlob(`/reports/export/campaigns?accountId=${accountId}&range=${range}`);
  }

  async exportPdf(accountId: string, range: number = 30) {
    return this.requestBlob(`/reports/export/pdf?accountId=${accountId}&range=${range}`);
  }

  async getScheduledReports(accountId: string) {
    return this.request<any[]>(`/reports/schedules?accountId=${accountId}`);
  }

  async createScheduledReport(data: {
    accountId: string;
    reportType: string;
    frequency: string;
    recipients: string[];
    dayOfWeek?: number;
    dayOfMonth?: number;
    hour?: number;
  }) {
    return this.request<any>('/reports/schedules', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateScheduledReport(id: string, data: { isActive?: boolean }) {
    return this.request<any>(`/reports/schedules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteScheduledReport(id: string) {
    return this.request<void>(`/reports/schedules/${id}`, { method: 'DELETE' });
  }

  // User Management
  async getOrgMembers() {
    return this.request<{
      id: string;
      email: string;
      name: string;
      role: string;
      createdAt: string;
    }[]>('/users');
  }

  async inviteMember(email: string, role: string) {
    return this.request<any>('/users/invite', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
  }

  async updateMemberRole(userId: string, role: string) {
    return this.request<any>(`/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  }

  async removeMember(userId: string) {
    return this.request<void>(`/users/${userId}`, { method: 'DELETE' });
  }

  async getPendingInvites() {
    return this.request<{
      id: string;
      email: string;
      role: string;
      expiresAt: string;
      createdAt: string;
    }[]>('/users/invites');
  }

  async cancelInvite(inviteId: string) {
    return this.request<void>(`/users/invites/${inviteId}`, { method: 'DELETE' });
  }

  async registerWithInvite(token: string, name: string, password: string) {
    const data = await this.request<{
      token: string;
      user: { id: string; email: string; name: string; role: string };
      organization: { id: string; name: string };
    }>('/auth/register/invite', {
      method: 'POST',
      body: JSON.stringify({ token, name, password }),
    });
    this.setToken(data.token);
    return data;
  }

  logout() {
    this.setToken(null);
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }
}

export const api = new ApiClient();
