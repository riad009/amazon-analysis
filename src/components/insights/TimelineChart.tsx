"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { ChangeEvent } from "@/lib/types";
import { format } from "date-fns";

// Simulated daily data for charting
function generateDailyData(days: number, changeEvents: ChangeEvent[]) {
  const today = new Date();
  const data = [];

  const changesByDay: Record<string, ChangeEvent[]> = {};
  for (const ev of changeEvents) {
    const key = format(new Date(ev.changedAt), "MMM d");
    if (!changesByDay[key]) changesByDay[key] = [];
    changesByDay[key].push(ev);
  }

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const label = format(d, "MMM d");

    // Simulate data with a dip after day index 5 to reflect bid changes
    const progress = (days - 1 - i) / (days - 1);
    const hasDip = i < days * 0.4;

    const currentAcos = hasDip
      ? 52 + Math.random() * 20 + (i < days * 0.2 ? 10 : 0)
      : 50 + Math.random() * 8;

    const currentSales = hasDip
      ? 180 - Math.random() * 60 - (i < days * 0.2 ? 30 : 0)
      : 210 + Math.random() * 30;

    const prevSales = currentSales * (0.9 + Math.random() * 0.2);
    const prevAcos = currentAcos * (0.88 + Math.random() * 0.12);

    data.push({
      date: label,
      currentAcos: parseFloat(currentAcos.toFixed(1)),
      previousAcos: parseFloat(prevAcos.toFixed(1)),
      currentSales: parseFloat(currentSales.toFixed(2)),
      previousSales: parseFloat(prevSales.toFixed(2)),
      hasChange: !!changesByDay[label],
      changeLabel: changesByDay[label]?.map((e) => `${e.field}: ${e.oldValue}→${e.newValue}`).join(", "),
    });
  }

  return data;
}

interface TimelineChartProps {
  days: number;
  changeEvents: ChangeEvent[];
  metric: "acos" | "sales";
}

export function TimelineChart({ days, changeEvents, metric }: TimelineChartProps) {
  const data = generateDailyData(days, changeEvents);

  const isAcos = metric === "acos";

  // Find days with changes for reference lines
  const changeDays = data.filter((d) => d.hasChange);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => (isAcos ? `${v}%` : `$${v}`)}
          width={40}
        />
        <Tooltip
          contentStyle={{
            fontSize: 11,
            background: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
          }}
          formatter={(value: number | string | undefined, name: string | undefined) => {
            const label = (name ?? "").includes("current") ? "Current" : "Previous";
            return [isAcos ? `${value}%` : `$${value}`, label];
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          formatter={(value) =>
            value.includes("current") ? "Current Period" : "Previous Period"
          }
        />

        {/* Reference lines for change events */}
        {changeDays.map((d) => (
          <ReferenceLine
            key={d.date}
            x={d.date}
            stroke="hsl(var(--primary))"
            strokeDasharray="4 2"
            label={{
              value: "📋",
              position: "top",
              fontSize: 12,
            }}
          />
        ))}

        <Line
          type="monotone"
          dataKey={isAcos ? "currentAcos" : "currentSales"}
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey={isAcos ? "previousAcos" : "previousSales"}
          stroke="hsl(var(--muted-foreground))"
          strokeWidth={1.5}
          strokeDasharray="4 2"
          dot={false}
          activeDot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
