"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount } from "@/lib/account-context";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  X,
  Plus,
  Sparkles,
  Bell,
  Trash2,
  Send,
  ExternalLink,
  RefreshCw,
  FileText,
  Users,
  Mail,
  UserMinus,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { value: "high_intent", label: "High Intent", color: "bg-green-100 text-green-800" },
  { value: "booking", label: "Booking", color: "bg-blue-100 text-blue-800" },
  { value: "pricing", label: "Pricing", color: "bg-purple-100 text-purple-800" },
  { value: "general", label: "General", color: "bg-gray-100 text-gray-800" },
  { value: "negative", label: "Negative", color: "bg-orange-100 text-orange-800" },
  { value: "spam", label: "Spam", color: "bg-red-100 text-red-800" },
];

const EVENT_OPTIONS = [
  { value: "NEW_CALL", label: "New Call" },
  { value: "MISSED_CALL", label: "Missed Call" },
  { value: "NEW_FORM", label: "Form Submission" },
  { value: "HIGH_VALUE_LEAD", label: "High-Value Lead" },
  { value: "DAILY_DIGEST", label: "Daily Digest" },
];

const REPORT_TYPES = [
  { value: "FULL_SUMMARY", label: "Full Summary" },
  { value: "CALLS_ONLY", label: "Calls Only" },
  { value: "FORMS_ONLY", label: "Forms Only" },
  { value: "CAMPAIGN_PERFORMANCE", label: "Campaign Performance" },
];

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const FB_EVENT_OPTIONS = ["Lead", "Purchase", "CompleteRegistration", "Schedule", "Contact", "SubmitApplication"];

const categoryColors: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.color]),
);

const ROLE_COLORS: Record<string, string> = {
  OWNER: "bg-amber-100 text-amber-800",
  ADMIN: "bg-blue-100 text-blue-800",
  MEMBER: "bg-gray-100 text-gray-800",
};

interface Keyword {
  id: string;
  keyword: string;
  category: string;
  weight: number;
}

