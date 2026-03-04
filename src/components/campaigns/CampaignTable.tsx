"use client";

import { useState, useMemo, Fragment, useRef, useCallback } from "react";
import { Campaign, PlacementMetrics, AISuggestion } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
import { PlacementBreakdown } from "./PlacementBreakdown";
import {
  ColumnFilterTrigger,
  ColumnFilterDropdown,
  CheckboxColumnFilter,
  NumericColumnFilter,
  applyColumnFilters,
  ColumnFilterState,
  NumericFilterState,
} from "./ColumnFilter";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  acosColor,
  roasColor,
} from "@/lib/format";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  TrendingUp,
  Loader2,
} from "lucide-react";

interface CampaignTableProps {
  campaigns: Campaign[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  metricsLoading?: boolean;
  metricsAvailable?: boolean;
  dateFrom?: string;
  dateTo?: string;
  profileId?: string;
  placementData?: Record<string, PlacementMetrics[]>;
  onSuggestionAction: (
    campaignId: string,
    suggestionId: string,
    action: "approve" | "deny" | "modify",
    note?: string
  ) => void;
}

function MetricSpinner() {
  return <span className="text-[10px] text-muted-foreground whitespace-nowrap">Loading...</span>;
}

function MetricDash() {
  return <span className="text-muted-foreground">—</span>;
}

type SortKey = keyof Campaign;

// Exact column order:
// Portfolio | Campaign | Keyword | Budget | Bidding | TOS IS | Placement | Placement Bid | Bid |
// CPC | Clicks | Orders | ACOS | Conversion | Spend | Sales | Impressions | Units | CTR | ROAS

function SortIcon({ col, sortKey, sortDir }: { col: string; sortKey: string; sortDir: "asc" | "desc" }) {
  if (col !== sortKey) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
  return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
}

function Delta({ current, previous, unit, inverseColors }: {
  current: number;
  previous?: number;
  unit?: string;
  inverseColors?: boolean;
}) {
  if (previous == null || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return null;
  const isPositive = pct > 0;
  const color = inverseColors
    ? isPositive ? "text-red-500" : "text-emerald-500"
    : isPositive ? "text-emerald-500" : "text-red-500";
  const arrow = isPositive ? "↑" : "↓";
  return (
    <span className={`text-[9px] ml-0.5 ${color}`}>
      {arrow}{Math.abs(pct).toFixed(0)}%
    </span>
  );
}

// Total column count for colSpan
const TOTAL_COLS = 23; // checkbox + 20 data cols + history + expand

export function CampaignTable({
  campaigns,
  selectedIds,
  onSelectionChange,
  metricsLoading,
  metricsAvailable,
  dateFrom,
  dateTo,
  profileId,
  placementData,
  onSuggestionAction,
}: CampaignTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("acos");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [columnFilters, setColumnFilters] = useState<Map<string, ColumnFilterState>>(new Map());
  const [activeFilterCol, setActiveFilterCol] = useState<string | null>(null);

  // ── Internal horizontal scroll tracking ──
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [clientWidth, setClientWidth] = useState(0);
  const isSyncing = useRef(false);
  const roRef = useRef<ResizeObserver | null>(null);

  const attachScrollRef = useCallback((el: HTMLDivElement | null) => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    scrollContainerRef.current = el;
    if (!el) { setScrollWidth(0); setClientWidth(0); return; }
    const update = () => { setScrollWidth(el.scrollWidth); setClientWidth(el.clientWidth); };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    roRef.current = ro;
  }, []);

  const syncBottomToTable = useCallback(() => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    if (bottomScrollRef.current && scrollContainerRef.current)
      bottomScrollRef.current.scrollLeft = scrollContainerRef.current.scrollLeft;
    requestAnimationFrame(() => { isSyncing.current = false; });
  }, []);

