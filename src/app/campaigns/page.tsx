"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { MOCK_CHANGE_EVENTS } from "@/lib/mock-data";
import { Campaign, CampaignFilters, DateRange, DateRangePreset } from "@/lib/types";
import { DateRangePicker } from "@/components/campaigns/DateRangePicker";
import { ProductFilter } from "@/components/campaigns/ProductFilter";
import { CampaignTable } from "@/components/campaigns/CampaignTable";
import { PerfSummary } from "@/components/campaigns/PerfSummary";
import { CampaignTableSkeleton, PerfSummarySkeleton } from "@/components/campaigns/CampaignTableSkeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { subDays, formatDistanceToNow } from "date-fns";
import {
  Download,
  RefreshCcw,
  Loader2,
  AlertCircle,
  WifiOff,
  Database,
  Clock,
  Info,
} from "lucide-react";
import { useAISingleCampaign } from "@/hooks/useAI";
import { useAmazonCampaigns, DataSource } from "@/hooks/useAmazonCampaigns";
import { useAmazonProducts } from "@/hooks/useAmazonProducts";
import { useToast } from "@/components/ui/toast";

function SourceBadge({ source, dataUpdatedAt }: { source: DataSource; dataUpdatedAt: Date | null }) {
  if (source === "live" && dataUpdatedAt) {
    return (
      <Badge
        variant="default"
        className="gap-1.5 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white"
      >
        <Database className="w-3 h-3" />
        DB · {formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}
      </Badge>
    );
  }
  if (source === "live") {
    return (
      <Badge
        variant="default"
        className="gap-1.5 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white"
      >
        <Database className="w-3 h-3" />
        From DB
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

  const [preset, setPreset] = useState<DateRangePreset>("30d");
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });
  const [selectedProductId, setSelectedProductId] = useState<string | "All">("All");
  const [selectedProfile, setSelectedProfile] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try { return localStorage.getItem("selectedProfileId") ?? ""; } catch { return ""; }
    }
    return "";
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<CampaignFilters>({
    search: "",
    status: "All",
    biddingStrategy: "All",
    placement: "All",
    minAcos: "",
    maxAcos: "",
    minRoas: "",
    minSpend: "",
    maxSpend: "",
    minSales: "",
    maxSales: "",
    minClicks: "",
    minOrders: "",
    minImpressions: "",
    sortBy: "acos",
    sortDir: "desc",
    productId: "All",
  });

  // Live API data hooks
  const {
    campaigns: rawCampaigns,
    placementData,
    loading: campaignsLoading,
    error: campaignsError,
    dataSource,
    metricsAvailable,
    refresh,
    lastFetched,
    dataUpdatedAt,
    message,
  } = useAmazonCampaigns(dateRange, selectedProfile || undefined);

  const { products, campaignProductMap } = useAmazonProducts();

  // Listen for sidebar account change
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.profileId) {
        setSelectedProfile(detail.profileId);
      }
    };
    window.addEventListener("account-changed", handler);
    return () => window.removeEventListener("account-changed", handler);
  }, []);

  // Fallback: if no profile after mount, fetch it directly
  useEffect(() => {
    if (selectedProfile) return;
    fetch("/api/amazon/profiles")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          const sellers = json.data.filter(
            (p: { accountInfo?: { type: string } }) => p.accountInfo?.type === "seller"
          );
          if (sellers.length > 0 && !selectedProfile) {
            const pid = String(sellers[0].profileId);
            setSelectedProfile(pid);
            try { localStorage.setItem("selectedProfileId", pid); } catch {}
          }
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Local campaign state (with AI suggestions merged in)
  const [campaignOverrides, setCampaignOverrides] = useState<
    Map<string, Partial<Campaign>>
  >(new Map());

  // Merge raw API data with local overrides (AI suggestions, etc.)
  const campaigns = useMemo(() => {
    return rawCampaigns.map((c) => {
      const override = campaignOverrides.get(c.id);
      const productIds = campaignProductMap[c.id] ?? [];
      const base = { ...c, productIds };
      return override ? { ...base, ...override } : base;
    });
  }, [rawCampaigns, campaignOverrides, campaignProductMap]);

  const [aiError, setAiError] = useState<string | null>(null);
  const { showToast } = useToast();

  const {
    generateForCampaign,
    loadingCampaignId: aiLoadingCampaignId,
  } = useAISingleCampaign();

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

      const suggestion = campaign.aiSuggestions.find((s) => s.id === suggestionId);

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

      // Persist feedback for AI learning (fire and forget)
      if (suggestion) {
        fetch("/api/ai/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: suggestionId,
            campaignId,
            campaignName: campaign.name,
            suggestionType: suggestion.type,
            suggestionTitle: suggestion.title,
            action,
            userNote: note || undefined,
            currentValue: suggestion.currentValue,
            recommendedValue: suggestion.recommendedValue,
            unit: suggestion.unit,
          }),
        }).catch((err) => console.error("[Feedback save]", err));
      }

      return next;
    });
  }

  async function handleGenerateForCampaign(campaignId: string) {
    setAiError(null);
    const campaign = campaigns.find((c) => c.id === campaignId);
    if (!campaign) return;
    try {
      const suggestions = await generateForCampaign(
        campaign,
        MOCK_CHANGE_EVENTS,
        dateRange
      );
      setCampaignOverrides((prev) => {
        const next = new Map(prev);
        if (suggestions.length > 0) {
          next.set(campaignId, { aiSuggestions: suggestions });
        } else {
          next.set(campaignId, { aiSuggestions: [] });
        }
        return next;
      });
    } catch (err) {
      setAiError(String(err));
    }
  }

  // ── Campaign field update handler ──
  const handleUpdateCampaign = useCallback(async (
    campaignId: string,
    field: string,
    value: string | number,
    extra?: { keywordId?: string }
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/amazon/campaigns", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          field,
          value,
          keywordId: extra?.keywordId,
          profileId: selectedProfile || undefined,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        showToast(json.error || "Update failed", "error");
        return { success: false, error: json.error };
      }

      // Optimistic UI update
      setCampaignOverrides((prev) => {
        const next = new Map(prev);
        const existing = next.get(campaignId) || {};
        next.set(campaignId, { ...existing, [field]: value });
        return next;
      });

      const fieldLabels: Record<string, string> = {
        dailyBudget: "Budget",
        bid: "Bid",
        status: "Status",
        biddingStrategy: "Bidding Strategy",
      };
      showToast(`${fieldLabels[field] || field} updated successfully`, "success");
      return { success: true };
    } catch (err) {
      const errMsg = String(err);
      showToast(errMsg, "error");
      return { success: false, error: errMsg };
    }
  }, [selectedProfile, showToast]);

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
      return true;
    });
  }, [campaigns, selectedProductId, filters]);

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="border-b bg-background px-6 py-4 flex items-center justify-between gap-4 flex-wrap sticky top-0 z-20">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold">Campaigns</h1>
            <SourceBadge source={dataSource} dataUpdatedAt={dataUpdatedAt} />
          </div>
          <p className="text-xs text-muted-foreground">
            Sponsored Products · MR – Pool Test Strips (PTS)
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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

      {/* No data banner */}
      {!campaignsLoading && !campaignsError && campaigns.length === 0 && message && (
        <div className="mx-6 mt-3 flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <Info className="w-4 h-4 shrink-0" />
          <span>{message}</span>
          <Link
            href="/manage-data"
            className="ml-auto font-medium underline whitespace-nowrap"
          >
            Go to Manage Data →
          </Link>
        </div>
      )}

      {/* Data age banner */}
      {!campaignsLoading && dataUpdatedAt && campaigns.length > 0 && (
        <div className="mx-6 mt-3 flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5">
          <Clock className="w-4 h-4 shrink-0 text-slate-500" />
          <span>
            Data last fetched from Amazon{" "}
            <strong>{formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}</strong>
            {" "}({dataUpdatedAt.toLocaleString()})
          </span>
          <Link
            href="/manage-data"
            className="ml-auto font-medium text-blue-600 hover:text-blue-700 underline whitespace-nowrap"
          >
            Fetch Latest Data
          </Link>
        </div>
      )}

      {/* Toolbar */}
      <div className="border-b bg-background/80 backdrop-blur-sm px-6 py-3 flex items-center gap-3 flex-wrap sticky top-[57px] z-10">
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
      <div className="flex-1 overflow-hidden flex flex-col px-6 py-4 gap-4">
        {campaignsLoading && campaigns.length === 0 ? (
          <>
            <PerfSummarySkeleton />
            <CampaignTableSkeleton />
          </>
        ) : (
          <>
            <PerfSummary campaigns={filtered} />
            {/* Table — fills remaining height (internal scrollbar built-in) */}
            <div className="flex-1 flex flex-col min-h-0">
              <CampaignTable
                campaigns={filtered}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                metricsAvailable={metricsAvailable}
                dateFrom={`${dateRange.from.getFullYear()}-${String(dateRange.from.getMonth()+1).padStart(2,"0")}-${String(dateRange.from.getDate()).padStart(2,"0")}`}
                dateTo={`${dateRange.to.getFullYear()}-${String(dateRange.to.getMonth()+1).padStart(2,"0")}-${String(dateRange.to.getDate()).padStart(2,"0")}`}
                profileId={selectedProfile || undefined}
                placementData={placementData}
                onSuggestionAction={handleSuggestionAction}
                onGenerateAI={handleGenerateForCampaign}
                aiLoadingCampaignId={aiLoadingCampaignId}
                onUpdateCampaign={handleUpdateCampaign}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
