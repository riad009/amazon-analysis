"use client";

import { useState, useMemo, Fragment, useRef, useCallback } from "react";
import { useEffect } from "react";
import { Campaign, PlacementMetrics, AISuggestion, BiddingStrategy } from "@/lib/types";
import { CampaignHistoryModal } from "./CampaignHistoryModal";
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
  Wand2,
  Check,
  X,
  Pencil,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Editable Field Types ────────────────────────────────────────────────────

type EditableField = "dailyBudget" | "bid" | "status" | "biddingStrategy";

interface EditState {
  campaignId: string;
  field: EditableField;
  value: string;
  original: string;
  saving: boolean;
  error: string | null;
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface CampaignTableProps {
  campaigns: Campaign[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;

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
  onGenerateAI: (campaignId: string) => void;
  aiLoadingCampaignId: string | null;
  onUpdateCampaign?: (
    campaignId: string,
    field: EditableField,
    value: string | number,
    extra?: { keywordId?: string }
  ) => Promise<{ success: boolean; error?: string }>;
  onApplySuggestion?: (
    campaignId: string,
    field: string,
    value: string | number,
    extra?: { keywordId?: string }
  ) => Promise<{ success: boolean; error?: string }>;
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

// ─── Bidding Strategy Options ────────────────────────────────────────────────

const BIDDING_STRATEGIES: BiddingStrategy[] = [
  "Fixed Bid",
  "Dynamic Bids - Down Only",
  "Dynamic Bids - Up and Down",
];

const BIDDING_SHORT: Record<string, string> = {
  "Fixed Bid": "Fixed",
  "Dynamic Bids - Down Only": "Down Only",
  "Dynamic Bids - Up and Down": "Up & Down",
};

// ─── Component ──────────────────────────────────────────────────────────────

export function CampaignTable({
  campaigns,
  selectedIds,
  onSelectionChange,

  metricsAvailable,
  dateFrom,
  dateTo,
  profileId,
  placementData,
  onSuggestionAction,
  onGenerateAI,
  aiLoadingCampaignId,
  onUpdateCampaign,
  onApplySuggestion,
}: CampaignTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("acos");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [columnFilters, setColumnFilters] = useState<Map<string, ColumnFilterState>>(new Map());
  const [activeFilterCol, setActiveFilterCol] = useState<string | null>(null);

  // ── Edit state ──
  const [editState, setEditState] = useState<EditState | null>(null);

  // ── History modal state ──
  const [historyCampaignId, setHistoryCampaignId] = useState<string | null>(null);
  const [historyCampaignName, setHistoryCampaignName] = useState<string>("");
  const [historyOpen, setHistoryOpen] = useState(false);

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

  // ── Edit handlers ──

  function startEdit(campaignId: string, field: EditableField, currentValue: string) {
    if (editState?.saving) return; // Don't allow switching while saving
    setEditState({
      campaignId,
      field,
      value: currentValue,
      original: currentValue,
      saving: false,
      error: null,
    });
  }

  function cancelEdit() {
    if (editState?.saving) return;
    setEditState(null);
  }

  function updateEditValue(value: string) {
    if (!editState) return;
    setEditState({ ...editState, value, error: null });
  }

  function validateEdit(): string | null {
    if (!editState) return "No edit in progress";
    const { field, value } = editState;

    if (field === "dailyBudget") {
      const n = Number(value);
      if (isNaN(n) || value.trim() === "") return "Budget is required";
      if (n <= 0) return "Budget must be > $0";
      return null;
    }
    if (field === "bid") {
      const n = Number(value);
      if (isNaN(n) || value.trim() === "") return "Bid is required";
      if (n < 0.02) return "Bid must be ≥ $0.02";
      return null;
    }
    // status and biddingStrategy are selected from predefined options, always valid
    return null;
  }

  async function saveEdit() {
    if (!editState || !onUpdateCampaign) return;
    const validationError = validateEdit();
    if (validationError) {
      setEditState({ ...editState, error: validationError });
      return;
    }

    // Don't save if value unchanged
    if (editState.value === editState.original) {
      setEditState(null);
      return;
    }

    setEditState({ ...editState, saving: true, error: null });

    const campaign = campaigns.find((c) => c.id === editState.campaignId);
    const extra = editState.field === "bid" ? { keywordId: campaign?.keywordId } : undefined;
    const value = (editState.field === "dailyBudget" || editState.field === "bid")
      ? Number(editState.value)
      : editState.value;

    try {
      const result = await onUpdateCampaign(editState.campaignId, editState.field, value, extra);
      if (result.success) {
        setEditState(null);
      } else {
        setEditState({ ...editState, saving: false, error: result.error || "Update failed" });
      }
    } catch (err) {
      setEditState({ ...editState, saving: false, error: String(err) });
    }
  }

  function isEditing(campaignId: string, field: EditableField): boolean {
    return editState?.campaignId === campaignId && editState?.field === field;
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

  // ── Editable cell renderers ──

  function EditableNumberCell({
    campaignId, field, value, prefix = "$"
  }: {
    campaignId: string; field: EditableField; value: number; prefix?: string;
  }) {
    const editing = isEditing(campaignId, field);
    const canEdit = !!onUpdateCampaign;

    if (editing && editState) {
      return (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <div className="relative">
            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">{prefix}</span>
            <input
              type="number"
              step="0.01"
              min={field === "bid" ? "0.02" : "0.01"}
              value={editState.value}
              onChange={(e) => updateEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") cancelEdit();
              }}
              autoFocus
              disabled={editState.saving}
              className={`w-[80px] h-6 text-xs font-mono pl-4 pr-1 rounded border bg-background focus:outline-none focus:ring-1 focus:ring-primary ${editState.error ? "border-red-400 focus:ring-red-400" : "border-input"
                } ${editState.saving ? "opacity-50" : ""}`}
            />
          </div>
          {editState.saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          ) : (
            <>
              <button onClick={saveEdit} className="text-emerald-600 hover:text-emerald-700" title="Save">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground" title="Cancel">
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {editState.error && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-red-500 text-[9px]">!</span>
              </TooltipTrigger>
              <TooltipContent className="text-red-600 text-xs">{editState.error}</TooltipContent>
            </Tooltip>
          )}
        </div>
      );
    }

    return (
      <span
        className={`font-mono ${canEdit ? "group/edit cursor-pointer hover:text-primary transition-colors" : ""} ${field === "bid" && value > 0 ? "font-semibold text-emerald-600" : ""
          }`}
        onClick={canEdit ? () => startEdit(campaignId, field, String(value)) : undefined}
        title={canEdit ? "Click to edit" : undefined}
      >
        {field === "bid" && value <= 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <>
            {formatCurrency(value)}
            {canEdit && (
              <Pencil className="w-2.5 h-2.5 ml-1 inline opacity-0 group-hover/edit:opacity-50 transition-opacity" />
            )}
          </>
        )}
      </span>
    );
  }

  function EditableStatusCell({ campaignId, campaign }: { campaignId: string; campaign: Campaign }) {
    const editing = isEditing(campaignId, "status");
    const canEdit = !!onUpdateCampaign;

    if (editing && editState) {
      return (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <select
            value={editState.value}
            onChange={async (e) => {
              const newVal = e.target.value;
              if (newVal === editState.original) {
                setEditState(null);
                return;
              }
              setEditState({ ...editState, value: newVal, saving: true });
              if (onUpdateCampaign) {
                const result = await onUpdateCampaign(campaignId, "status", newVal);
                if (result.success) {
                  setEditState(null);
                } else {
                  setEditState({ ...editState, value: newVal, saving: false, error: result.error || "Failed" });
                }
              }
            }}
            autoFocus
            disabled={editState.saving}
            className="h-6 text-xs rounded border border-input bg-background px-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="Enabled">Enabled</option>
            <option value="Paused">Paused</option>
          </select>
          {editState.saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          ) : (
            <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground" title="Cancel">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      );
    }

    return (
      <span
        className={`inline-flex items-center gap-0.5 ${campaign.status === "Enabled" ? "text-emerald-600" : "text-muted-foreground"} ${canEdit ? "cursor-pointer hover:opacity-70 transition-opacity" : ""}`}
        onClick={canEdit ? () => startEdit(campaignId, "status", campaign.status) : undefined}
        title={canEdit ? "Click to change status" : undefined}
      >
        <span className={`w-1.5 h-1.5 rounded-full inline-block ${campaign.status === "Enabled" ? "bg-emerald-500" : "bg-muted-foreground"}`} />
        {campaign.status}
        {canEdit && <Pencil className="w-2 h-2 ml-0.5 opacity-0 group-hover/status:opacity-40" />}
      </span>
    );
  }

  function EditableBiddingCell({ campaignId, campaign }: { campaignId: string; campaign: Campaign }) {
    const editing = isEditing(campaignId, "biddingStrategy");
    const canEdit = !!onUpdateCampaign;

    if (editing && editState) {
      return (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <select
            value={editState.value}
            onChange={async (e) => {
              const newVal = e.target.value;
              if (newVal === editState.original) {
                setEditState(null);
                return;
              }
              setEditState({ ...editState, value: newVal, saving: true });
              if (onUpdateCampaign) {
                const result = await onUpdateCampaign(campaignId, "biddingStrategy", newVal);
                if (result.success) {
                  setEditState(null);
                } else {
                  setEditState({ ...editState, value: newVal, saving: false, error: result.error || "Failed" });
                }
              }
            }}
            autoFocus
            disabled={editState.saving}
            className="h-6 text-xs rounded border border-input bg-background px-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {BIDDING_STRATEGIES.map((s) => (
              <option key={s} value={s}>{BIDDING_SHORT[s]}</option>
            ))}
          </select>
          {editState.saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          ) : (
            <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground" title="Cancel">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      );
    }

    return (
      <span
        className={`text-muted-foreground whitespace-nowrap ${canEdit ? "cursor-pointer hover:text-foreground transition-colors" : ""}`}
        onClick={canEdit ? () => startEdit(campaignId, "biddingStrategy", campaign.biddingStrategy) : undefined}
        title={canEdit ? "Click to change bidding strategy" : undefined}
      >
        {BIDDING_SHORT[campaign.biddingStrategy] ?? campaign.biddingStrategy}
        {canEdit && <Pencil className="w-2 h-2 ml-0.5 inline opacity-0 group-hover:opacity-40" />}
      </span>
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
                        <p className="text-muted-foreground text-[10px] group/status">
                          {c.type} ·{" "}
                          <EditableStatusCell campaignId={c.id} campaign={c} />
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

                    {/* 4. Budget — EDITABLE */}
                    <TableCell className="text-right">
                      <EditableNumberCell campaignId={c.id} field="dailyBudget" value={c.dailyBudget} />
                    </TableCell>

                    {/* 5. Bidding — EDITABLE */}
                    <TableCell>
                      <EditableBiddingCell campaignId={c.id} campaign={c} />
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

                    {/* 9. Bid — EDITABLE */}
                    <TableCell className="text-right">
                      <EditableNumberCell campaignId={c.id} field="bid" value={c.bid} />
                    </TableCell>

                    {/* 10. CPC */}
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatCurrency(c.cpc)}
                    </TableCell>

                    {/* 11. Clicks */}
                    <TableCell className="text-right font-mono">
                      <>{formatNumber(c.clicks)}<Delta current={c.clicks} previous={c.prevClicks} /></>
                    </TableCell>

                    {/* 12. Orders */}
                    <TableCell className="text-right font-mono">
                      <>{formatNumber(c.orders)}<Delta current={c.orders} previous={c.prevOrders} /></>
                    </TableCell>

                    {/* 13. ACOS */}
                    <TableCell className={`text-right font-mono font-semibold ${acosColor(c.acos)}`}>
                      <>{formatPercent(c.acos)}<Delta current={c.acos} previous={c.prevAcos} inverseColors /></>
                    </TableCell>

                    {/* 14. Conversion */}
                    <TableCell className="text-right font-mono">
                      {formatPercent(c.conversion)}
                    </TableCell>

                    {/* 15. Spend */}
                    <TableCell className="text-right font-mono">
                      <>{formatCurrency(c.spend)}<Delta current={c.spend} previous={c.prevSpend} inverseColors /></>
                    </TableCell>

                    {/* 16. Sales */}
                    <TableCell className="text-right font-mono">
                      <>{formatCurrency(c.sales)}<Delta current={c.sales} previous={c.prevSales} /></>
                    </TableCell>

                    {/* 17. Impressions */}
                    <TableCell className="text-right font-mono">
                      <>{formatNumber(c.impressions)}<Delta current={c.impressions} previous={c.prevImpressions} /></>
                    </TableCell>

                    {/* 18. Units */}
                    <TableCell className="text-right font-mono">
                      {formatNumber(c.units)}
                    </TableCell>

                    {/* 19. CTR */}
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatPercent(c.ctr)}
                    </TableCell>

                    {/* 20. ROAS */}
                    <TableCell className={`text-right font-mono font-semibold ${roasColor(c.roas)}`}>
                      <>{c.roas.toFixed(2)}x<Delta current={c.roas} previous={c.prevRoas} /></>
                    </TableCell>

                    {/* 21. History */}
                    <TableCell>
                      <button
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="View history"
                        onClick={() => {
                          setHistoryCampaignId(c.id);
                          setHistoryCampaignName(c.name);
                          setHistoryOpen(true);
                        }}
                      >
                        <History className="w-3.5 h-3.5" />
                      </button>
                    </TableCell>

                    {/* 22. AI Suggestion / Expand */}
                    <TableCell>
                      {aiLoadingCampaignId === c.id ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1.5 pointer-events-none"
                          disabled
                        >
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                          <span className="text-muted-foreground">Analyzing…</span>
                        </Button>
                      ) : pendingSuggestions.length > 0 ? (
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
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5 border-primary/30 hover:border-primary hover:bg-primary/5 transition-all"
                          onClick={() => onGenerateAI(c.id)}
                          disabled={!!aiLoadingCampaignId}
                        >
                          <Wand2 className="w-3 h-3 text-primary" />
                          AI Suggest
                        </Button>
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
                                  campaign={c}
                                  onAction={(sid, action, note) =>
                                    onSuggestionAction(c.id, sid, action, note)
                                  }
                                  onApply={onApplySuggestion ? async (suggestion) => {
                                    const fieldMap: Record<string, string> = {
                                      raise_bid: "bid",
                                      lower_bid: "bid",
                                      increase_budget: "dailyBudget",
                                      decrease_budget: "dailyBudget",
                                      pause_campaign: "status",
                                      enable_campaign: "status",
                                    };
                                    const field = fieldMap[suggestion.type];
                                    let value: string | number = suggestion.recommendedValue!;
                                    if (suggestion.type === "pause_campaign") value = "PAUSED";
                                    if (suggestion.type === "enable_campaign") value = "ENABLED";
                                    if (!field) return { success: false, error: "Unsupported action type" };
                                    return onApplySuggestion(c.id, field, value);
                                  } : undefined}
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

      {/* Campaign History Modal */}
      <CampaignHistoryModal
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        campaignId={historyCampaignId || ""}
        campaignName={historyCampaignName}
        profileId={profileId || ""}
      />
    </div>
  );
}
