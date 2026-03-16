"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useAccount } from "@/lib/account-context";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KPICard } from "@/components/kpi-card";
import { LeadVolumeChart } from "@/components/charts/area-chart";
import { SourceDonutChart } from "@/components/charts/donut-chart";
import { CallOutcomeBarChart } from "@/components/charts/bar-chart";
import { SpendEntryForm } from "@/components/spend-entry-form";
import { Button } from "@/components/ui/button";
import {
  Phone,
  PhoneOff,
  Clock,
  Users,
  DollarSign,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  TrendingUp,
} from "lucide-react";

type CampaignSortKey = "totalLeads" | "calls" | "spend" | "costPerLead" | "conversionRate" | "avgDuration" | null;
type SortDir = "asc" | "desc";

export default function DashboardPage() {
  const { currentAccount } = useAccount();
  const [range, setRange] = useState(30);
  const [loading, setLoading] = useState(true);

  // Data state
  const [overview, setOverview] = useState<{
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
  } | null>(null);

  const [leadVolume, setLeadVolume] = useState<
    { date: string; calls: number; forms: number; total: number }[]
  >([]);

  const [sources, setSources] = useState<
    { source: string; calls: number; forms: number; total: number }[]
  >([]);

  const [outcomes, setOutcomes] = useState<{ status: string; count: number }[]>(
    []
  );

  const [campaigns, setCampaigns] = useState<
    {
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
    }[]
  >([]);

  // Campaign table sorting
  const [campSortKey, setCampSortKey] = useState<CampaignSortKey>(null);
  const [campSortDir, setCampSortDir] = useState<SortDir>("desc");

  const fetchAll = useCallback(async () => {
    if (!currentAccount) return;
    setLoading(true);
    try {
      const [overviewRes, volumeRes, sourcesRes, outcomesRes, campaignsRes] =
        await Promise.all([
          api.getAnalyticsOverview(currentAccount.id, range),
          api.getLeadVolume(currentAccount.id, range),
          api.getSourceBreakdown(currentAccount.id, range),
          api.getCallOutcomes(currentAccount.id, range),
          api.getCampaignPerformance(currentAccount.id, range),
        ]);

      setOverview({ current: overviewRes.current, previous: overviewRes.previous });
      setLeadVolume(volumeRes.series);
      setSources(sourcesRes.sources);
      setOutcomes(outcomesRes.outcomes);
      setCampaigns(campaignsRes.campaigns);
    } catch (err) {
      console.error("Failed to load analytics:", err);
    } finally {
      setLoading(false);
    }
  }, [currentAccount, range]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const sortedCampaigns = useMemo(() => {
    if (!campSortKey) return campaigns;
    return [...campaigns].sort((a, b) => {
      const cmp = ((a as any)[campSortKey] || 0) - ((b as any)[campSortKey] || 0);
      return campSortDir === "asc" ? cmp : -cmp;
    });
  }, [campaigns, campSortKey, campSortDir]);

  const toggleCampSort = (key: CampaignSortKey) => {
    if (campSortKey === key) {
      setCampSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setCampSortKey(key);
      setCampSortDir("desc");
    }
  };

  const CampSortIcon = ({ col }: { col: CampaignSortKey }) => {
    if (campSortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40 inline" />;
    return campSortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1 inline" /> : <ArrowDown className="h-3 w-3 ml-1 inline" />;
  };

  // Totals row
  const campaignTotals = useMemo(() => {
    if (campaigns.length === 0) return null;
    const t = campaigns.reduce(
      (acc, c) => ({
        totalLeads: acc.totalLeads + c.totalLeads,
        calls: acc.calls + c.calls,
        forms: acc.forms + c.forms,
        spend: acc.spend + c.spend,
        avgDuration: 0,
        conversionRate: 0,
      }),
      { totalLeads: 0, calls: 0, forms: 0, spend: 0, avgDuration: 0, conversionRate: 0 }
    );
    const totalDurations = campaigns.reduce((s, c) => s + c.avgDuration * c.calls, 0);
    t.avgDuration = t.calls > 0 ? Math.round(totalDurations / t.calls) : 0;
    t.conversionRate = t.totalLeads > 0
      ? Math.round((campaigns.reduce((s, c) => s + c.qualifiedLeads, 0) / t.totalLeads) * 100)
      : 0;
    return { ...t, costPerLead: t.totalLeads > 0 ? t.spend / t.totalLeads : 0 };
  }, [campaigns]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatCurrency = (value: number) =>
    value > 0 ? `$${value.toFixed(2)}` : "$0.00";

  if (!currentAccount) {
    return (
      <div className="text-muted-foreground">
        Select or create an account to get started.
      </div>
    );
  }

  const hasSpendData = overview && overview.current.totalSpend > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{currentAccount.name}</h1>
          <p className="text-muted-foreground">Analytics overview</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs
            value={String(range)}
            onValueChange={(v) => setRange(Number(v))}
          >
            <TabsList>
              <TabsTrigger value="7">7d</TabsTrigger>
              <TabsTrigger value="30">30d</TabsTrigger>
              <TabsTrigger value="90">90d</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!currentAccount) return;
              const blob = await api.exportPdf(currentAccount.id, range);
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `report-${range}d.pdf`; a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-4 w-4 mr-1" />PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!currentAccount) return;
              const blob = await api.exportCampaignsCsv(currentAccount.id, range);
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `campaigns-${range}d.csv`; a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-4 w-4 mr-1" />CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards — reordered: efficiency metrics first */}
      {overview && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {hasSpendData ? (
            <KPICard
              title="Cost / Lead"
              value={formatCurrency(overview.current.costPerLead)}
              icon={DollarSign}
              current={overview.current.costPerLead}
              previous={0}
              invertTrend
            />
          ) : (
            <Card className="flex flex-col justify-center items-center p-4 text-center">
              <DollarSign className="h-5 w-5 text-muted-foreground mb-1" />
              <p className="text-xs font-medium text-muted-foreground">Cost / Lead</p>
              <p className="text-sm text-muted-foreground mt-1">Add spend data</p>
            </Card>
          )}
          <KPICard
            title="Total Leads"
            value={overview.current.totalLeads}
            icon={Users}
            current={overview.current.totalLeads}
            previous={overview.previous.totalLeads}
          />
          <KPICard
            title="Calls"
            value={overview.current.calls}
            icon={Phone}
            current={overview.current.calls}
            previous={overview.previous.calls}
          />
          <KPICard
            title="Missed Calls"
            value={overview.current.missedCalls}
            icon={PhoneOff}
            current={overview.current.missedCalls}
            previous={overview.previous.missedCalls}
            invertTrend
          />
          <KPICard
            title="Avg Duration"
            value={formatDuration(overview.current.avgDuration)}
            icon={Clock}
            current={overview.current.avgDuration}
            previous={overview.previous.avgDuration}
          />
          <KPICard
            title="Conv. Rate"
            value={`${campaigns.length > 0 ? campaigns.reduce((s, c) => s + c.conversionRate, 0) / campaigns.length : 0}%`}
            icon={TrendingUp}
            current={0}
            previous={0}
          />
        </div>
      )}

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Lead Volume</CardTitle>
          </CardHeader>
          <CardContent>
            {leadVolume.length > 0 ? (
              <LeadVolumeChart data={leadVolume} />
            ) : (
              <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
                {loading ? "Loading..." : "No data for this period"}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lead Sources</CardTitle>
          </CardHeader>
          <CardContent>
            {sources.length > 0 ? (
              <SourceDonutChart data={sources} />
            ) : (
              <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
                {loading ? "Loading..." : "No data for this period"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Call Outcomes */}
      <Card>
        <CardHeader>
          <CardTitle>Call Outcomes</CardTitle>
        </CardHeader>
        <CardContent>
          {outcomes.length > 0 ? (
            <CallOutcomeBarChart data={outcomes} />
          ) : (
            <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
              {loading ? "Loading..." : "No call data for this period"}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campaign Performance — sortable with totals row */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Campaign Performance</CardTitle>
          <SpendEntryForm
            accountId={currentAccount.id}
            onSuccess={fetchAll}
          />
        </CardHeader>
        <CardContent>
          {campaigns.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Campaign</th>
                    <th className="pb-2 pr-4 font-medium hidden sm:table-cell">Source</th>
                    <th className="pb-2 pr-4 font-medium text-right">
                      <button onClick={() => toggleCampSort("totalLeads")} className="inline-flex items-center hover:text-foreground transition-colors">
                        Leads<CampSortIcon col="totalLeads" />
                      </button>
                    </th>
                    <th className="pb-2 pr-4 font-medium text-right hidden md:table-cell">
                      <button onClick={() => toggleCampSort("calls")} className="inline-flex items-center hover:text-foreground transition-colors">
                        Calls<CampSortIcon col="calls" />
                      </button>
                    </th>
                    <th className="pb-2 pr-4 font-medium text-right hidden lg:table-cell">Forms</th>
                    <th className="pb-2 pr-4 font-medium text-right hidden lg:table-cell">
                      <button onClick={() => toggleCampSort("avgDuration")} className="inline-flex items-center hover:text-foreground transition-colors">
                        Avg Duration<CampSortIcon col="avgDuration" />
                      </button>
                    </th>
                    <th className="pb-2 pr-4 font-medium text-right">
                      <button onClick={() => toggleCampSort("conversionRate")} className="inline-flex items-center hover:text-foreground transition-colors">
                        Conv. Rate<CampSortIcon col="conversionRate" />
                      </button>
                    </th>
                    <th className="pb-2 pr-4 font-medium text-right">
                      <button onClick={() => toggleCampSort("spend")} className="inline-flex items-center hover:text-foreground transition-colors">
                        Spend<CampSortIcon col="spend" />
                      </button>
                    </th>
                    <th className="pb-2 font-medium text-right">
                      <button onClick={() => toggleCampSort("costPerLead")} className="inline-flex items-center hover:text-foreground transition-colors">
                        Cost/Lead<CampSortIcon col="costPerLead" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCampaigns.map((c, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2.5 pr-4 font-medium">
                        {c.campaign}
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground hidden sm:table-cell">
                        {c.source}/{c.medium}
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        {c.totalLeads}
                      </td>
                      <td className="py-2.5 pr-4 text-right hidden md:table-cell">{c.calls}</td>
                      <td className="py-2.5 pr-4 text-right hidden lg:table-cell">{c.forms}</td>
                      <td className="py-2.5 pr-4 text-right hidden lg:table-cell">
                        {formatDuration(c.avgDuration)}
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        {c.conversionRate}%
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        {c.spend > 0 ? formatCurrency(c.spend) : "—"}
                      </td>
                      <td className="py-2.5 text-right">
                        {c.costPerLead > 0 ? formatCurrency(c.costPerLead) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {campaignTotals && campaigns.length > 1 && (
                  <tfoot>
                    <tr className="border-t-2 font-semibold">
                      <td className="py-2.5 pr-4">Total</td>
                      <td className="py-2.5 pr-4 hidden sm:table-cell" />
                      <td className="py-2.5 pr-4 text-right">{campaignTotals.totalLeads}</td>
                      <td className="py-2.5 pr-4 text-right hidden md:table-cell">{campaignTotals.calls}</td>
                      <td className="py-2.5 pr-4 text-right hidden lg:table-cell">{campaignTotals.forms}</td>
                      <td className="py-2.5 pr-4 text-right hidden lg:table-cell">{formatDuration(campaignTotals.avgDuration)}</td>
                      <td className="py-2.5 pr-4 text-right">{campaignTotals.conversionRate}%</td>
                      <td className="py-2.5 pr-4 text-right">{campaignTotals.spend > 0 ? formatCurrency(campaignTotals.spend) : "—"}</td>
                      <td className="py-2.5 text-right">{campaignTotals.costPerLead > 0 ? formatCurrency(campaignTotals.costPerLead) : "—"}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {loading ? "Loading..." : "No campaign data for this period"}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