// ─── Relative time helper ──────────────────────────────
function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Sync History Component ────────────────────────────
function SyncHistory({ logs }: { logs: Array<{ id: string; status: string; error?: string; recordsSynced: number; createdAt: string }> }) {
  if (logs.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Recent Syncs</p>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {logs.map((log) => (
          <div key={log.id} className="flex items-center gap-2 text-xs rounded border p-1.5">
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 shrink-0", log.status === "SUCCESS" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200")}>{log.status}</Badge>
            <span className="text-muted-foreground">{new Date(log.createdAt).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            {log.status === "SUCCESS" && log.recordsSynced > 0 && <span className="text-muted-foreground">({log.recordsSynced} records)</span>}
            {log.error && <span className="text-red-600 truncate flex-1 text-[10px]">{log.error}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { currentAccount, refreshAccounts } = useAccount();
  const { user, isAdmin } = useAuth();
  const [form, setForm] = useState({ name: "", businessPhone: "", timezone: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Keyword state
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [addingKeyword, setAddingKeyword] = useState(false);
  const [seedingDefaults, setSeedingDefaults] = useState(false);

  // Notification state
  const [notifConfigs, setNotifConfigs] = useState<any[]>([]);
  const [newChannel, setNewChannel] = useState<string>("EMAIL");
  const [newTarget, setNewTarget] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>(["NEW_CALL", "MISSED_CALL", "NEW_FORM", "HIGH_VALUE_LEAD"]);
  const [addingConfig, setAddingConfig] = useState(false);

  // Google Ads state (multi-connection)
  const [gadsConnections, setGadsConnections] = useState<any[]>([]);
  const [gadsPagination, setGadsPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [gadsSearch, setGadsSearch] = useState("");
  const [gadsStatusFilter, setGadsStatusFilter] = useState("");
  const [gadsCustomerIds, setGadsCustomerIds] = useState<Record<string, string>>({});
  const [gadsSyncingId, setGadsSyncingId] = useState<string | null>(null);
  const [gadsActionsMap, setGadsActionsMap] = useState<Record<string, Array<{ id: string; name: string; type: string }>>>({});
  const [gadsFetchingId, setGadsFetchingId] = useState<string | null>(null);
  const [gadsSavingMapping, setGadsSavingMapping] = useState(false);
  const [gadsSelectedMappings, setGadsSelectedMappings] = useState<Record<string, Record<string, string>>>({});
  const [gadsBulkSyncing, setGadsBulkSyncing] = useState(false);

  // Facebook Ads state (multi-connection)
  const [fbConnections, setFbConnections] = useState<any[]>([]);
  const [fbPagination, setFbPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [fbSearch, setFbSearch] = useState("");
  const [fbStatusFilter, setFbStatusFilter] = useState("");
  const [fbAdAccountIds, setFbAdAccountIds] = useState<Record<string, string>>({});
  const [fbSyncingId, setFbSyncingId] = useState<string | null>(null);
  const [fbAdAccountsMap, setFbAdAccountsMap] = useState<Record<string, Array<{ id: string; name: string; accountStatus: number }>>>({});
  const [fbFetchingId, setFbFetchingId] = useState<string | null>(null);
  const [fbSavingMapping, setFbSavingMapping] = useState(false);
  const [fbSelectedMappings, setFbSelectedMappings] = useState<Record<string, Record<string, string>>>({});
  const [fbPagesMap, setFbPagesMap] = useState<Record<string, Array<{ id: string; name: string }>>>({});
  const [fbFetchingPagesId, setFbFetchingPagesId] = useState<string | null>(null);
  const [fbBulkSyncing, setFbBulkSyncing] = useState(false);

  // Unified ad connections overview
  const [adSummary, setAdSummary] = useState<any>(null);

  // Pipeline state
  const [pipelineStages, setPipelineStages] = useState<any[]>([]);
  const [editingStage, setEditingStage] = useState<string | null>(null);
  const [newStageName, setNewStageName] = useState("");

  // Scheduled Reports state
  const [schedules, setSchedules] = useState<any[]>([]);
  const [newReportType, setNewReportType] = useState("FULL_SUMMARY");
  const [newFrequency, setNewFrequency] = useState("WEEKLY");
  const [newDayOfWeek, setNewDayOfWeek] = useState(1);
  const [newDayOfMonth, setNewDayOfMonth] = useState(1);
  const [newRecipients, setNewRecipients] = useState("");
  const [addingSchedule, setAddingSchedule] = useState(false);

  // Team state
  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [inviting, setInviting] = useState(false);

  // ─── Load data ────────────────────────────────────────

  const loadKeywords = useCallback(async () => {
    if (!currentAccount) return;
    try { setKeywords(await api.getKeywords(currentAccount.id)); } catch { /* */ }
  }, [currentAccount]);

  const loadNotifConfigs = useCallback(async () => {
    if (!currentAccount) return;
    try { setNotifConfigs(await api.getNotificationConfigs(currentAccount.id)); } catch { /* */ }
  }, [currentAccount]);

  const loadGoogleAdsConnections = useCallback(async (page = gadsPagination.page) => {
    if (!currentAccount) return;
    try {
      const params = new URLSearchParams({ accountId: currentAccount.id, page: String(page), limit: "25" });
      if (gadsSearch) params.set("search", gadsSearch);
      if (gadsStatusFilter) params.set("status", gadsStatusFilter);
      const data = await api.getGoogleAdsConnections(currentAccount.id, params);
      setGadsConnections(data.connections);
      if (data.pagination) setGadsPagination(data.pagination);
      const ids: Record<string, string> = {};
      data.connections.forEach((c: any) => { if (c.googleCustomerId) ids[c.id] = c.googleCustomerId; });
      setGadsCustomerIds(ids);
    } catch { /* */ }
  }, [currentAccount, gadsSearch, gadsStatusFilter, gadsPagination.page]);

  const loadFacebookAdsConnections = useCallback(async (page = fbPagination.page) => {
    if (!currentAccount) return;
    try {
      const params = new URLSearchParams({ accountId: currentAccount.id, page: String(page), limit: "25" });
      if (fbSearch) params.set("search", fbSearch);
      if (fbStatusFilter) params.set("status", fbStatusFilter);
      const data = await api.getFacebookAdsConnections(currentAccount.id, params);
      setFbConnections(data.connections);
      if (data.pagination) setFbPagination(data.pagination);
      const ids: Record<string, string> = {};
      data.connections.forEach((c: any) => { if (c.fbAdAccountId) ids[c.id] = c.fbAdAccountId; });
      setFbAdAccountIds(ids);
    } catch { /* */ }
  }, [currentAccount, fbSearch, fbStatusFilter, fbPagination.page]);

  const loadAdSummary = useCallback(async () => {
    if (!currentAccount) return;
    try { setAdSummary(await api.getAdConnectionsSummary(currentAccount.id)); } catch { /* */ }
  }, [currentAccount]);

  const loadSchedules = useCallback(async () => {
    if (!currentAccount) return;
    try { setSchedules(await api.getScheduledReports(currentAccount.id)); } catch { /* */ }
  }, [currentAccount]);

  const loadTeam = useCallback(async () => {
    try {
      setMembers(await api.getOrgMembers());
      if (isAdmin) setInvites(await api.getPendingInvites());
    } catch { /* */ }
  }, [isAdmin]);

  const loadPipelineStages = useCallback(async () => {
    if (!currentAccount) return;
    try {
      const data = await api.getPipelineStages(currentAccount.id);
      setPipelineStages(data.stages || []);
    } catch { /* */ }
  }, [currentAccount]);

  useEffect(() => {
    if (currentAccount) {
      setForm({ name: currentAccount.name, businessPhone: currentAccount.businessPhone, timezone: currentAccount.timezone });
      loadKeywords();
      loadNotifConfigs();
      loadGoogleAdsConnections();
      loadFacebookAdsConnections();
      loadAdSummary();
      loadSchedules();
      loadTeam();
      loadPipelineStages();
    }
  }, [currentAccount, loadKeywords, loadNotifConfigs, loadGoogleAdsConnections, loadFacebookAdsConnections, loadAdSummary, loadSchedules, loadTeam, loadPipelineStages]);

  // ─── Business Handlers ──────────────────────────────

  const handleSave = async () => {
    if (!currentAccount) return;
    setSaving(true); setSaved(false);
    try {
      await api.updateAccount(currentAccount.id, form);
      await refreshAccounts();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) { alert(err.message || "Failed to save"); }
    finally { setSaving(false); }
  };

  // ─── Keyword Handlers ───────────────────────────────

  const handleAddKeyword = async () => {
    if (!currentAccount || !newKeyword.trim()) return;
    setAddingKeyword(true);
    try {
      await api.addKeyword(currentAccount.id, { keyword: newKeyword.trim(), category: newCategory, weight: 3 });
      setNewKeyword(""); await loadKeywords();
    } catch (err: any) { alert(err.message || "Failed to add keyword"); }
    finally { setAddingKeyword(false); }
  };

  const handleDeleteKeyword = async (id: string) => {
    if (!currentAccount) return;
    try { await api.deleteKeyword(currentAccount.id, id); setKeywords((p) => p.filter((k) => k.id !== id)); } catch { /* */ }
  };

  const handleSeedDefaults = async () => {
    if (!currentAccount) return;
    setSeedingDefaults(true);
    try { const r = await api.seedDefaultKeywords(currentAccount.id); if (r.created > 0) await loadKeywords(); }
    catch (err: any) { alert(err.message || "Failed to seed defaults"); }
    finally { setSeedingDefaults(false); }
  };

  // ─── Notification Handlers ──────────────────────────

  const handleAddConfig = async () => {
    if (!currentAccount || !newTarget.trim()) return;
    setAddingConfig(true);
    try {
      await api.createNotificationConfig({ accountId: currentAccount.id, channel: newChannel as "EMAIL" | "SLACK" | "WEBHOOK", target: newTarget.trim(), events: newEvents });
      setNewTarget(""); await loadNotifConfigs();
    } catch (err: any) { alert(err.message || "Failed to add config"); }
    finally { setAddingConfig(false); }
  };

  const handleToggleConfig = async (id: string, active: boolean) => {
    try { await api.updateNotificationConfig(id, { isActive: !active }); setNotifConfigs((p) => p.map((c) => c.id === id ? { ...c, isActive: !active } : c)); } catch { /* */ }
  };

  const handleDeleteConfig = async (id: string) => {
    try { await api.deleteNotificationConfig(id); setNotifConfigs((p) => p.filter((c) => c.id !== id)); } catch { /* */ }
  };

  const handleTestConfig = async (id: string) => {
    try { await api.testNotificationConfig(id); alert("Test notification sent!"); }
    catch (err: any) { alert(err.message || "Test failed"); }
  };

  const toggleEvent = (event: string) => {
    setNewEvents((p) => p.includes(event) ? p.filter((e) => e !== event) : [...p, event]);
  };

  // ─── Bulk Sync Handlers ─────────────────────────────

  const handleGadsBulkSync = async () => {
    if (!currentAccount) return;
    setGadsBulkSyncing(true);
    try {
      await api.bulkSyncGoogleAds(currentAccount.id);
      setTimeout(() => { loadGoogleAdsConnections(); loadAdSummary(); setGadsBulkSyncing(false); }, 3000);
    } catch (err: any) { alert(err.message || "Bulk sync failed"); setGadsBulkSyncing(false); }
  };

  const handleFbBulkSync = async () => {
    if (!currentAccount) return;
    setFbBulkSyncing(true);
    try {
      await api.bulkSyncFacebookAds(currentAccount.id);
      setTimeout(() => { loadFacebookAdsConnections(); loadAdSummary(); setFbBulkSyncing(false); }, 3000);
    } catch (err: any) { alert(err.message || "Bulk sync failed"); setFbBulkSyncing(false); }
  };

  // ─── Google Ads Handlers (multi-connection) ─────────

  const handleConnectGoogleAds = async () => {
    if (!currentAccount) return;
    try { const { url } = await api.getGoogleAdsConnectUrl(currentAccount.id); window.location.href = url; }
    catch (err: any) { alert(err.message || "Failed"); }
  };

  const handleSaveGadsCustomerId = async (connectionId: string) => {
    try {
      await api.updateGoogleAdsConnection({ connectionId, googleCustomerId: gadsCustomerIds[connectionId] || "" });
      await loadGoogleAdsConnections();
    } catch (err: any) { alert(err.message || "Failed to save"); }
  };

  const handleGadsSync = async (connectionId: string) => {
    setGadsSyncingId(connectionId);
    try {
      await api.triggerGoogleAdsSync(connectionId);
      setTimeout(() => { loadGoogleAdsConnections(); setGadsSyncingId(null); }, 3000);
    } catch (err: any) { alert(err.message || "Sync failed"); setGadsSyncingId(null); }
  };

  const handleDisconnectGoogleAds = async (connectionId: string) => {
    if (!confirm("Disconnect this Google Ads account?")) return;
    try { await api.disconnectGoogleAds(connectionId); await loadGoogleAdsConnections(); }
    catch (err: any) { alert(err.message || "Failed"); }
  };

  const handleFetchGadsActions = async (connectionId: string) => {
    setGadsFetchingId(connectionId);
    try {
      const { conversionActions } = await api.getConversionActions(connectionId);
      setGadsActionsMap((prev) => ({ ...prev, [connectionId]: conversionActions }));
    } catch (err: any) { alert(err.message || "Failed to fetch"); }
    finally { setGadsFetchingId(null); }
  };

  const handleSaveGadsMapping = async (connectionId: string, tagLabel: string) => {
    const selected = gadsSelectedMappings[connectionId]?.[tagLabel];
    if (!selected) return;
    setGadsSavingMapping(true);
    try {
      const actions = gadsActionsMap[connectionId] || [];
      const action = actions.find((a) => a.id === selected);
      if (!action) return;
      await api.createConversionMapping({ connectionId, tagLabel, conversionActionId: action.id, conversionActionName: action.name });
      await loadGoogleAdsConnections();
      setGadsSelectedMappings((prev) => ({ ...prev, [connectionId]: { ...prev[connectionId], [tagLabel]: "" } }));
    } catch (err: any) { alert(err.message || "Failed"); }
    finally { setGadsSavingMapping(false); }
  };

  const handleDeleteGadsMapping = async (id: string) => {
    try { await api.deleteConversionMapping(id); await loadGoogleAdsConnections(); }
    catch (err: any) { alert(err.message || "Failed"); }
  };

  // ─── Facebook Ads Handlers (multi-connection) ───────

  const handleConnectFacebookAds = async () => {
    if (!currentAccount) return;
    try { const { url } = await api.getFacebookAdsConnectUrl(currentAccount.id); window.location.href = url; }
    catch (err: any) { alert(err.message || "Failed"); }
  };

  const handleFetchFbAdAccounts = async (connectionId: string) => {
    setFbFetchingId(connectionId);
    try {
      const { adAccounts } = await api.getFacebookAdAccounts(connectionId);
      setFbAdAccountsMap((prev) => ({ ...prev, [connectionId]: adAccounts }));
    } catch (err: any) { alert(err.message || "Failed to fetch ad accounts"); }
    finally { setFbFetchingId(null); }
  };

  const handleFetchFbPages = async (connectionId: string) => {
    setFbFetchingPagesId(connectionId);
    try {
      const { pages } = await api.getFacebookPages(connectionId);
      setFbPagesMap((prev) => ({ ...prev, [connectionId]: pages }));
    } catch (err: any) { alert(err.message || "Failed to fetch pages"); }
    finally { setFbFetchingPagesId(null); }
  };

  const handleSaveFbAdAccountId = async (connectionId: string) => {
    try {
      await api.updateFacebookAdsConnection({ connectionId, fbAdAccountId: fbAdAccountIds[connectionId] || "" });
      await loadFacebookAdsConnections();
    } catch (err: any) { alert(err.message || "Failed to save"); }
  };

  const handleFbSync = async (connectionId: string) => {
    setFbSyncingId(connectionId);
    try {
      await api.triggerFacebookAdsSync(connectionId);
      setTimeout(() => { loadFacebookAdsConnections(); setFbSyncingId(null); }, 3000);
    } catch (err: any) { alert(err.message || "Sync failed"); setFbSyncingId(null); }
  };

  const handleDisconnectFacebookAds = async (connectionId: string) => {
    if (!confirm("Disconnect this Facebook Ads account?")) return;
    try { await api.disconnectFacebookAds(connectionId); await loadFacebookAdsConnections(); }
    catch (err: any) { alert(err.message || "Failed"); }
  };

  const handleSaveFbMapping = async (connectionId: string, tagLabel: string) => {
    const selected = fbSelectedMappings[connectionId]?.[tagLabel];
    if (!selected) return;
    setFbSavingMapping(true);
    try {
      await api.createFacebookConversionMapping({ connectionId, tagLabel, pixelEventName: selected });
      await loadFacebookAdsConnections();
      setFbSelectedMappings((prev) => ({ ...prev, [connectionId]: { ...prev[connectionId], [tagLabel]: "" } }));
    } catch (err: any) { alert(err.message || "Failed"); }
    finally { setFbSavingMapping(false); }
  };

  const handleDeleteFbMapping = async (id: string) => {
    try { await api.deleteFacebookConversionMapping(id); await loadFacebookAdsConnections(); }
    catch (err: any) { alert(err.message || "Failed"); }
  };

  // ─── Schedule Handlers ──────────────────────────────

  const handleAddSchedule = async () => {
    if (!currentAccount || !newRecipients.trim()) return;
    setAddingSchedule(true);
    try {
      const recipients = newRecipients.split(",").map((e) => e.trim()).filter(Boolean);
      await api.createScheduledReport({
        accountId: currentAccount.id, reportType: newReportType, frequency: newFrequency, recipients,
        ...(newFrequency === "WEEKLY" ? { dayOfWeek: newDayOfWeek } : { dayOfMonth: newDayOfMonth }), hour: 8,
      });
      setNewRecipients(""); await loadSchedules();
    } catch (err: any) { alert(err.message || "Failed"); }
    finally { setAddingSchedule(false); }
  };

  const handleToggleSchedule = async (id: string, active: boolean) => {
    try { await api.updateScheduledReport(id, { isActive: !active }); setSchedules((p) => p.map((s) => s.id === id ? { ...s, isActive: !active } : s)); } catch { /* */ }
  };

  const handleDeleteSchedule = async (id: string) => {
    try { await api.deleteScheduledReport(id); setSchedules((p) => p.filter((s) => s.id !== id)); } catch { /* */ }
  };

  // ─── Team Handlers ──────────────────────────────────

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try { await api.inviteMember(inviteEmail.trim(), inviteRole); setInviteEmail(""); await loadTeam(); }
    catch (err: any) { alert(err.message || "Failed"); }
    finally { setInviting(false); }
  };

  const handleChangeRole = async (userId: string, role: string) => {
    try { await api.updateMemberRole(userId, role); setMembers((p) => p.map((m) => m.id === userId ? { ...m, role } : m)); }
    catch (err: any) { alert(err.message || "Failed"); }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm("Remove this team member?")) return;
    try { await api.removeMember(userId); setMembers((p) => p.filter((m) => m.id !== userId)); }
    catch (err: any) { alert(err.message || "Failed"); }
  };

  const handleCancelInvite = async (inviteId: string) => {
    try { await api.cancelInvite(inviteId); setInvites((p) => p.filter((i) => i.id !== inviteId)); } catch { /* */ }
  };

  const [activeSection, setActiveSection] = useState<string>("business");

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (!currentAccount) {
    return <div className="text-muted-foreground">Select an account.</div>;
  }

  const groupedKeywords = CATEGORIES.map((cat) => ({
    ...cat,
    keywords: keywords.filter((k) => k.category === cat.value),
  })).filter((g) => g.keywords.length > 0);

  const sections = [
    { id: "business", label: "Business" },
    { id: "pipeline", label: "Pipeline" },
    ...(isAdmin ? [
      { id: "google-ads", label: "Google Ads" },
      { id: "facebook-ads", label: "Facebook Ads" },
    ] : []),
    { id: "keywords", label: "Keywords" },
    { id: "notifications", label: "Notifications" },
    { id: "reports", label: "Reports" },
    ...(isAdmin ? [{ id: "team", label: "Team" }] : []),
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Account Settings</h1>
        <p className="text-muted-foreground">Manage {currentAccount.name}</p>
      </div>

      {/* Section Navigation */}
      <nav className="flex flex-wrap gap-1 rounded-lg border bg-background p-1 sticky top-0 z-10">
        {sections.map((s) => (
          <button key={s.id} onClick={() => scrollToSection(s.id)} className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors", activeSection === s.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{s.label}</button>
        ))}
      </nav>

      {/* Business Details */}
      <Card id="settings-business">
        <CardHeader>
          <CardTitle>Business Details</CardTitle>
          <CardDescription>Update your client&apos;s business information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Business Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Forwarding Phone Number</Label>
            <Input value={form.businessPhone} onChange={(e) => setForm({ ...form, businessPhone: e.target.value })} placeholder="+15551234567" />
            <p className="text-xs text-muted-foreground">Calls to tracking numbers will be forwarded here.</p>
          </div>
          <div className="space-y-2">
            <Label>Timezone</Label>
            <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="America/New_York" />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
            {saved && <span className="text-sm text-green-600">Saved!</span>}
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Stages */}
      <Card id="settings-pipeline">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Pipeline Stages</CardTitle>
              <CardDescription>Configure the stages leads move through in your pipeline.</CardDescription>
            </div>
            {pipelineStages.length === 0 && (
              <Button size="sm" onClick={async () => {
                if (!currentAccount) return;
                try { await api.seedDefaultStages(currentAccount.id); await loadPipelineStages(); } catch (err: any) { alert(err.message || "Failed"); }
              }}>
                <Sparkles className="w-4 h-4 mr-1" /> Seed Defaults
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {pipelineStages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pipeline stages configured. Click &quot;Seed Defaults&quot; to create the standard pipeline (New, Contacted, Qualified, Booked, Won, Lost).</p>
          ) : (
            <>
              {pipelineStages.map((stage, idx) => (
                <div key={stage.id} className="flex items-center gap-3 p-3 border rounded-lg">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                  {editingStage === stage.id ? (
                    <Input
                      className="flex-1 h-8"
                      defaultValue={stage.name}
                      autoFocus
                      onBlur={async (e) => {
                        if (e.target.value && e.target.value !== stage.name) {
                          await api.updatePipelineStage(stage.id, { name: e.target.value });
                          await loadPipelineStages();
                        }
                        setEditingStage(null);
                      }}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          const target = e.target as HTMLInputElement;
                          if (target.value && target.value !== stage.name) {
                            await api.updatePipelineStage(stage.id, { name: target.value });
                            await loadPipelineStages();
                          }
                          setEditingStage(null);
                        }
                      }}
                    />
                  ) : (
                    <span className="flex-1 text-sm font-medium cursor-pointer" onClick={() => setEditingStage(stage.id)}>{stage.name}</span>
                  )}
                  <div className="flex items-center gap-1.5">
                    {stage.isDefault && <Badge variant="outline" className="text-xs">Default</Badge>}
                    {stage.isWon && <Badge variant="outline" className="text-xs text-green-600 border-green-300">Won</Badge>}
                    {stage.isLost && <Badge variant="outline" className="text-xs text-red-500 border-red-300">Lost</Badge>}
                    <span className="text-xs text-muted-foreground">{stage.leadCount} leads</span>
                    {!stage.isDefault && (
                      <button className="text-muted-foreground hover:text-red-500 ml-1" onClick={async () => {
                        if (!confirm(`Delete "${stage.name}"? Leads will move to the default stage.`)) return;
                        try { await api.deletePipelineStage(stage.id); await loadPipelineStages(); } catch (err: any) { alert(err.message || "Failed"); }
                      }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2 mt-2">
                <Input placeholder="New stage name..." value={newStageName} onChange={(e) => setNewStageName(e.target.value)} className="flex-1 h-8" />
                <Button size="sm" variant="outline" disabled={!newStageName.trim()} onClick={async () => {
                  if (!currentAccount || !newStageName.trim()) return;
                  try {
                    await api.createPipelineStage({ accountId: currentAccount.id, name: newStageName.trim(), position: pipelineStages.length });
                    setNewStageName("");
                    await loadPipelineStages();
                  } catch (err: any) { alert(err.message || "Failed"); }
                }}>
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Ad Connections Overview Card */}
      {isAdmin && adSummary && (
        <Card id="settings-ad-overview">
          <CardContent className="py-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <span className="font-medium">{adSummary.google?.total || 0}</span>
                  <span className="text-muted-foreground ml-1">Google Ads</span>
                  <span className="text-xs ml-1">
                    (<span className="text-green-600">{adSummary.google?.active || 0} active</span>
                    {(adSummary.google?.failing || 0) > 0 && <>, <span className="text-red-600">{adSummary.google.failing} failing</span></>})
                  </span>
                </div>
                <div className="border-l pl-6">
                  <span className="font-medium">{adSummary.facebook?.total || 0}</span>
                  <span className="text-muted-foreground ml-1">Facebook Ads</span>
                  <span className="text-xs ml-1">
                    (<span className="text-green-600">{adSummary.facebook?.active || 0} active</span>
                    {(adSummary.facebook?.failing || 0) > 0 && <>, <span className="text-red-600">{adSummary.facebook.failing} failing</span></>}
                    {(adSummary.facebook?.expiring || 0) > 0 && <>, <span className="text-amber-600">{adSummary.facebook.expiring} token expiring</span></>})
                  </span>
                </div>
              </div>
              {adSummary.combined?.yesterdaySpend > 0 && (
                <div className="text-sm text-muted-foreground">
                  Yesterday: <span className="font-medium text-foreground">${adSummary.combined.yesterdaySpend.toFixed(2)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Google Ads Integration (Multi-Connection) */}
      {isAdmin && (
        <Card id="settings-google-ads">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><ExternalLink className="h-5 w-5 text-blue-600" />Google Ads</CardTitle>
                <CardDescription>Connect one or more Google Ads accounts to sync spend and upload conversions.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {gadsConnections.length > 0 && (
                  <Button size="sm" variant="outline" onClick={handleGadsBulkSync} disabled={gadsBulkSyncing}>
                    <RefreshCw className={`h-3 w-3 mr-1 ${gadsBulkSyncing ? "animate-spin" : ""}`} />{gadsBulkSyncing ? "Syncing All..." : "Sync All"}
                  </Button>
                )}
                <Button size="sm" onClick={handleConnectGoogleAds}><Plus className="h-4 w-4 mr-1" />Add Account</Button>
              </div>
            </div>
            {/* Search & Filter */}
            {gadsPagination.total > 10 && (
              <div className="flex gap-2 mt-3">
                <Input placeholder="Search by name or email..." value={gadsSearch} onChange={(e) => { setGadsSearch(e.target.value); loadGoogleAdsConnections(1); }} className="h-8 text-xs flex-1" />
                <select value={gadsStatusFilter} onChange={(e) => { setGadsStatusFilter(e.target.value); loadGoogleAdsConnections(1); }} className="h-8 text-xs border rounded px-2">
                  <option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="failing">Failing</option>
                </select>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {gadsConnections.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No Google Ads accounts connected. Click &quot;Add Account&quot; to get started.</p>
            ) : (
              gadsConnections.map((conn) => (
                <div key={conn.id} className="rounded-lg border p-4 space-y-4">
                  {/* Connection Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {conn.googleEmail && <span className="text-sm">{conn.googleEmail}</span>}
                      {conn.name && <Badge variant="outline" className="text-xs">{conn.name}</Badge>}
                      {conn.isThrottled ? (
                        <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">Throttled</Badge>
                      ) : conn.consecutiveFailures >= 3 ? (
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">Failing ({conn.consecutiveFailures}x)</Badge>
                      ) : conn.isActive ? (
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Healthy</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-gray-50 text-gray-500 border-gray-200">Inactive</Badge>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleDisconnectGoogleAds(conn.id)} className="text-red-500 hover:text-red-700 text-xs">Disconnect</Button>
                  </div>

                  {/* Customer ID */}
                  <div className="flex gap-2">
                    <Input value={gadsCustomerIds[conn.id] || ""} onChange={(e) => setGadsCustomerIds((p) => ({ ...p, [conn.id]: e.target.value }))} placeholder="xxx-xxx-xxxx" className="flex-1" />
                    <Button size="sm" onClick={() => handleSaveGadsCustomerId(conn.id)}>Save</Button>
                  </div>

                  {/* Conversion Mappings */}
                  {conn.googleCustomerId && (
                    <div className="space-y-2 pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium">Conversion Mappings</p>
                        <Button variant="outline" size="sm" onClick={() => handleFetchGadsActions(conn.id)} disabled={gadsFetchingId === conn.id} className="h-7 text-xs">
                          <RefreshCw className={`h-3 w-3 mr-1 ${gadsFetchingId === conn.id ? "animate-spin" : ""}`} />
                          {gadsFetchingId === conn.id ? "Loading..." : "Fetch Actions"}
                        </Button>
                      </div>
                      {(conn.conversionMappings || []).map((m: any) => (
                        <div key={m.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                          <Badge variant="outline" className="shrink-0">{m.tagLabel}</Badge>
                          <span className="text-xs text-muted-foreground truncate flex-1">{m.conversionActionName}</span>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteGadsMapping(m.id)} className="h-6 w-6 p-0 text-red-500"><X className="h-3.5 w-3.5" /></Button>
                        </div>
                      ))}
                      {(gadsActionsMap[conn.id] || []).length > 0 && (
                        <div className="space-y-2 rounded border p-2 bg-muted/30">
                          {["Qualified", "Booked", "Customer"].map((tag) => {
                            if ((conn.conversionMappings || []).find((m: any) => m.tagLabel === tag)) return null;
                            return (
                              <div key={tag} className="flex items-center gap-2">
                                <Badge variant="outline" className="w-24 shrink-0 justify-center text-xs">{tag}</Badge>
                                <Select value={gadsSelectedMappings[conn.id]?.[tag] || ""} onValueChange={(v) => setGadsSelectedMappings((prev) => ({ ...prev, [conn.id]: { ...prev[conn.id], [tag]: v || "" } }))}>
                                  <SelectTrigger className="flex-1 h-7 text-xs"><span className="truncate">{gadsSelectedMappings[conn.id]?.[tag] ? gadsActionsMap[conn.id]?.find((a) => a.id === gadsSelectedMappings[conn.id]?.[tag])?.name : "Select..."}</span></SelectTrigger>
                                  <SelectContent>{(gadsActionsMap[conn.id] || []).map((a) => (<SelectItem key={a.id} value={a.id} className="text-xs">{a.name}</SelectItem>))}</SelectContent>
                                </Select>
                                <Button size="sm" variant="outline" onClick={() => handleSaveGadsMapping(conn.id, tag)} disabled={!gadsSelectedMappings[conn.id]?.[tag] || gadsSavingMapping} className="h-7 px-2 text-xs">Save</Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Lead Form Sync */}
                  {conn.googleCustomerId && (
                    <div className="space-y-2 pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium">Lead Form Sync</p>
                          <p className="text-[10px] text-muted-foreground">Auto-import leads from Google Ads Lead Form Extensions (polls every 15 min)</p>
                        </div>
                        <button
                          onClick={async () => {
                            try {
                              await api.updateGoogleAdsConnection({ connectionId: conn.id, leadFormSyncEnabled: !conn.leadFormSyncEnabled });
                              await loadGoogleAdsConnections();
                            } catch (err: any) { alert(err.message || "Failed"); }
                          }}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${conn.leadFormSyncEnabled ? "bg-green-500" : "bg-gray-300"}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${conn.leadFormSyncEnabled ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
                        </button>
                      </div>
                      {conn.leadFormSyncEnabled && conn.lastLeadFormSyncAt && (
                        <p className="text-[10px] text-muted-foreground">Last synced: {relativeTime(conn.lastLeadFormSyncAt)}</p>
                      )}
                    </div>
                  )}

                  {/* Sync Status */}
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs">
                        {conn.lastSyncAt && <><span className="text-muted-foreground">Synced:</span><span>{relativeTime(conn.lastSyncAt)}</span>{!conn.lastSyncError && <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px] px-1.5 py-0">OK</Badge>}</>}
                      </div>
                      <Button variant="outline" size="sm" onClick={() => handleGadsSync(conn.id)} disabled={gadsSyncingId === conn.id} className="h-7 text-xs">
                        <RefreshCw className={`h-3 w-3 mr-1 ${gadsSyncingId === conn.id ? "animate-spin" : ""}`} />{gadsSyncingId === conn.id ? "Syncing..." : "Sync"}
                      </Button>
                    </div>
                    {conn.lastSyncError && <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-600">{conn.lastSyncError}</div>}
                    <SyncHistory logs={conn.syncHistory || []} />
                  </div>
                </div>
              ))
            )}
            {/* Pagination */}
            {gadsPagination.totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">Page {gadsPagination.page} of {gadsPagination.totalPages} ({gadsPagination.total} connections)</p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={gadsPagination.page <= 1} onClick={() => loadGoogleAdsConnections(gadsPagination.page - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={gadsPagination.page >= gadsPagination.totalPages} onClick={() => loadGoogleAdsConnections(gadsPagination.page + 1)}>Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Facebook Ads Integration (Multi-Connection) */}
      {isAdmin && (
        <Card id="settings-facebook-ads">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><ExternalLink className="h-5 w-5 text-indigo-600" />Facebook Ads</CardTitle>
                <CardDescription>Connect Facebook/Meta Ads accounts to sync spend and upload conversions.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {fbConnections.length > 0 && (
                  <Button size="sm" variant="outline" onClick={handleFbBulkSync} disabled={fbBulkSyncing}>
                    <RefreshCw className={`h-3 w-3 mr-1 ${fbBulkSyncing ? "animate-spin" : ""}`} />{fbBulkSyncing ? "Syncing All..." : "Sync All"}
                  </Button>
                )}
                <Button size="sm" onClick={handleConnectFacebookAds}><Plus className="h-4 w-4 mr-1" />Add Account</Button>
              </div>
            </div>
            {/* Token Expiry Warning Banner */}
            {fbConnections.some((c: any) => c.tokenExpiresAt && new Date(c.tokenExpiresAt) < new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) && new Date(c.tokenExpiresAt) > new Date()) && (
              <div className="rounded border border-amber-200 bg-amber-50 p-3 flex items-center gap-2">
                <Bell className="h-4 w-4 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-800">
                  {fbConnections.filter((c: any) => c.tokenExpiresAt && new Date(c.tokenExpiresAt) < new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) && new Date(c.tokenExpiresAt) > new Date()).length} Facebook connection(s) have tokens expiring within 14 days. Reconnect to avoid sync interruption.
                </p>
              </div>
            )}
            {/* Search & Filter */}
            {fbPagination.total > 10 && (
              <div className="flex gap-2 mt-3">
                <Input placeholder="Search by name or email..." value={fbSearch} onChange={(e) => { setFbSearch(e.target.value); loadFacebookAdsConnections(1); }} className="h-8 text-xs flex-1" />
                <select value={fbStatusFilter} onChange={(e) => { setFbStatusFilter(e.target.value); loadFacebookAdsConnections(1); }} className="h-8 text-xs border rounded px-2">
                  <option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="failing">Failing</option><option value="expiring">Token Expiring</option>
                </select>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {fbConnections.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No Facebook Ads accounts connected. Click &quot;Add Account&quot; to get started.</p>
            ) : (
              fbConnections.map((conn) => (
                <div key={conn.id} className="rounded-lg border p-4 space-y-4">
                  {/* Connection Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {conn.fbEmail && <span className="text-sm">{conn.fbEmail}</span>}
                      {conn.name && <Badge variant="outline" className="text-xs">{conn.name}</Badge>}
                      {conn.isThrottled ? (
                        <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">Throttled</Badge>
                      ) : conn.consecutiveFailures >= 3 ? (
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">Failing ({conn.consecutiveFailures}x)</Badge>
                      ) : conn.isActive ? (
                        <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700 border-indigo-200">Healthy</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-gray-50 text-gray-500 border-gray-200">Inactive</Badge>
                      )}
                      {conn.tokenExpiresAt && new Date(conn.tokenExpiresAt) < new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) && new Date(conn.tokenExpiresAt) > new Date() && (
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">Token expires {Math.ceil((new Date(conn.tokenExpiresAt).getTime() - Date.now()) / 86400000)}d</Badge>
                      )}
                      {conn.tokenExpiresAt && new Date(conn.tokenExpiresAt) < new Date() && (
                        <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">Token Expired</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {conn.tokenExpiresAt && new Date(conn.tokenExpiresAt) < new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) && (
                        <Button variant="outline" size="sm" onClick={handleConnectFacebookAds} className="h-7 text-xs text-amber-700">Reconnect</Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => handleDisconnectFacebookAds(conn.id)} className="text-red-500 hover:text-red-700 text-xs">Disconnect</Button>
                    </div>
                  </div>

                  {/* Ad Account Selection */}
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input value={fbAdAccountIds[conn.id] || ""} onChange={(e) => setFbAdAccountIds((p) => ({ ...p, [conn.id]: e.target.value }))} placeholder="act_123456789" className="flex-1" />
                      <Button size="sm" onClick={() => handleSaveFbAdAccountId(conn.id)}>Save</Button>
                      <Button variant="outline" size="sm" onClick={() => handleFetchFbAdAccounts(conn.id)} disabled={fbFetchingId === conn.id}>
                        {fbFetchingId === conn.id ? "Loading..." : "List Accounts"}
                      </Button>
                    </div>
                    {(fbAdAccountsMap[conn.id] || []).length > 0 && (
                      <div className="space-y-1 rounded border p-2 bg-muted/30 max-h-32 overflow-y-auto">
                        {fbAdAccountsMap[conn.id].map((acct) => (
                          <button key={acct.id} onClick={() => setFbAdAccountIds((p) => ({ ...p, [conn.id]: acct.id }))} className={cn("w-full text-left rounded px-2 py-1 text-xs hover:bg-muted transition-colors", fbAdAccountIds[conn.id] === acct.id && "bg-primary/10 font-medium")}>
                            {acct.name} <span className="text-muted-foreground">({acct.id})</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Conversion Mappings */}
                  {conn.fbAdAccountId && (
                    <div className="space-y-2 pt-2 border-t">
                      <p className="text-xs font-medium">Conversion Mappings</p>
                      {(conn.conversionMappings || []).map((m: any) => (
                        <div key={m.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                          <Badge variant="outline" className="shrink-0">{m.tagLabel}</Badge>
                          <span className="text-xs text-muted-foreground truncate flex-1">{m.pixelEventName}</span>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteFbMapping(m.id)} className="h-6 w-6 p-0 text-red-500"><X className="h-3.5 w-3.5" /></Button>
                        </div>
                      ))}
                      <div className="space-y-2 rounded border p-2 bg-muted/30">
                        {["Qualified", "Booked", "Customer"].map((tag) => {
                          if ((conn.conversionMappings || []).find((m: any) => m.tagLabel === tag)) return null;
                          return (
                            <div key={tag} className="flex items-center gap-2">
                              <Badge variant="outline" className="w-24 shrink-0 justify-center text-xs">{tag}</Badge>
                              <Select value={fbSelectedMappings[conn.id]?.[tag] || ""} onValueChange={(v) => setFbSelectedMappings((prev) => ({ ...prev, [conn.id]: { ...prev[conn.id], [tag]: v || "" } }))}>
                                <SelectTrigger className="flex-1 h-7 text-xs"><span className="truncate">{fbSelectedMappings[conn.id]?.[tag] || "Select event..."}</span></SelectTrigger>
                                <SelectContent>{FB_EVENT_OPTIONS.map((evt) => (<SelectItem key={evt} value={evt} className="text-xs">{evt}</SelectItem>))}</SelectContent>
                              </Select>
                              <Button size="sm" variant="outline" onClick={() => handleSaveFbMapping(conn.id, tag)} disabled={!fbSelectedMappings[conn.id]?.[tag] || fbSavingMapping} className="h-7 px-2 text-xs">Save</Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Lead Form Sync (Facebook Lead Ads) */}
                  <div className="space-y-3 pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium">Lead Form Sync</p>
                        <p className="text-[10px] text-muted-foreground">Auto-import leads from Facebook Lead Ad forms via webhooks</p>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            await api.updateFacebookAdsConnection({ connectionId: conn.id, leadFormSyncEnabled: !conn.leadFormSyncEnabled });
                            await loadFacebookAdsConnections();
                          } catch (err: any) { alert(err.message || "Failed"); }
                        }}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${conn.leadFormSyncEnabled ? "bg-green-500" : "bg-gray-300"}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${conn.leadFormSyncEnabled ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
                      </button>
                    </div>
                    {conn.leadFormSyncEnabled && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Select the Facebook Page to receive lead form submissions from:</p>
                        <div className="flex gap-2">
                          <Select
                            value={conn.fbPageId || ""}
                            onValueChange={async (v) => {
                              try {
                                await api.updateFacebookAdsConnection({ connectionId: conn.id, fbPageId: v || "" });
                                await loadFacebookAdsConnections();
                              } catch (err: any) { alert(err.message || "Failed"); }
                            }}
                          >
                            <SelectTrigger className="flex-1 h-8 text-xs">
                              <span className="truncate">{conn.fbPageId ? (fbPagesMap[conn.id]?.find((p: any) => p.id === conn.fbPageId)?.name || conn.fbPageId) : "Select a page..."}</span>
                            </SelectTrigger>
                            <SelectContent>
                              {(fbPagesMap[conn.id] || []).map((page: any) => (
                                <SelectItem key={page.id} value={page.id} className="text-xs">{page.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button variant="outline" size="sm" onClick={() => handleFetchFbPages(conn.id)} disabled={fbFetchingPagesId === conn.id} className="h-8 text-xs">
                            {fbFetchingPagesId === conn.id ? "Loading..." : "Load Pages"}
                          </Button>
                        </div>
                        {conn.fbPageId && (
                          <p className="text-[10px] text-green-600">Listening for lead submissions on this page</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Sync Status */}
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs">
                        {conn.lastSyncAt && <><span className="text-muted-foreground">Synced:</span><span>{relativeTime(conn.lastSyncAt)}</span>{!conn.lastSyncError && <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px] px-1.5 py-0">OK</Badge>}</>}
                      </div>
                      <Button variant="outline" size="sm" onClick={() => handleFbSync(conn.id)} disabled={fbSyncingId === conn.id} className="h-7 text-xs">
                        <RefreshCw className={`h-3 w-3 mr-1 ${fbSyncingId === conn.id ? "animate-spin" : ""}`} />{fbSyncingId === conn.id ? "Syncing..." : "Sync"}
                      </Button>
                    </div>
                    {conn.lastSyncError && <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-600">{conn.lastSyncError}</div>}
                    <SyncHistory logs={conn.syncHistory || []} />
                  </div>
                </div>
              ))
            )}
            {/* Pagination */}
            {fbPagination.totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">Page {fbPagination.page} of {fbPagination.totalPages} ({fbPagination.total} connections)</p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={fbPagination.page <= 1} onClick={() => loadFacebookAdsConnections(fbPagination.page - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={fbPagination.page >= fbPagination.totalPages} onClick={() => loadFacebookAdsConnections(fbPagination.page + 1)}>Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Keyword Configuration */}
      <Card id="settings-keywords">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-amber-500" />Keyword Configuration</CardTitle>
              <CardDescription>Keywords are used to automatically score call transcripts and identify lead quality.</CardDescription>
            </div>
            {keywords.length === 0 && (
              <Button variant="outline" size="sm" onClick={handleSeedDefaults} disabled={seedingDefaults}>
                {seedingDefaults ? "Loading..." : "Load Defaults"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder="Add keyword..." value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleAddKeyword(); }} className="flex-1" />
            <Select value={newCategory} onValueChange={(v) => setNewCategory(v || "general")}>
              <SelectTrigger className="w-[140px]"><span className="truncate">{CATEGORIES.find((c) => c.value === newCategory)?.label || "Category"}</span></SelectTrigger>
              <SelectContent>{CATEGORIES.map((cat) => (<SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>))}</SelectContent>
            </Select>
            <Button size="sm" onClick={handleAddKeyword} disabled={addingKeyword || !newKeyword.trim()}><Plus className="h-4 w-4" /></Button>
          </div>
          {groupedKeywords.length > 0 ? (
            <div className="space-y-3">
              {groupedKeywords.map((group) => (
                <div key={group.value}>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">{group.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.keywords.map((kw) => (
                      <Badge key={kw.id} variant="outline" className={`${categoryColors[kw.category] || ""} gap-1 pr-1`}>
                        {kw.keyword}
                        <button onClick={() => handleDeleteKeyword(kw.id)} className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 transition-colors"><X className="h-3 w-3" /></button>
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No keywords configured. Add keywords above or load the defaults.</p>
          )}
          {keywords.length > 0 && (
            <div className="pt-2 border-t">
              <Button variant="ghost" size="sm" onClick={handleSeedDefaults} disabled={seedingDefaults} className="text-xs">{seedingDefaults ? "Loading..." : "Add Missing Defaults"}</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notification Configuration */}
      <Card id="settings-notifications">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-blue-500" />Notifications</CardTitle>
          <CardDescription>Configure how and when you receive notifications about new leads and calls.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex gap-2">
              <Select value={newChannel} onValueChange={(v) => setNewChannel(v || "EMAIL")}>
                <SelectTrigger className="w-[130px]"><span className="truncate">{newChannel === "EMAIL" ? "Email" : newChannel === "SLACK" ? "Slack" : "Webhook"}</span></SelectTrigger>
                <SelectContent><SelectItem value="EMAIL">Email</SelectItem><SelectItem value="SLACK">Slack</SelectItem><SelectItem value="WEBHOOK">Webhook</SelectItem></SelectContent>
              </Select>
              <Input placeholder={newChannel === "EMAIL" ? "alerts@company.com" : newChannel === "SLACK" ? "https://hooks.slack.com/services/..." : "https://your-app.com/webhook"} value={newTarget} onChange={(e) => setNewTarget(e.target.value)} className="flex-1" />
              <Button size="sm" onClick={handleAddConfig} disabled={addingConfig || !newTarget.trim() || newEvents.length === 0}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {EVENT_OPTIONS.map((evt) => (
                <button key={evt.value} onClick={() => toggleEvent(evt.value)} className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${newEvents.includes(evt.value) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}>{evt.label}</button>
              ))}
            </div>
          </div>
          {notifConfigs.length > 0 ? (
            <div className="space-y-2">
              {notifConfigs.map((config) => (
                <div key={config.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <button onClick={() => handleToggleConfig(config.id, config.isActive)} className={`h-4 w-4 rounded-full border-2 shrink-0 transition-colors ${config.isActive ? "bg-green-500 border-green-500" : "bg-transparent border-gray-300"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><Badge variant="outline" className="text-xs shrink-0">{config.channel}</Badge><span className="text-sm truncate">{config.target}</span></div>
                    <div className="flex flex-wrap gap-1 mt-1">{(config.events || []).map((evt: string) => (<span key={evt} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{evt.replace(/_/g, " ")}</span>))}</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleTestConfig(config.id)} title="Send test"><Send className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteConfig(config.id)} className="text-red-500 hover:text-red-700" title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No notification channels configured. Add one above to get started.</p>
          )}
        </CardContent>
      </Card>

      {/* Scheduled Reports */}
      <Card id="settings-reports">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-green-600" />Scheduled Reports</CardTitle>
          <CardDescription>Automatically email PDF reports on a weekly or monthly schedule.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex gap-2">
              <Select value={newReportType} onValueChange={(v) => setNewReportType(v || "FULL_SUMMARY")}>
                <SelectTrigger className="w-[170px]"><span className="truncate">{REPORT_TYPES.find((r) => r.value === newReportType)?.label || "Report Type"}</span></SelectTrigger>
                <SelectContent>{REPORT_TYPES.map((r) => (<SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>))}</SelectContent>
              </Select>
              <Select value={newFrequency} onValueChange={(v) => setNewFrequency(v || "WEEKLY")}>
                <SelectTrigger className="w-[120px]"><span className="truncate">{newFrequency === "WEEKLY" ? "Weekly" : "Monthly"}</span></SelectTrigger>
                <SelectContent><SelectItem value="WEEKLY">Weekly</SelectItem><SelectItem value="MONTHLY">Monthly</SelectItem></SelectContent>
              </Select>
              {newFrequency === "WEEKLY" ? (
                <Select value={String(newDayOfWeek)} onValueChange={(v) => setNewDayOfWeek(parseInt(v || "1"))}>
                  <SelectTrigger className="w-[90px]"><span className="truncate">{DAYS_OF_WEEK[newDayOfWeek]}</span></SelectTrigger>
                  <SelectContent>{DAYS_OF_WEEK.map((d, i) => (<SelectItem key={i} value={String(i)}>{d}</SelectItem>))}</SelectContent>
                </Select>
              ) : (
                <Select value={String(newDayOfMonth)} onValueChange={(v) => setNewDayOfMonth(parseInt(v || "1"))}>
                  <SelectTrigger className="w-[90px]"><span className="truncate">Day {newDayOfMonth}</span></SelectTrigger>
                  <SelectContent>{Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (<SelectItem key={d} value={String(d)}>Day {d}</SelectItem>))}</SelectContent>
                </Select>
              )}
            </div>
            <div className="flex gap-2">
              <Input placeholder="recipient@example.com, another@example.com" value={newRecipients} onChange={(e) => setNewRecipients(e.target.value)} className="flex-1" />
              <Button size="sm" onClick={handleAddSchedule} disabled={addingSchedule || !newRecipients.trim()}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
          {schedules.length > 0 ? (
            <div className="space-y-2">
              {schedules.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <button onClick={() => handleToggleSchedule(s.id, s.isActive)} className={`h-4 w-4 rounded-full border-2 shrink-0 transition-colors ${s.isActive ? "bg-green-500 border-green-500" : "bg-transparent border-gray-300"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><Badge variant="outline" className="text-xs">{s.frequency}</Badge><Badge variant="outline" className="text-xs">{s.reportType?.replace(/_/g, " ")}</Badge></div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{(s.recipients || []).join(", ")}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteSchedule(s.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No scheduled reports. Create one above.</p>
          )}
        </CardContent>
      </Card>

      {/* Team Members */}
      {isAdmin && (
        <Card id="settings-team">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-violet-500" />Team Members</CardTitle>
            <CardDescription>Manage your organization&apos;s team members and invitations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input placeholder="team@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="flex-1" />
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v || "MEMBER")}>
                <SelectTrigger className="w-[120px]"><span className="truncate">{inviteRole === "ADMIN" ? "Admin" : "Member"}</span></SelectTrigger>
                <SelectContent><SelectItem value="ADMIN">Admin</SelectItem><SelectItem value="MEMBER">Member</SelectItem></SelectContent>
              </Select>
              <Button size="sm" onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}><Send className="h-4 w-4 mr-1" />Invite</Button>
            </div>
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0">{m.name?.charAt(0)?.toUpperCase() || "?"}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{m.name}{m.id === user?.id && <span className="text-muted-foreground font-normal"> (you)</span>}</p>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>
                  {user?.role === "OWNER" && m.id !== user?.id ? (
                    <Select value={m.role} onValueChange={(v) => handleChangeRole(m.id, v || m.role)}>
                      <SelectTrigger className="w-[110px]"><Badge variant="outline" className={`text-xs ${ROLE_COLORS[m.role] || ""}`}>{m.role}</Badge></SelectTrigger>
                      <SelectContent><SelectItem value="OWNER">Owner</SelectItem><SelectItem value="ADMIN">Admin</SelectItem><SelectItem value="MEMBER">Member</SelectItem></SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className={`text-xs ${ROLE_COLORS[m.role] || ""}`}>{m.role}</Badge>
                  )}
                  {m.id !== user?.id && (
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveMember(m.id)} className="text-red-500 hover:text-red-700" title="Remove"><UserMinus className="h-3.5 w-3.5" /></Button>
                  )}
                </div>
              ))}
            </div>
            {invites.length > 0 && (
              <div className="pt-3 border-t">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Pending Invites</p>
                <div className="space-y-2">
                  {invites.map((inv) => (
                    <div key={inv.id} className="flex items-center gap-3 rounded-lg border border-dashed p-3">
                      <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{inv.email}</p>
                        <p className="text-xs text-muted-foreground">Expires {new Date(inv.expiresAt).toLocaleDateString()}</p>
                      </div>
                      <Badge variant="outline" className={`text-xs ${ROLE_COLORS[inv.role] || ""}`}>{inv.role}</Badge>
                      <Button variant="ghost" size="sm" onClick={() => handleCancelInvite(inv.id)} className="text-red-500 hover:text-red-700"><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
