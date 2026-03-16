"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface KeywordMatch {
  keyword: string;
  category: string;
  count: number;
  positions: number[];
}

interface TranscriptViewerProps {
  segments: TranscriptSegment[];
  keywordsFound: KeywordMatch[] | null;
  currentTime: number;
  onSeekTo: (time: number) => void;
}

const categoryColors: Record<string, string> = {
  high_intent: "bg-green-100 text-green-800",
  booking: "bg-blue-100 text-blue-800",
  pricing: "bg-purple-100 text-purple-800",
  general: "bg-gray-100 text-gray-800",
  negative: "bg-orange-100 text-orange-800",
  spam: "bg-red-100 text-red-800",
};

export function TranscriptViewer({
  segments,
  keywordsFound,
  currentTime,
  onSeekTo,
}: TranscriptViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active segment
  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentTime]);

  // Build keyword lookup for highlighting
  const keywordSet = new Set(
    (keywordsFound || []).map((k) => k.keyword.toLowerCase()),
  );
  const keywordCategoryMap = new Map(
    (keywordsFound || []).map((k) => [k.keyword.toLowerCase(), k.category]),
  );

  function highlightText(text: string): React.ReactNode[] {
    if (keywordSet.size === 0) return [text];

    const escaped = Array.from(keywordSet).map((k) =>
      k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
    const regex = new RegExp(`(${escaped.join("|")})`, "gi");
    const parts = text.split(regex);

    return parts.map((part, i) => {
      const lower = part.toLowerCase();
      if (keywordSet.has(lower)) {
        const category = keywordCategoryMap.get(lower) || "general";
        return (
          <mark
            key={i}
            className={cn(
              "rounded px-0.5 font-medium",
              categoryColors[category] || categoryColors.general,
            )}
          >
            {part}
          </mark>
        );
      }
      return part;
    });
  }

  function formatTimestamp(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <div
      ref={containerRef}
      className="max-h-64 overflow-y-auto space-y-1 rounded-lg border p-3"
    >
      {segments.map((seg, i) => {
        const isActive = currentTime >= seg.start && currentTime < seg.end;
        return (
          <div
            key={i}
            ref={isActive ? activeRef : undefined}
            className={cn(
              "flex gap-2 rounded px-2 py-1 cursor-pointer transition-colors",
              isActive
                ? "bg-primary/10 border-l-2 border-primary"
                : "hover:bg-muted/50",
            )}
            onClick={() => onSeekTo(seg.start)}
          >
            <span className="text-xs text-muted-foreground font-mono shrink-0 mt-0.5 w-10">
              {formatTimestamp(seg.start)}
            </span>
            <p className="text-sm leading-relaxed">
              {highlightText(seg.text)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
