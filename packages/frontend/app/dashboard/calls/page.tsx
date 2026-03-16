"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useAccount } from "@/lib/account-context";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Play, Pause, Phone, ChevronLeft, ChevronRight, Download, ArrowUpDown, ArrowUp, ArrowDown, Search, Megaphone } from "lucide-react";
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
  RINGING: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  CANCELED: "bg-gray-100 text-gray-800",
};

const scoreOrder: Record<string, number> = { HIGH: 4, MEDIUM: 3, LOW: 2, SPAM: 1 };

type SortKey = "duration" | "date" | "score" | "status" | null;
type SortDir = "asc" | "desc";

export default function CallsPage() {
  const { currentAccount } = useAccount();
  const [calls, setCalls] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const statusLabels: Record<string, string> = {
    all: "All Statuses",
    COMPLETED: "Completed",
    NO_ANSWER: "No Answer",
    BUSY: "Busy",
    FAILED: "Failed",
  };
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const fetchCalls = async (page = 1) => {
    if (!currentAccount) return;
    try {
      const params: any = { page };
      if (statusFilter !== "all") params.status = statusFilter;
      const data = await api.getCalls(currentAccount.id, params);
      setCalls(data.calls);
      setPagination(data.pagination);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchCalls(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount, statusFilter]);

  const sortedCalls = useMemo(() => {
    if (!sortKey) return calls;
    return [...calls].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "duration":
          cmp = (a.duration || 0) - (b.duration || 0);
          break;
        case "date":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "score":
          cmp = (scoreOrder[a.leadScoreLabel] || 0) - (scoreOrder[b.leadScoreLabel] || 0);
          break;
        case "status":
          cmp = (a.callStatus || "").localeCompare(b.callStatus || "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [calls, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const togglePlay = (callId: string, url: string) => {
    if (playingId === callId) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(url);
      audio.onended = () => setPlayingId(null);
      audio.play();
      audioRef.current = audio;
      setPlayingId(callId);
    }
  };

  if (!currentAccount) {
    return <div className="text-muted-foreground">Select an account.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Call Log</h1>
          <p className="text-muted-foreground">
            {pagination.total} total calls
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!currentAccount) return;
              const blob = await api.exportCallsCsv(currentAccount.id, 30);
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = "calls.csv"; a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-4 w-4 mr-1" />Export CSV
          </Button>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v || "all")}>
            <SelectTrigger className="w-[180px]">
              <span className="truncate">{statusLabels[statusFilter] || "Filter by status"}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="NO_ANSWER">No Answer</SelectItem>
              <SelectItem value="BUSY">Busy</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Caller</TableHead>
                <TableHead className="hidden sm:table-cell">Source</TableHead>
                <TableHead className="hidden md:table-cell">Campaign</TableHead>
                <TableHead className="hidden lg:table-cell">Keyword</TableHead>
                <TableHead>
                  <button onClick={() => toggleSort("status")} className="flex items-center hover:text-foreground transition-colors">
                    Status<SortIcon col="status" />
                  </button>
                </TableHead>
                <TableHead>
                  <button onClick={() => toggleSort("duration")} className="flex items-center hover:text-foreground transition-colors">
                    Duration<SortIcon col="duration" />
                  </button>
                </TableHead>
                <TableHead>
                  <button onClick={() => toggleSort("score")} className="flex items-center hover:text-foreground transition-colors">
                    Score<SortIcon col="score" />
                  </button>
                </TableHead>
                <TableHead className="hidden lg:table-cell">Tags</TableHead>
                <TableHead>
                  <button onClick={() => toggleSort("date")} className="flex items-center hover:text-foreground transition-colors">
                    Date<SortIcon col="date" />
                  </button>
                </TableHead>
                <TableHead className="hidden sm:table-cell">Recording</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedCalls.map((call) => (
                <TableRow key={call.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground hidden sm:block" />
                      <div>
                        <p className="font-medium">{call.callerNumber}</p>
                        {call.callerCity && (
                          <p className="text-xs text-muted-foreground">
                            {call.callerCity}, {call.callerState}
                          </p>
                        )}
                        {/* Show source inline on mobile */}
                        <p className="text-xs text-muted-foreground sm:hidden">
                          {call.trackingNumber.source}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div>
                      <p className="text-sm">{call.trackingNumber.source}</p>
                      <p className="text-xs text-muted-foreground">
                        {call.trackingNumber.campaignTag || call.trackingNumber.medium}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {(call.googleAdsCampaign || call.utmCampaign) ? (
                      <div className="flex items-center gap-1.5">
                        <Megaphone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm truncate max-w-[160px]">
                          {call.googleAdsCampaign || call.utmCampaign}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {(call.googleAdsKeyword || call.utmTerm) ? (
                      <div className="flex items-center gap-1.5">
                        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <div>
                          <span className="text-sm">{call.googleAdsKeyword || call.utmTerm}</span>
                          {call.googleAdsMatchType && (
                            <span className="ml-1 text-[10px] text-muted-foreground uppercase">
                              {call.googleAdsMatchType}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        statusColors[call.callStatus] || "bg-gray-100"
                      }`}
                    >
                      {call.callStatus.replace("_", " ")}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {formatDuration(call.duration)}
                  </TableCell>
                  <TableCell>
                    {call.leadScoreLabel ? (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          scoreLabelColors[call.leadScoreLabel] || "",
                        )}
                      >
                        {call.leadScoreLabel}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Pending</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex gap-1 flex-wrap">
                      {call.tags.map((tag: any) => (
                        <Badge
                          key={tag.id}
                          variant="outline"
                          style={{ borderColor: tag.color, color: tag.color }}
                        >
                          {tag.label}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDate(call.createdAt)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {call.recordingUrl ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => togglePlay(call.id, call.recordingUrl)}
                      >
                        {playingId === call.id ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">--</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {calls.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    No calls found.
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
              onClick={() => fetchCalls(pagination.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchCalls(pagination.page + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
