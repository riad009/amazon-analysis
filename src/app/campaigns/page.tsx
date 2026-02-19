"use client";

import { useState, useMemo } from "react";
import { MOCK_CAMPAIGNS, MOCK_CHANGE_EVENTS } from "@/lib/mock-data";
import { Campaign, CampaignFilters, DateRange, DateRangePreset } from "@/lib/types";
import { DateRangePicker } from "@/components/campaigns/DateRangePicker";
import { ProductFilter } from "@/components/campaigns/ProductFilter";
import { CampaignFiltersBar } from "@/components/campaigns/CampaignFiltersBar";
import { CampaignTable } from "@/components/campaigns/CampaignTable";
import { PerfSummary } from "@/components/campaigns/PerfSummary";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { subDays, formatDistanceToNow } from "date-fns";
import { Download, RefreshCcw, Sparkles, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useAICampaignSuggestions } from "@/hooks/useAI";

export default function CampaignsPage() {
  const [preset, setPreset] = useState<DateRangePreset>("7d");
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 6),
    to: new Date(),
  });
  const [selectedProductId, setSelectedProductId] = useState<string | "All">("All");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<CampaignFilters>({
    search: "",
    status: "All",
    minAcos: "",
    maxAcos: "",
    minRoas: "",
    sortBy: "acos",
    sortDir: "desc",
    productId: "All",
  });
  const [campaigns, setCampaigns] = useState<Campaign[]>(MOCK_CAMPAIGNS);
  const [aiError, setAiError] = useState<string | null>(null);

  const { generate, loading: aiLoading, lastGenerated } = useAICampaignSuggestions();

  function handleDateChange(p: DateRangePreset, r: DateRange) {
    setPreset(p);
    setDateRange(r);
  }

  function handleSuggestionAction(
    campaignId: string,
    suggestionId: string,
    action: "approve" | "deny" | "modify",
    note?: string
  ) {
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id !== campaignId
          ? c
          : {
              ...c,
              aiSuggestions: c.aiSuggestions.map((s) =>
                s.id !== suggestionId
                  ? s
                  : {
                      ...s,
                      status:
                        action === "modify"
                          ? "modified"
                          : action === "deny"
                          ? "denied"
                          : "approved",
                      userNote: note,
                    }
              ),
            }
      )
    );
  }

  async function handleGenerateAI() {
    setAiError(null);
    try {
      const suggestionMap = await generate(campaigns, MOCK_CHANGE_EVENTS, dateRange);
      setCampaigns((prev) =>
        prev.map((c) => {
          const newSuggestions = suggestionMap.get(c.id);
          if (!newSuggestions || newSuggestions.length === 0) return c;
          return { ...c, aiSuggestions: newSuggestions };
        })
      );
    } catch (err) {
      setAiError(String(err));
    }
  }

  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      if (
        selectedProductId !== "All" &&
        !c.productIds.includes(selectedProductId)
      )
        return false;
      if (
        filters.search &&
        !c.name.toLowerCase().includes(filters.search.toLowerCase()) &&
        !c.portfolio.toLowerCase().includes(filters.search.toLowerCase())
      )
        return false;
      if (filters.status !== "All" && c.status !== filters.status) return false;
      if (filters.minAcos !== "" && c.acos < Number(filters.minAcos)) return false;
      if (filters.maxAcos !== "" && c.acos > Number(filters.maxAcos)) return false;
      if (filters.minRoas !== "" && c.roas < Number(filters.minRoas)) return false;
      return true;
    });
  }, [campaigns, selectedProductId, filters]);

  const pendingCount = campaigns.reduce(
    (n, c) => n + c.aiSuggestions.filter((s) => s.status === "pending").length,
    0
  );

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="border-b bg-background px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold">Campaigns</h1>
          <p className="text-xs text-muted-foreground">
            Sponsored Products · MR – Pool Test Strips (PTS)
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {pendingCount > 0 && (
            <Badge className="gap-1.5 text-xs">
              <Sparkles className="w-3 h-3" />
              {pendingCount} AI suggestion{pendingCount !== 1 ? "s" : ""} pending
            </Badge>
          )}
          {lastGenerated && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              AI refreshed {formatDistanceToNow(lastGenerated, { addSuffix: true })}
            </span>
          )}
          <Button
            variant="default"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={handleGenerateAI}
            disabled={aiLoading}
          >
            {aiLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {aiLoading ? "Analyzing with Gemini…" : "Refresh AI Suggestions"}
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Download className="w-3.5 h-3.5" />
            CSV
          </Button>
        </div>
      </div>

      {/* AI error banner */}
      {aiError && (
        <div className="mx-6 mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Gemini AI error: {aiError}</span>
          <button
            className="ml-auto underline"
            onClick={() => setAiError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="border-b bg-background/80 backdrop-blur-sm px-6 py-3 flex items-center gap-3 flex-wrap sticky top-0 z-10">
        <DateRangePicker preset={preset} range={dateRange} onPresetChange={handleDateChange} />
        <div className="w-px h-5 bg-border" />
        <ProductFilter selectedProductId={selectedProductId} onChange={setSelectedProductId} />
      </div>

      {/* Body */}
      <div className="flex-1 px-6 py-5 space-y-4">
        <PerfSummary campaigns={filtered} />
        <CampaignFiltersBar
          filters={filters}
          onChange={setFilters}
          selectedCount={selectedIds.size}
          totalCount={filtered.length}
        />
        <CampaignTable
          campaigns={filtered}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onSuggestionAction={handleSuggestionAction}
        />
      </div>
    </div>
  );
}

