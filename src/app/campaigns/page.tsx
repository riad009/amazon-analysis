"use client";

import { useState, useMemo } from "react";
import { MOCK_CHANGE_EVENTS } from "@/lib/mock-data";
import { Campaign, CampaignFilters, DateRange, DateRangePreset } from "@/lib/types";
import { DateRangePicker } from "@/components/campaigns/DateRangePicker";
import { ProductFilter } from "@/components/campaigns/ProductFilter";
import { CampaignFiltersBar } from "@/components/campaigns/CampaignFiltersBar";
import { CampaignTable } from "@/components/campaigns/CampaignTable";
import { PerfSummary } from "@/components/campaigns/PerfSummary";
import { CampaignTableSkeleton, PerfSummarySkeleton } from "@/components/campaigns/CampaignTableSkeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { subDays, formatDistanceToNow } from "date-fns";
import {
  Download,
  RefreshCcw,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Wifi,
  WifiOff,
  Database,
} from "lucide-react";
import { useAICampaignSuggestions } from "@/hooks/useAI";
import { useAmazonCampaigns, DataSource } from "@/hooks/useAmazonCampaigns";
import { useAmazonProducts } from "@/hooks/useAmazonProducts";

function SourceBadge({ source }: { source: DataSource }) {
  if (source === "live") {
    return (
      <Badge
        variant="default"
        className="gap-1.5 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white"
      >
        <Wifi className="w-3 h-3" />
        Live API
      </Badge>
    );
  }
  if (source === "mock") {
    return (
      <Badge variant="secondary" className="gap-1.5 text-[10px]">
        <Database className="w-3 h-3" />
        Demo Data
      </Badge>
    );
  }
  if (source === "error") {
    return (
      <Badge variant="destructive" className="gap-1.5 text-[10px]">
        <WifiOff className="w-3 h-3" />
        API Error
      </Badge>
    );
  }
  return null;
}

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

  // Live API data hooks
  const {
    campaigns: rawCampaigns,
    loading: campaignsLoading,
    error: campaignsError,
    dataSource,
    refresh,
    lastFetched,
  } = useAmazonCampaigns(dateRange);

  const { products } = useAmazonProducts();

  // Local campaign state (with AI suggestions merged in)
  const [campaignOverrides, setCampaignOverrides] = useState<
    Map<string, Partial<Campaign>>
  >(new Map());

  // Merge raw API data with local overrides (AI suggestions, etc.)
  const campaigns = useMemo(() => {
    return rawCampaigns.map((c) => {
      const override = campaignOverrides.get(c.id);
      return override ? { ...c, ...override } : c;
    });
  }, [rawCampaigns, campaignOverrides]);

  const [aiError, setAiError] = useState<string | null>(null);

  const {
    generate,
    loading: aiLoading,
    lastGenerated,
  } = useAICampaignSuggestions();

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
    setCampaignOverrides((prev) => {
      const next = new Map(prev);
      const campaign = campaigns.find((c) => c.id === campaignId);
      if (!campaign) return prev;

      const updatedSuggestions = campaign.aiSuggestions.map((s) =>
        s.id !== suggestionId
          ? s
          : {
            ...s,
            status:
              action === "modify"
                ? ("modified" as const)
                : action === "deny"
                  ? ("denied" as const)
                  : ("approved" as const),
            userNote: note,
          }
      );

      next.set(campaignId, { aiSuggestions: updatedSuggestions });
      return next;
    });
  }

  async function handleGenerateAI() {
    setAiError(null);
    try {
      const suggestionMap = await generate(
        campaigns,
        MOCK_CHANGE_EVENTS,
        dateRange
      );
      setCampaignOverrides((prev) => {
        const next = new Map(prev);
        for (const [campaignId, suggestions] of suggestionMap) {
          if (suggestions.length > 0) {
            next.set(campaignId, { aiSuggestions: suggestions });
          }
        }
        return next;
      });
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
      if (filters.minAcos !== "" && c.acos < Number(filters.minAcos))
        return false;
      if (filters.maxAcos !== "" && c.acos > Number(filters.maxAcos))
        return false;
      if (filters.minRoas !== "" && c.roas < Number(filters.minRoas))
        return false;
      return true;
    });
  }, [campaigns, selectedProductId, filters]);

  const pendingCount = campaigns.reduce(
    (n, c) =>
      n + c.aiSuggestions.filter((s) => s.status === "pending").length,
    0
  );

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="border-b bg-background px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold">Campaigns</h1>
            <SourceBadge source={dataSource} />
          </div>
          <p className="text-xs text-muted-foreground">
            Sponsored Products · MR – Pool Test Strips (PTS)
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {pendingCount > 0 && (
            <Badge className="gap-1.5 text-xs">
              <Sparkles className="w-3 h-3" />
              {pendingCount} AI suggestion{pendingCount !== 1 ? "s" : ""}{" "}
              pending
            </Badge>
          )}
          {lastGenerated && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              AI refreshed{" "}
              {formatDistanceToNow(lastGenerated, { addSuffix: true })}
            </span>
          )}
          <Button
            variant="default"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={handleGenerateAI}
            disabled={aiLoading || campaignsLoading}
          >
            {aiLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {aiLoading ? "Analyzing with Gemini…" : "Refresh AI Suggestions"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={refresh}
            disabled={campaignsLoading}
          >
            {campaignsLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="w-3.5 h-3.5" />
            )}
            Refresh Data
          </Button>
          {lastFetched && (
            <span className="text-[10px] text-muted-foreground">
              Updated{" "}
              {formatDistanceToNow(lastFetched, { addSuffix: true })}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </Button>
        </div>
      </div>

      {/* API error banner */}
      {campaignsError && (
        <div className="mx-6 mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            Amazon API unavailable — showing demo data. {campaignsError}
          </span>
          <button className="ml-auto underline" onClick={refresh}>
            Retry
          </button>
        </div>
      )}

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
        <DateRangePicker
          preset={preset}
          range={dateRange}
          onPresetChange={handleDateChange}
        />
        <div className="w-px h-5 bg-border" />
        <ProductFilter
          products={products}
          selectedProductId={selectedProductId}
          onChange={setSelectedProductId}
        />
      </div>

      {/* Body */}
      <div className="flex-1 px-6 py-5 space-y-4">
        {campaignsLoading && campaigns.length === 0 ? (
          <>
            <PerfSummarySkeleton />
            <CampaignTableSkeleton />
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
