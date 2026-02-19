"use client";

import { useState, useMemo } from "react";
import { Campaign, AISuggestion } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AISuggestionPanel } from "./AISuggestionPanel";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  acosColor,
  roasColor,
  pctChange,
  changeClass,
  changeArrow,
} from "@/lib/format";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Sparkles,
  ChevronRight,
} from "lucide-react";

interface CampaignTableProps {
  campaigns: Campaign[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onSuggestionAction: (
    campaignId: string,
    suggestionId: string,
    action: "approve" | "deny" | "modify",
    note?: string
  ) => void;
}

type SortKey = keyof Campaign;

const COLUMNS: { key: SortKey; label: string; align?: "right"; tooltip?: string }[] = [
  { key: "impressions", label: "Impr.", align: "right" },
  { key: "clicks", label: "Clicks", align: "right" },
  { key: "orders", label: "Orders", align: "right" },
  { key: "sales", label: "Sales", align: "right" },
  { key: "spend", label: "Spend", align: "right" },
  { key: "cpc", label: "CPC", align: "right" },
  { key: "ctr", label: "CTR", align: "right" },
  { key: "acos", label: "ACOS", align: "right", tooltip: "Advertising Cost of Sales" },
  { key: "roas", label: "ROAS", align: "right", tooltip: "Return on Ad Spend" },
];

function SortIcon({ col, sortKey, sortDir }: { col: string; sortKey: string; sortDir: "asc" | "desc" }) {
  if (col !== sortKey) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
  return sortDir === "asc" ? (
    <ChevronUp className="w-3 h-3" />
  ) : (
    <ChevronDown className="w-3 h-3" />
  );
}

function Delta({ current, previous, unit, inverseColors }: {
  current: number;
  previous?: number;
  unit?: string;
  inverseColors?: boolean;
}) {
  if (previous === undefined) return null;
  const pct = pctChange(current, previous);
  if (Math.abs(pct) < 0.1) return null;
  return (
    <span className={`text-[10px] ml-1 ${changeClass(pct, inverseColors)}`}>
      {changeArrow(pct)}{Math.abs(pct).toFixed(0)}%
    </span>
  );
}

export function CampaignTable({
  campaigns,
  selectedIds,
  onSelectionChange,
  onSuggestionAction,
}: CampaignTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("acos");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...campaigns].sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return 0;
    });
  }, [campaigns, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function toggleAll(checked: boolean) {
    if (checked) {
      onSelectionChange(new Set(campaigns.map((c) => c.id)));
    } else {
      onSelectionChange(new Set());
    }
  }

  function toggleOne(id: string, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectionChange(next);
  }

  const allSelected =
    campaigns.length > 0 && campaigns.every((c) => selectedIds.has(c.id));
  const someSelected = !allSelected && campaigns.some((c) => selectedIds.has(c.id));

  return (
    <div className="rounded-xl border bg-background shadow-sm">
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="w-10 pl-4">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  ref={(el) => {
                    if (el) (el as HTMLButtonElement & { indeterminate: boolean }).indeterminate = someSelected;
                  }}
                />
              </TableHead>
              <TableHead className="min-w-[60px]">Status</TableHead>
              <TableHead className="min-w-[260px]">Campaign</TableHead>
              <TableHead className="min-w-[90px]">Budget</TableHead>
              <TableHead className="min-w-[90px]">Strategy</TableHead>
              {COLUMNS.map((col) => (
                <TableHead
                  key={col.key}
                  className={`cursor-pointer select-none whitespace-nowrap ${
                    col.align === "right" ? "text-right" : ""
                  }`}
                  onClick={() => toggleSort(col.key)}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`flex items-center gap-0.5 ${
                          col.align === "right" ? "justify-end" : ""
                        }`}
                      >
                        {col.label}
                        <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />
                      </div>
                    </TooltipTrigger>
                    {col.tooltip && (
                      <TooltipContent>{col.tooltip}</TooltipContent>
                    )}
                  </Tooltip>
                </TableHead>
              ))}
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={COLUMNS.length + 6} className="text-center py-16 text-muted-foreground text-sm">
                  No campaigns match your filters.
                </TableCell>
              </TableRow>
            )}
            {sorted.map((c) => {
              const isSelected = selectedIds.has(c.id);
              const isExpanded = expandedId === c.id;
              const pendingSuggestions = c.aiSuggestions.filter(
                (s) => s.status === "pending"
              );

              return (
                <>
                  <TableRow
                    key={c.id}
                    className={`text-xs transition-colors ${
                      isSelected ? "bg-primary/5" : ""
                    } ${isExpanded ? "border-b-0" : ""}`}
                    data-state={isSelected ? "selected" : undefined}
                  >
                    <TableCell className="pl-4">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(v) => toggleOne(c.id, !!v)}
                      />
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          c.status === "Enabled"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            c.status === "Enabled" ? "bg-emerald-500" : "bg-muted-foreground"
                          }`}
                        />
                        {c.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-medium text-foreground max-w-[230px] truncate" title={c.name}>
                            {c.name}
                          </p>
                          <p className="text-muted-foreground text-[10px]">
                            {c.type} · {c.portfolio}
                          </p>
                        </div>
                        {pendingSuggestions.length > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : c.id)}
                                className="shrink-0"
                              >
                                <Badge className="gap-1 text-[10px] cursor-pointer">
                                  <Sparkles className="w-2.5 h-2.5" />
                                  {pendingSuggestions.length}
                                </Badge>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>View AI suggestions</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono">{formatCurrency(c.dailyBudget)}/day</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{c.biddingStrategy}</span>
                    </TableCell>

                    {/* Metrics */}
                    <TableCell className="text-right font-mono">
                      {formatNumber(c.impressions)}
                      <Delta current={c.impressions} previous={c.prevImpressions} />
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(c.clicks)}
                      <Delta current={c.clicks} previous={c.prevClicks} />
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(c.orders)}
                      <Delta current={c.orders} previous={c.prevOrders} />
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(c.sales)}
                      <Delta current={c.sales} previous={c.prevSales} />
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(c.spend)}
                      <Delta current={c.spend} previous={c.prevSpend} inverseColors />
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatCurrency(c.cpc)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatPercent(c.ctr)}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-semibold ${acosColor(c.acos)}`}>
                      {formatPercent(c.acos)}
                      <Delta current={c.acos} previous={c.prevAcos} inverseColors />
                    </TableCell>
                    <TableCell className={`text-right font-mono font-semibold ${roasColor(c.roas)}`}>
                      {c.roas.toFixed(2)}x
                      <Delta current={c.roas} previous={c.prevRoas} />
                    </TableCell>

                    {/* Expand row */}
                    <TableCell>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : c.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronRight
                          className={`w-4 h-4 transition-transform ${
                            isExpanded ? "rotate-90" : ""
                          }`}
                        />
                      </button>
                    </TableCell>
                  </TableRow>

                  {/* Expanded AI suggestions row */}
                  {isExpanded && (
                    <TableRow key={`${c.id}-expanded`} className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={COLUMNS.length + 6} className="p-4">
                        {c.aiSuggestions.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No AI suggestions for this campaign right now. Performing well! ✓
                          </p>
                        ) : (
                          <div className="space-y-3">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                              AI Suggestions for {c.name}
                            </p>
                            {c.aiSuggestions.map((s) => (
                              <AISuggestionPanel
                                key={s.id}
                                suggestion={s}
                                onAction={(sid, action, note) =>
                                  onSuggestionAction(c.id, sid, action, note)
                                }
                              />
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
