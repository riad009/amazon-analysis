"use client";

import { Campaign } from "@/lib/types";
import { formatCurrency, formatNumber, formatPercent, pctChange, changeClass, changeArrow } from "@/lib/format";
import { TrendingUp, TrendingDown, DollarSign, MousePointerClick, ShoppingCart, BarChart3 } from "lucide-react";

interface PerfSummaryProps {
  campaigns: Campaign[];
}

interface StatCard {
  label: string;
  icon: React.ElementType;
  value: string;
  change?: number;
  colorClass?: string;
}

export function PerfSummary({ campaigns }: PerfSummaryProps) {
  const total = campaigns.reduce(
    (acc, c) => ({
      impressions: acc.impressions + c.impressions,
      clicks: acc.clicks + c.clicks,
      orders: acc.orders + c.orders,
      sales: acc.sales + c.sales,
      spend: acc.spend + c.spend,
      prevSales: acc.prevSales + (c.prevSales ?? 0),
      prevSpend: acc.prevSpend + (c.prevSpend ?? 0),
      prevOrders: acc.prevOrders + (c.prevOrders ?? 0),
    }),
    { impressions: 0, clicks: 0, orders: 0, sales: 0, spend: 0, prevSales: 0, prevSpend: 0, prevOrders: 0 }
  );

  const acos = total.sales > 0 ? (total.spend / total.sales) * 100 : 0;
  const prevAcos = total.prevSales > 0 ? (total.prevSpend / total.prevSales) * 100 : 0;
  const roas = total.spend > 0 ? total.sales / total.spend : 0;

  const stats: StatCard[] = [
    {
      label: "Total Sales",
      icon: DollarSign,
      value: formatCurrency(total.sales),
      change: pctChange(total.sales, total.prevSales),
    },
    {
      label: "Total Spend",
      icon: BarChart3,
      value: formatCurrency(total.spend),
      change: pctChange(total.spend, total.prevSpend),
    },
    {
      label: "Portfolio ACOS",
      icon: TrendingDown,
      value: formatPercent(acos),
      change: pctChange(acos, prevAcos),
      colorClass:
        acos > 80 ? "text-red-600" : acos > 50 ? "text-yellow-600" : "text-emerald-600",
    },
    {
      label: "Portfolio ROAS",
      icon: TrendingUp,
      value: roas.toFixed(2) + "x",
      colorClass: roas < 1 ? "text-red-600" : roas < 2 ? "text-yellow-600" : "text-emerald-600",
    },
    {
      label: "Total Orders",
      icon: ShoppingCart,
      value: formatNumber(total.orders),
      change: pctChange(total.orders, total.prevOrders),
    },
    {
      label: "Total Clicks",
      icon: MousePointerClick,
      value: formatNumber(total.clicks),
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <div
            key={s.label}
            className="rounded-xl border bg-background p-4 shadow-sm flex flex-col gap-1"
          >
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Icon className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium uppercase tracking-wide">{s.label}</span>
            </div>
            <p className={`text-xl font-bold font-mono ${s.colorClass ?? ""}`}>{s.value}</p>
            {s.change !== undefined && Math.abs(s.change) > 0.1 && (
              <p className={`text-[11px] ${changeClass(s.change, s.label.includes("ACOS") || s.label.includes("Spend"))}`}>
                {changeArrow(s.change)} {Math.abs(s.change).toFixed(1)}% vs prev. period
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
