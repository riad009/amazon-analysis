import { AISuggestion } from "./types";

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  return value.toFixed(2) + "%";
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function changeClass(change: number, inverseColors = false): string {
  if (change === 0) return "text-muted-foreground";
  const positive = change > 0;
  const good = inverseColors ? !positive : positive;
  return good ? "text-emerald-500" : "text-red-500";
}

export function changeArrow(change: number): string {
  if (change > 0) return "↑";
  if (change < 0) return "↓";
  return "–";
}

export function pctChange(current: number, previous: number): number {
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
}

export function acosColor(acos: number): string {
  if (acos > 100) return "text-red-600 font-bold";
  if (acos > 70) return "text-red-500";
  if (acos > 50) return "text-yellow-600";
  return "text-emerald-600";
}

export function roasColor(roas: number): string {
  if (roas < 1) return "text-red-600 font-bold";
  if (roas < 2) return "text-yellow-600";
  return "text-emerald-600";
}

export function confidenceBadgeVariant(
  level: AISuggestion["confidence"]
): "default" | "secondary" | "outline" {
  if (level === "High") return "default";
  if (level === "Medium") return "secondary";
  return "outline";
}

export function severityColor(severity: string): string {
  switch (severity) {
    case "critical":
      return "border-red-500 bg-red-50 dark:bg-red-950/20";
    case "warning":
      return "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20";
    case "opportunity":
      return "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20";
    default:
      return "border-blue-400 bg-blue-50 dark:bg-blue-950/20";
  }
}

export function severityIcon(severity: string): string {
  switch (severity) {
    case "critical":
      return "🔴";
    case "warning":
      return "🟡";
    case "opportunity":
      return "🟢";
    default:
      return "🔵";
  }
}
