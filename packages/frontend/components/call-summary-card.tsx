"use client";

import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

interface CallSummaryCardProps {
  summary: string | null;
  leadScore: number | null;
  leadScoreLabel: string | null;
  keywordsFound: { keyword: string; category: string; count: number }[] | null;
}

const scoreLabelColors: Record<string, string> = {
  HIGH: "bg-green-100 text-green-800",
  MEDIUM: "bg-yellow-100 text-yellow-800",
  LOW: "bg-orange-100 text-orange-800",
  SPAM: "bg-red-100 text-red-800",
};

export function CallSummaryCard({
  summary,
  leadScore,
  leadScoreLabel,
  keywordsFound,
}: CallSummaryCardProps) {
  if (!summary && leadScore == null) return null;

  return (
    <div className="rounded-lg border p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-amber-500" />
          AI Analysis
        </h4>
        {leadScoreLabel && (
          <Badge
            variant="outline"
            className={scoreLabelColors[leadScoreLabel] || ""}
          >
            {leadScoreLabel} ({leadScore})
          </Badge>
        )}
      </div>
      {summary && (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {summary}
        </p>
      )}
      {keywordsFound && keywordsFound.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {keywordsFound.map((kw) => (
            <Badge key={kw.keyword} variant="secondary" className="text-xs">
              {kw.keyword}
              {kw.count > 1 && (
                <span className="ml-1 text-muted-foreground">x{kw.count}</span>
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
