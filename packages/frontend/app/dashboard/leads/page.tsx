"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useAccount } from "@/lib/account-context";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Phone,
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  Download,
  CheckSquare,
  Square,
  Tag,
  X,
  Megaphone,
} from "lucide-react";
import { LeadDetailPanel, type UnifiedLead } from "@/components/lead-detail-panel";
import { cn } from "@/lib/utils";

const scoreLabelColors: Record<string, string> = {
  HIGH: "bg-green-100 text-green-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  LOW: "bg-orange-100 text-orange-800",
  SPAM: "bg-red-100 text-red-800",
};

const statusColors: Record<string, string> = {
  COMPLETED: "bg-green-100 text-green-800",
  NO_ANSWER: "bg-yellow-100 text-yellow-800",
  BUSY: "bg-orange-100 text-orange-800",
  FAILED: "bg-red-100 text-red-800",
};

const QUICK_TAGS = [
  { label: "Qualified", color: "#16a34a" },
  { label: "Junk", color: "#dc2626" },
  { label: "Booked", color: "#2563eb" },
  { label: "Follow Up", color: "#d97706" },
];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function LeadInboxPage() {
  const { currentAccount } = useAccount();
  const [leads, setLeads] = useState<UnifiedLead[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  });

  // Filters
  const [typeFilter, setTypeFilter] = useState<"all" | "call" | "form">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Detail panel
  const [selectedLead, setSelectedLead] = useState<UnifiedLead | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTagging, setBulkTagging] = useState(false);

  // Debounce search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search]);

  const fetchLeads = useCallback(
    async (page = 1) => {
      if (!currentAccount) return;
      try {
        const data = await api.getUnifiedLeads(currentAccount.id, {
          page,
          limit: 25,
          type: typeFilter,
          search: debouncedSearch || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        });
        setLeads(data.leads);
        setPagination(data.pagination);
        setSelectedIds(new Set());
      } catch {
        // ignore
      }
    },
    [currentAccount, typeFilter, debouncedSearch, dateFrom, dateTo]
  );

  useEffect(() => {
    fetchLeads(1);
  }, [fetchLeads]);

  // Update tags in the list when modified in the detail panel
  const handleTagsChange = (
    leadId: string,
    leadType: "call" | "form",
    newTags: any[]
  ) => {
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId && l.type === leadType ? { ...l, tags: newTags } : l
      )
    );
    if (selectedLead && selectedLead.id === leadId) {
      setSelectedLead((prev) => (prev ? { ...prev, tags: newTags } : prev));
    }
  };

  // Bulk selection helpers
  const toggleSelect = (leadKey: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadKey)) next.delete(leadKey);
      else next.add(leadKey);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map((l) => `${l.type}-${l.id}`)));
    }
  };

  const handleBulkTag = async (label: string, color: string) => {
    if (selectedIds.size === 0) return;
    setBulkTagging(true);
    try {
      const promises = leads
        .filter((l) => selectedIds.has(`${l.type}-${l.id}`))
        .map((l) =>
          l.type === "call"
            ? api.addCallTag(l.id, label, color)
            : api.addFormLeadTag(l.id, label, color)
        );
      await Promise.all(promises);
      await fetchLeads(pagination.page);
    } catch {
      // ignore
    } finally {
      setBulkTagging(false);
    }
  };

  // Keyboard navigation for detail panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedLead) return;
      const idx = leads.findIndex((l) => l.id === selectedLead.id && l.type === selectedLead.type);
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        if (idx < leads.length - 1) setSelectedLead(leads[idx + 1]);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        if (idx > 0) setSelectedLead(leads[idx - 1]);
      } else if (e.key === "Escape") {
        setSelectedLead(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedLead, leads]);

  if (!currentAccount) {
    return <div className="text-muted-foreground">Select an account.</div>;
  }

  // Count leads by type
  const callCount = leads.filter((l) => l.type === "call").length;
  const formCount = leads.filter((l) => l.type === "form").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Lead Inbox</h1>
          <p className="text-muted-foreground">{pagination.total} total leads</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            if (!currentAccount) return;
            const blob = await api.exportFormsCsv(currentAccount.id, 30);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = "leads.csv"; a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download className="h-4 w-4 mr-1" />Export CSV
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Type tabs with counts */}
        <Tabs
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v as "all" | "call" | "form")}
        >
          <TabsList>
            <TabsTrigger value="all">All ({pagination.total})</TabsTrigger>
            <TabsTrigger value="call">
              <Phone className="h-3.5 w-3.5 mr-1" />
              Calls
            </TabsTrigger>
            <TabsTrigger value="form">
              <FileText className="h-3.5 w-3.5 mr-1" />
              Forms
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, email..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Date range */}
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-[140px]"
          placeholder="From"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-[140px]"
          placeholder="To"
        />
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex gap-1.5">
            {QUICK_TAGS.map((qt) => (
              <Button
                key={qt.label}
                variant="outline"
                size="sm"
                disabled={bulkTagging}
                onClick={() => handleBulkTag(qt.label, qt.color)}
                className="text-xs"
              >
                <Tag className="h-3 w-3 mr-1" style={{ color: qt.color }} />
                {qt.label}
              </Button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Lead Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <button onClick={toggleSelectAll} className="flex items-center justify-center">
                    {selectedIds.size === leads.length && leads.length > 0 ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </TableHead>
                <TableHead className="w-[40px]" />
                <TableHead>Contact</TableHead>
                <TableHead className="hidden sm:table-cell">Score</TableHead>
                <TableHead className="hidden md:table-cell">Source / Campaign</TableHead>
                <TableHead className="hidden lg:table-cell">Keyword</TableHead>
                <TableHead className="hidden xl:table-cell">Tags</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => {
                const leadKey = `${lead.type}-${lead.id}`;
                const isSelected = selectedIds.has(leadKey);
                return (
                  <TableRow
                    key={leadKey}
                    className={cn(
                      "cursor-pointer hover:bg-muted/50",
                      isSelected && "bg-primary/5"
                    )}
                    onClick={() => setSelectedLead(lead)}
                  >
                    {/* Checkbox */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => toggleSelect(leadKey)}
                        className="flex items-center justify-center"
                      >
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-primary" />
                        ) : (
                          <Square className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    </TableCell>

                    {/* Type icon */}
                    <TableCell>
                      <div
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full",
                          lead.type === "call"
                            ? "bg-blue-100 text-blue-600"
                            : "bg-green-100 text-green-600"
                        )}
                      >
                        {lead.type === "call" ? (
                          <Phone className="h-4 w-4" />
                        ) : (
                          <FileText className="h-4 w-4" />
                        )}
                      </div>
                    </TableCell>

                    {/* Contact */}
                    <TableCell>
                      <div>
                        <p className="font-medium">{lead.contact}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {lead.type === "call" && lead.callerCity && (
                            <span className="text-xs text-muted-foreground">
                              {lead.callerCity}
                              {lead.callerState && `, ${lead.callerState}`}
                            </span>
                          )}
                          {lead.type === "call" && lead.callStatus && (
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium",
                                statusColors[lead.callStatus] || "bg-gray-100 text-gray-800"
                              )}
                            >
                              {lead.callStatus.replace("_", " ")}
                            </span>
                          )}
                          {lead.type === "call" && lead.duration != null && lead.duration > 0 && (
                            <span className="text-xs text-muted-foreground font-mono">
                              {formatDuration(lead.duration)}
                            </span>
                          )}
                          {lead.type === "form" && lead.contactEmail && (
                            <span className="text-xs text-muted-foreground">
                              {lead.contactEmail}
                            </span>
                          )}
                          {/* Show score inline on mobile */}
                          {lead.type === "call" && lead.leadScoreLabel && (
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium sm:hidden",
                                scoreLabelColors[lead.leadScoreLabel] || "",
                              )}
                            >
                              {lead.leadScoreLabel}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Score column */}
                    <TableCell className="hidden sm:table-cell">
                      {lead.type === "call" && lead.leadScoreLabel ? (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            scoreLabelColors[lead.leadScoreLabel] || "",
                          )}
                        >
                          {lead.leadScoreLabel}
                        </span>
                      ) : lead.type === "call" ? (
                        <span className="text-xs text-muted-foreground italic">Pending</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Source / Campaign */}
                    <TableCell className="hidden md:table-cell">
                      <p className="text-sm">{lead.source || "Direct"}</p>
                      {(lead.adsCampaign || lead.campaign) && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Megaphone className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                            {lead.adsCampaign || lead.campaign}
                          </span>
                        </div>
                      )}
                      {!lead.adsCampaign && !lead.campaign && lead.medium && (
                        <p className="text-xs text-muted-foreground">{lead.medium}</p>
                      )}
                    </TableCell>

                    {/* Keyword */}
                    <TableCell className="hidden lg:table-cell">
                      {lead.keyword ? (
                        <div className="flex items-center gap-1.5">
                          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div>
                            <span className="text-sm">{lead.keyword}</span>
                            {lead.matchType && (
                              <span className="ml-1 text-[10px] text-muted-foreground uppercase">
                                {lead.matchType}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">--</span>
                      )}
                    </TableCell>

                    {/* Tags */}
                    <TableCell className="hidden xl:table-cell">
                      <div className="flex gap-1 flex-wrap">
                        {lead.tags.map((tag: any) => (
                          <Badge
                            key={tag.id}
                            variant="outline"
                            className="text-xs"
                            style={{ borderColor: tag.color, color: tag.color }}
                          >
                            {tag.label}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>

                    {/* Date */}
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(lead.createdAt)}
                    </TableCell>

                    {/* View */}
                    <TableCell>
                      <Button variant="ghost" size="sm">
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {leads.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No leads found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => fetchLeads(pagination.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchLeads(pagination.page + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Panel */}
      <LeadDetailPanel
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onTagsChange={handleTagsChange}
      />
    </div>
  );
}
