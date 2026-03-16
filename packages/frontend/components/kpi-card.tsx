"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  current: number;
  previous: number;
  invertTrend?: boolean; // true = lower is better (e.g. missed calls, cost/lead)
}

export function KPICard({
  title,
  value,
  icon: Icon,
  current,
  previous,
  invertTrend = false,
}: KPICardProps) {
  let trendPercent = 0;
  if (previous > 0) {
    trendPercent = Math.round(((current - previous) / previous) * 100);
  } else if (current > 0) {
    trendPercent = 100;
  }

  const isPositive = invertTrend ? trendPercent <= 0 : trendPercent >= 0;
  const TrendIcon = trendPercent >= 0 ? TrendingUp : TrendingDown;
  const trendColor = isPositive ? "text-green-600" : "text-red-500";
  const displayPercent = Math.abs(trendPercent);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {previous > 0 || current > 0 ? (
          <div className={`flex items-center gap-1 text-xs ${trendColor}`}>
            <TrendIcon className="h-3 w-3" />
            <span>
              {trendPercent >= 0 ? "+" : "-"}
              {displayPercent}% vs prev period
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No prior data</p>
        )}
      </CardContent>
    </Card>
  );
}
