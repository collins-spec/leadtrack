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

  // Google Ads state
  const [gadsStatus, setGadsStatus] = useState<any>(null);
  const [gadsCustomerId, setGadsCustomerId] = useState("");
  const [gadsSyncing, setGadsSyncing] = useState(false);

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

  const loadGoogleAdsStatus = useCallback(async () => {
    if (!currentAccount) return;
    try {
      const status = await api.getGoogleAdsStatus(currentAccount.id);
      setGadsStatus(status);
      if (status.googleCustomerId) setGadsCustomerId(status.googleCustomerId);
    } catch { /* */ }
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

  useEffect(() => {
    if (currentAccount) {
      setForm({ name: currentAccount.name, businessPhone: currentAccount.businessPhone, timezone: currentAccount.timezone });
      loadKeywords();
      loadNotifConfigs();
      loadGoogleAdsStatus();
      loadSchedules();
      loadTeam();
    }
  }, [currentAccount, loadKeywords, loadNotifConfigs, loadGoogleAdsStatus, loadSchedules, loadTeam]);

  // ─── Handlers ─────────────────────────────────────────

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

  const handleConnectGoogleAds = async () => {
    if (!currentAccount) return;
    try { const { url } = await api.getGoogleAdsConnectUrl(currentAccount.id); window.location.href = url; }
    catch (err: any) { alert(err.message || "Failed"); }
  };

  const handleSaveCustomerId = async () => {
    if (!currentAccount) return;
    try { await api.updateGoogleAdsConnection({ accountId: currentAccount.id, googleCustomerId: gadsCustomerId }); await loadGoogleAdsStatus(); }
    catch (err: any) { alert(err.message || "Failed to save"); }
  };

  const handleGadsSync = async () => {
    if (!currentAccount) return;
    setGadsSyncing(true);
    try { await api.triggerGoogleAdsSync(currentAccount.id); setTimeout(() => { loadGoogleAdsStatus(); setGadsSyncing(false); }, 3000); }
    catch (err: any) { alert(err.message || "Sync failed"); setGadsSyncing(false); }
  };

  const handleDisconnectGoogleAds = async () => {
    if (!currentAccount || !confirm("Disconnect Google Ads?")) return;
    try { await api.disconnectGoogleAds(currentAccount.id); setGadsStatus({ connected: false }); setGadsCustomerId(""); }
    catch (err: any) { alert(err.message || "Failed"); }
  };

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
    ...(isAdmin ? [{ id: "google-ads", label: "Google Ads" }] : []),
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
          <button
            key={s.id}
            onClick={() => scrollToSection(s.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeSection === s.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {s.label}
          </button>
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

      {/* Google Ads Integration */}
      {isAdmin && (
        <Card id="settings-google-ads">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ExternalLink className="h-5 w-5 text-blue-600" />Google Ads Integration</CardTitle>
            <CardDescription>Connect Google Ads to sync spend data and upload offline conversions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!gadsStatus?.connected ? (
              <Button onClick={handleConnectGoogleAds}><ExternalLink className="h-4 w-4 mr-2" />Connect Google Ads</Button>
            ) : (
              <div className="space-y-3">
                {gadsStatus.googleEmail && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{gadsStatus.googleEmail}</span>
                    <Badge variant="outline" className="text-xs">Connected</Badge>
                  </div>
                )}
                <div className="flex gap-2">
                  <Input value={gadsCustomerId} onChange={(e) => setGadsCustomerId(e.target.value)} placeholder="xxx-xxx-xxxx" />
                  <Button size="sm" onClick={handleSaveCustomerId}>Save</Button>
                </div>
                <p className="text-xs text-muted-foreground">Enter your Google Ads Customer ID (top-right of Google Ads).</p>
                {gadsStatus.lastSyncAt && <p className="text-xs text-muted-foreground">Last synced: {(() => { const diff = Date.now() - new Date(gadsStatus.lastSyncAt).getTime(); const mins = Math.floor(diff / 60000); if (mins < 1) return "just now"; if (mins < 60) return `${mins}m ago`; const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h ago`; return `${Math.floor(hrs / 24)}d ago`; })()}</p>}
                {gadsStatus.lastSyncError && <p className="text-xs text-red-500">Sync error: {gadsStatus.lastSyncError}</p>}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleGadsSync} disabled={gadsSyncing}>
                    <RefreshCw className={`h-4 w-4 mr-1 ${gadsSyncing ? "animate-spin" : ""}`} />{gadsSyncing ? "Syncing..." : "Sync Now"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleDisconnectGoogleAds} className="text-red-500">Disconnect</Button>
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
              <SelectContent>
                {CATEGORIES.map((cat) => (<SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>))}
              </SelectContent>
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
              <Button variant="ghost" size="sm" onClick={handleSeedDefaults} disabled={seedingDefaults} className="text-xs">
                {seedingDefaults ? "Loading..." : "Add Missing Defaults"}
              </Button>
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
                <SelectContent>
                  <SelectItem value="EMAIL">Email</SelectItem>
                  <SelectItem value="SLACK">Slack</SelectItem>
                  <SelectItem value="WEBHOOK">Webhook</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder={newChannel === "EMAIL" ? "alerts@company.com" : newChannel === "SLACK" ? "https://hooks.slack.com/services/..." : "https://your-app.com/webhook"} value={newTarget} onChange={(e) => setNewTarget(e.target.value)} className="flex-1" />
              <Button size="sm" onClick={handleAddConfig} disabled={addingConfig || !newTarget.trim() || newEvents.length === 0}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {EVENT_OPTIONS.map((evt) => (
                <button key={evt.value} onClick={() => toggleEvent(evt.value)} className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${newEvents.includes(evt.value) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}>
                  {evt.label}
                </button>
              ))}
            </div>
          </div>
          {notifConfigs.length > 0 ? (
            <div className="space-y-2">
              {notifConfigs.map((config) => (
                <div key={config.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <button onClick={() => handleToggleConfig(config.id, config.isActive)} className={`h-4 w-4 rounded-full border-2 shrink-0 transition-colors ${config.isActive ? "bg-green-500 border-green-500" : "bg-transparent border-gray-300"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs shrink-0">{config.channel}</Badge>
                      <span className="text-sm truncate">{config.target}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(config.events || []).map((evt: string) => (<span key={evt} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{evt.replace(/_/g, " ")}</span>))}
                    </div>
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
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{s.frequency}</Badge>
                      <Badge variant="outline" className="text-xs">{s.reportType?.replace(/_/g, " ")}</Badge>
                    </div>
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
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0">
                    {m.name?.charAt(0)?.toUpperCase() || "?"}
                  </div>
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
