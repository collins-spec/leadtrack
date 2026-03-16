"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface OutcomeData {
  status: string;
  count: number;
}

interface CallOutcomeBarChartProps {
  data: OutcomeData[];
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "#10b981",
  NO_ANSWER: "#f59e0b",
  BUSY: "#f97316",
  FAILED: "#ef4444",
  RINGING: "#6366f1",
  IN_PROGRESS: "#3b82f6",
};

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "Completed",
  NO_ANSWER: "No Answer",
  BUSY: "Busy",
  FAILED: "Failed",
  RINGING: "Ringing",
  IN_PROGRESS: "In Progress",
};

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="mb-0.5 text-sm font-medium">
        {STATUS_LABELS[d.status] || d.status}
      </p>
      <p className="text-sm font-semibold">{d.count} calls</p>
    </div>
  );
}

export function CallOutcomeBarChart({ data }: CallOutcomeBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" vertical={false} />
        <XAxis
          dataKey="status"
          tickFormatter={(v) => STATUS_LABELS[v] || v}
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted)/0.3)" }} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={60}>
          {data.map((entry, index) => (
            <Cell
              key={index}
              fill={STATUS_COLORS[entry.status] || "#94a3b8"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