  const syncTableToBottom = useCallback(() => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    if (scrollContainerRef.current && bottomScrollRef.current)
      scrollContainerRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
    requestAnimationFrame(() => { isSyncing.current = false; });
  }, []);

  const scrollBy = useCallback((px: number) => {
    scrollContainerRef.current?.scrollBy({ left: px, behavior: 'smooth' });
  }, []);

  const showBottomNav = scrollWidth > clientWidth;

  // Apply column filters then sort
  const filtered = useMemo(() => applyColumnFilters(campaigns, columnFilters), [campaigns, columnFilters]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function toggleAll(checked: boolean) {
    onSelectionChange(
      checked ? new Set(campaigns.map((c) => c.id)) : new Set()
    );
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

  // Column filter configuration — which columns are filterable and what type
  const checkboxFilterCols = new Set(["placement", "biddingStrategy", "status"]);
  const numericFilterCols = new Set(["impressions", "clicks", "orders", "units", "spend", "sales", "acos", "roas", "cpc", "ctr", "conversion", "dailyBudget", "bid", "tosIS"]);

  function getUniqueValues(key: string): string[] {
    const vals = new Set<string>();
    campaigns.forEach((c) => {
      const v = c[key as keyof Campaign];
      if (v != null && v !== "") vals.add(String(v));
    });
    return Array.from(vals).sort();
  }

  function setColFilter(key: string, filter: ColumnFilterState | null) {
    setColumnFilters((prev) => {
      const next = new Map(prev);
      if (filter) next.set(key, filter);
      else next.delete(key);
      return next;
    });
  }

  // sortable header helper
  function SortableHead({ sortKey: sk, label, align, tooltip, minW }: {
    sortKey: SortKey; label: string; align?: "right"; tooltip?: string; minW?: string;
  }) {
    const headRef = useRef<HTMLTableCellElement>(null);
    const isCheckbox = checkboxFilterCols.has(sk);
    const isNumeric = numericFilterCols.has(sk);
    const isFilterable = isCheckbox || isNumeric;
    const hasActiveFilter = columnFilters.has(sk);
    const isOpen = activeFilterCol === sk;

    return (
      <TableHead
        ref={headRef}
        className={`cursor-pointer select-none whitespace-nowrap relative ${align === "right" ? "text-right" : ""} ${minW ? `min-w-[${minW}]` : ""}`}
        onClick={() => toggleSort(sk)}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center gap-0.5 ${align === "right" ? "justify-end" : ""}`}>
              {label}
              <SortIcon col={sk} sortKey={sortKey} sortDir={sortDir} />
              {isFilterable && (
                <ColumnFilterTrigger
                  isActive={hasActiveFilter}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveFilterCol(isOpen ? null : sk);
                  }}
                />
              )}
            </div>
          </TooltipTrigger>
          {tooltip && <TooltipContent>{tooltip}</TooltipContent>}
        </Tooltip>
        {isFilterable && (
          <ColumnFilterDropdown open={isOpen} onClose={() => setActiveFilterCol(null)} anchorRef={headRef}>
            {isCheckbox && (
              <CheckboxColumnFilter
                options={getUniqueValues(sk)}
                current={columnFilters.get(sk)?.type === "checkbox" ? (columnFilters.get(sk) as any).selected : new Set()}
                onApply={(selected) => setColFilter(sk, { type: "checkbox", selected })}
                onRemove={() => setColFilter(sk, null)}
                onClose={() => setActiveFilterCol(null)}
              />
            )}
            {isNumeric && (
              <NumericColumnFilter
                current={columnFilters.get(sk)?.type === "numeric" ? (columnFilters.get(sk) as NumericFilterState) : undefined}
                onApply={(state) => setColFilter(sk, state)}
                onRemove={() => setColFilter(sk, null)}
                onClose={() => setActiveFilterCol(null)}
              />
            )}
          </ColumnFilterDropdown>
        )}
      </TableHead>
    );
  }

  return (
    <div className="flex-1 min-h-0 rounded-xl border bg-background shadow-sm flex flex-col">
      <div ref={attachScrollRef} onScroll={syncBottomToTable} className="flex-1 overflow-x-scroll overflow-y-scroll scrollbar-thin" style={{ scrollbarGutter: "stable" }}>
        <Table className="min-w-[1800px]">
          <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
            <TableRow className="text-xs">
              {/* Checkbox */}
              <TableHead className="w-10 pl-4">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  ref={(el) => {
                    if (el) (el as HTMLButtonElement & { indeterminate: boolean }).indeterminate = someSelected;
                  }}
                />
              </TableHead>
              <SortableHead sortKey="portfolio" label="Portfolio" />
              <SortableHead sortKey="name" label="Campaign" minW="220px" />
              <SortableHead sortKey="keyword" label="Keyword" />
              <SortableHead sortKey="dailyBudget" label="Budget" align="right" />
              <SortableHead sortKey="biddingStrategy" label="Bidding" />
              <SortableHead sortKey="tosIS" label="TOS IS" align="right" tooltip="Top of Search Impression Share" />
              <SortableHead sortKey="placement" label="Placement" />
              <SortableHead sortKey="placementBidTOS" label="Placement Bid" align="right" tooltip="Top of Search / Product Page bid adjustment %" />
              <SortableHead sortKey="bid" label="Bid" align="right" />
              <SortableHead sortKey="cpc" label="CPC" align="right" />
              <SortableHead sortKey="clicks" label="Clicks" align="right" />
              <SortableHead sortKey="orders" label="Orders" align="right" />
              <SortableHead sortKey="acos" label="ACOS" align="right" tooltip="Advertising Cost of Sales" />
              <SortableHead sortKey="conversion" label="Conversion" align="right" />
              <SortableHead sortKey="spend" label="Spend" align="right" />
              <SortableHead sortKey="sales" label="Sales" align="right" />
              <SortableHead sortKey="impressions" label="Impressions" align="right" />
              <SortableHead sortKey="units" label="Units" align="right" />
              <SortableHead sortKey="ctr" label="CTR" align="right" />
              <SortableHead sortKey="roas" label="ROAS" align="right" tooltip="Return on Ad Spend" />
              <TableHead className="whitespace-nowrap">History</TableHead>
              <TableHead className="whitespace-nowrap">AI Suggestion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={TOTAL_COLS} className="text-center py-16 text-muted-foreground text-sm">
                  No campaigns match your filters.
                </TableCell>
              </TableRow>
            )}
            {sorted.map((c) => {
              const isSelected = selectedIds.has(c.id);
              const isExpanded = expandedId === c.id;
              const pendingSuggestions = c.aiSuggestions.filter(
                (s: AISuggestion) => s.status === "pending"
              );

              return (
                <Fragment key={c.id}>
                  <TableRow
                    className={`text-xs transition-colors ${isSelected ? "bg-primary/5" : ""} ${isExpanded ? "border-b-0" : ""}`}
                    data-state={isSelected ? "selected" : undefined}
                  >
                    {/* Checkbox */}
                    <TableCell className="pl-4">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(v) => toggleOne(c.id, !!v)}
                      />
                    </TableCell>

                    {/* 1. Portfolio */}
                    <TableCell className="whitespace-nowrap">
                      <span className="text-muted-foreground text-[11px]">{c.portfolio || "—"}</span>
                    </TableCell>

                    {/* 2. Campaign */}
                    <TableCell>
                      <div className="min-w-[200px]">
                        <p className="font-medium text-foreground max-w-[230px] truncate" title={c.name}>
                          {c.name}
                        </p>
                        <p className="text-muted-foreground text-[10px]">
                          {c.type} ·{" "}
                          <span className={`inline-flex items-center gap-0.5 ${c.status === "Enabled" ? "text-emerald-600" : "text-muted-foreground"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full inline-block ${c.status === "Enabled" ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                            {c.status}
                          </span>
                        </p>
                      </div>
                    </TableCell>

                    {/* 3. Keyword */}
                    <TableCell className="max-w-[180px]">
                      <span className="text-xs truncate block" title={c.keyword}>
                        {c.keyword
                          ? (c.keyword.length > 28 ? c.keyword.slice(0, 28) + "…" : c.keyword)
                          : <span className="text-muted-foreground">—</span>
                        }
                      </span>
                    </TableCell>

                    {/* 4. Budget */}
                    <TableCell className="text-right">
                      <span className="font-mono">{formatCurrency(c.dailyBudget)}</span>
                    </TableCell>

                    {/* 5. Bidding */}
                    <TableCell>
                      <span className="text-muted-foreground whitespace-nowrap">
                        {c.biddingStrategy === "Fixed Bid" ? "Fixed" : c.biddingStrategy === "Dynamic Bids - Down Only" ? "Down Only" : "Up & Down"}
                      </span>
                    </TableCell>

                    {/* 6. TOS IS */}
                    <TableCell className="text-right">
                      {c.tosIS > 0 ? (
                        <span className="font-mono">
                          {c.tosIS.toFixed(1)}%
                          <TrendingUp className="w-3 h-3 inline ml-0.5 text-emerald-500" />
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* 7. Placement */}
                    <TableCell>
                      {c.placement ? (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : c.id)}
                          className="group flex items-center gap-1 cursor-pointer"
                          title="Click to view placement breakdown"
                        >
                          <Badge
                            variant={c.placement === "TOS" ? "default" : "secondary"}
                            className="text-[10px] group-hover:ring-2 group-hover:ring-primary/30 transition-all"
                          >
                            {c.placement}
                          </Badge>
                          <ChevronDown
                            className={`w-3 h-3 text-muted-foreground group-hover:text-foreground transition-all ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* 8. Placement Bid */}
                    <TableCell className="text-right">
                      {c.placementBidTOS > 0 || c.placementBidPP > 0 ? (
                        <div className="font-mono text-xs font-semibold text-emerald-600">
                          {c.placementBidTOS > 0 && <div title="Top of Search">${(c.bid * (1 + c.placementBidTOS / 100)).toFixed(2)}</div>}
                          {c.placementBidPP > 0 && <div title="Product Pages">${(c.bid * (1 + c.placementBidPP / 100)).toFixed(2)}</div>}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* 9. Bid */}
                    <TableCell className="text-right">
                      {c.bid > 0 ? (
                        <span className="font-mono font-semibold text-emerald-600">{formatCurrency(c.bid)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* 10. CPC */}
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {!metricsAvailable ? <MetricSpinner /> : formatCurrency(c.cpc)}
                    </TableCell>

                    {/* 11. Clicks */}
                    <TableCell className="text-right font-mono">
                      {!metricsAvailable ? <MetricSpinner /> : <>{formatNumber(c.clicks)}<Delta current={c.clicks} previous={c.prevClicks} /></>}
                    </TableCell>

                    {/* 12. Orders */}
                    <TableCell className="text-right font-mono">
                      {!metricsAvailable ? <MetricSpinner /> : <>{formatNumber(c.orders)}<Delta current={c.orders} previous={c.prevOrders} /></>}
                    </TableCell>

                    {/* 13. ACOS */}
                    <TableCell className={`text-right font-mono font-semibold ${!metricsAvailable ? "" : acosColor(c.acos)}`}>
                      {!metricsAvailable ? <MetricSpinner /> : <>{formatPercent(c.acos)}<Delta current={c.acos} previous={c.prevAcos} inverseColors /></>}
                    </TableCell>

                    {/* 14. Conversion */}
                    <TableCell className="text-right font-mono">
                      {!metricsAvailable ? <MetricSpinner /> : formatPercent(c.conversion)}
                    </TableCell>

                    {/* 15. Spend */}
                    <TableCell className="text-right font-mono">
                      {!metricsAvailable ? <MetricSpinner /> : <>{formatCurrency(c.spend)}<Delta current={c.spend} previous={c.prevSpend} inverseColors /></>}
                    </TableCell>

                    {/* 16. Sales */}
                    <TableCell className="text-right font-mono">
                      {!metricsAvailable ? <MetricSpinner /> : <>{formatCurrency(c.sales)}<Delta current={c.sales} previous={c.prevSales} /></>}
                    </TableCell>

                    {/* 17. Impressions */}
                    <TableCell className="text-right font-mono">
                      {!metricsAvailable ? <MetricSpinner /> : <>{formatNumber(c.impressions)}<Delta current={c.impressions} previous={c.prevImpressions} /></>}
                    </TableCell>

                    {/* 18. Units */}
                    <TableCell className="text-right font-mono">
                      {!metricsAvailable ? <MetricSpinner /> : formatNumber(c.units)}
                    </TableCell>

                    {/* 19. CTR */}
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {!metricsAvailable ? <MetricSpinner /> : formatPercent(c.ctr)}
                    </TableCell>

                    {/* 20. ROAS */}
                    <TableCell className={`text-right font-mono font-semibold ${!metricsAvailable ? "" : roasColor(c.roas)}`}>
                      {!metricsAvailable ? <MetricSpinner /> : <>{c.roas.toFixed(2)}x<Delta current={c.roas} previous={c.prevRoas} /></>}
                    </TableCell>

                    {/* 21. History */}
                    <TableCell>
                      <button
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="View history"
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                      </button>
                    </TableCell>

                    {/* 22. AI Suggestion / Expand */}
                    <TableCell>
                      {pendingSuggestions.length > 0 ? (
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
                      ) : (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : c.id)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ChevronRight
                            className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>

                  {/* Expanded row: Placement Breakdown + AI suggestions */}
                  {isExpanded && (
                    <TableRow key={`${c.id}-expanded`} className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={TOTAL_COLS} className="p-4">
                        <div className="space-y-4">
                          {/* Placement Breakdown */}
                          {dateFrom && dateTo && (
                            <PlacementBreakdown
                              campaignId={c.id}
                              campaignName={c.name}
                              fromDate={dateFrom}
                              toDate={dateTo}
                              profileId={profileId}
                              preloadedData={placementData?.[c.id]}
                            />
                          )}

                          {/* AI Suggestions */}
                          {c.aiSuggestions.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              No AI suggestions for this campaign right now. Performing well! ✓
                            </p>
                          ) : (
                            <div className="space-y-3">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                AI Suggestions for {c.name}
                              </p>
                              {c.aiSuggestions.map((s: AISuggestion) => (
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
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Bottom horizontal navigation — always visible */}
      {showBottomNav && (
        <div className="shrink-0 flex items-center border-t">
          <button
            onClick={() => scrollBy(-300)}
            className="shrink-0 px-2 py-1.5 hover:bg-muted transition-colors border-r"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <div
            ref={bottomScrollRef}
            onScroll={syncTableToBottom}
            className="flex-1 overflow-x-auto"
            style={{ height: '14px' }}
          >
            <div style={{ width: scrollWidth, height: 1 }} />
          </div>
          <button
            onClick={() => scrollBy(300)}
            className="shrink-0 px-2 py-1.5 hover:bg-muted transition-colors border-l"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      )}
    </div>
  );
}
