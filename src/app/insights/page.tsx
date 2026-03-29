"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { ChangeEvent, Insight, InsightSeverity, Campaign } from "@/lib/types";
import { InsightCard } from "@/components/insights/InsightCard";
import { TimelineChart } from "@/components/insights/TimelineChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAIInsights } from "@/hooks/useAI";
import { useAmazonCampaigns } from "@/hooks/useAmazonCampaigns";
import { subDays } from "date-fns";
import {
  Lightbulb,
  CheckCircle2,
  BarChart3,
  Calendar,
  Filter,
  Layers,
  Sparkles,
  Loader2,
  AlertCircle,
  TrendingUp,
  AlertTriangle,
  Brain,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AIHistoryModal } from "@/components/insights/AIHistoryModal";

const SEVERITY_LABEL: Record<InsightSeverity, string> = {
  critical: "Critical",
  warning: "Warning",
  opportunity: "Opportunity",
  info: "Info",
};

const SEVERITY_ORDER: InsightSeverity[] = ["critical", "warning", "opportunity", "info"];

export default function InsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [severityFilter, setSeverityFilter] = useState<InsightSeverity | "All">("All");
  const [chartMetric, setChartMetric] = useState<"acos" | "sales">("acos");
  const [chartDays, setChartDays] = useState<7 | 14 | 30>(14);
  const [aiError, setAiError] = useState<string | null>(null);
  const [changeEvents, setChangeEvents] = useState<ChangeEvent[]>([]);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  // Get selected profile from localStorage
  const [selectedProfile, setSelectedProfile] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try { return localStorage.getItem("selectedProfileId") ?? ""; } catch { return ""; }
    }
    return "";
  });

  // Listen for sidebar account change
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.profileId) setSelectedProfile(detail.profileId);
    };
    window.addEventListener("account-changed", handler);
    return () => window.removeEventListener("account-changed", handler);
  }, []);

  // Fallback: if no profile after mount, fetch it
  useEffect(() => {
    if (selectedProfile) return;
    fetch("/api/amazon/profiles")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          const sellers = json.data.filter(
            (p: { accountInfo?: { type: string } }) => p.accountInfo?.type === "seller"
          );
          if (sellers.length > 0) {
            const pid = String(sellers[0].profileId);
            setSelectedProfile(pid);
            try { localStorage.setItem("selectedProfileId", pid); } catch {}
          }
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dateRange = useMemo(() => ({
    from: subDays(new Date(), chartDays - 1),
    to: new Date(),
  }), [chartDays]);

  // Fetch real campaign data from MongoDB
  const {
    campaigns,
    loading: campaignsLoading,
    error: campaignsError,
  } = useAmazonCampaigns(dateRange, selectedProfile || undefined);

  // Fetch real change history for this profile
  const fetchChangeHistory = useCallback(async () => {
    if (!selectedProfile) return;
    try {
      const res = await fetch(
        `/api/amazon/campaigns/history?profileId=${encodeURIComponent(selectedProfile)}&limit=100`
      );
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const events: ChangeEvent[] = json.data.map((h: {
          _id: string;
          campaignId: string;
          field: string;
          oldValue: string | number;
          newValue: string | number;
          changedAt: string;
          changedBy: string;
        }) => ({
          id: h._id,
          campaignId: h.campaignId,
          campaignName: campaigns.find((c: Campaign) => c.id === h.campaignId)?.name || h.campaignId,
          changeType: (h.field === "dailyBudget" ? "budget" : h.field === "bid" ? "bid" : h.field === "status" ? "status" : "bid") as ChangeEvent["changeType"],
          field: h.field,
          oldValue: h.oldValue,
          newValue: h.newValue,
          changedAt: h.changedAt,
          changedBy: "user" as const,
        }));
        setChangeEvents(events);
      }
    } catch (err) {
      console.error("[Insights] Failed to load change history:", err);
    }
  }, [selectedProfile, campaigns]);

  useEffect(() => {
    if (campaigns.length > 0 && selectedProfile) {
      fetchChangeHistory();
    }
  }, [campaigns.length, selectedProfile, fetchChangeHistory]);

  const { generate, loading: aiLoading, portfolioSummary, filterStats } = useAIInsights();

  const counts = useMemo(() => {
    const result: Record<InsightSeverity | "All", number> = {
      All: insights.length,
      critical: 0,
      warning: 0,
      opportunity: 0,
      info: 0,
    };
    for (const i of insights) result[i.severity]++;
    return result;
  }, [insights]);

  const filtered = useMemo(() => {
    if (severityFilter === "All") return insights;
    return insights.filter((i) => i.severity === severityFilter);
  }, [insights, severityFilter]);

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const si = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
        if (si !== 0) return si;
        return b.confidenceScore - a.confidenceScore;
      }),
    [filtered]
  );

  async function handleGenerateAI() {
    if (campaigns.length === 0) {
      setAiError("No campaign data loaded yet. Please wait for data to load.");
      return;
    }
    setAiError(null);
    try {
      const generated = await generate(campaigns, changeEvents, dateRange);
      if (generated.length > 0) setInsights(generated);
    } catch (err) {
      setAiError(String(err));
    }
  }

  function handleAction(
    insightId: string,
    action: "approve" | "deny" | "modify",
    note?: string
  ) {
    const insight = insights.find((i) => i.id === insightId);

    setInsights((prev) =>
      prev.map((i) =>
        i.id !== insightId
          ? i
          : {
              ...i,
              structuredAction: {
                ...i.structuredAction,
                status:
                  action === "modify" ? "modified" : action === "deny" ? "denied" : "approved",
                userNote: note,
              },
            }
      )
    );

    // Persist feedback to MongoDB (fire and forget)
    if (insight) {
      const userEmail =
        (typeof window !== "undefined" && localStorage.getItem("userEmail")) || "unknown";
      fetch("/api/ai/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: selectedProfile || "",
          campaignId: insight.campaignId,
          campaignName: insight.campaignName,
          suggestionType: insight.structuredAction.type,
          suggestionTitle: insight.structuredAction.title,
          action,
          userEmail,
          userNote: note || undefined,
          currentValue: insight.structuredAction.currentValue,
          recommendedValue: insight.structuredAction.recommendedValue,
          unit: insight.structuredAction.unit,
        }),
      }).catch((err) => console.error("[Feedback save]", err));
    }
  }

  const approvedCount = insights.filter(
    (i) => i.structuredAction.status === "approved"
  ).length;

  const healthColor =
    portfolioSummary?.overallHealth === "good"
      ? "text-emerald-600"
      : portfolioSummary?.overallHealth === "critical"
      ? "text-red-600"
      : "text-yellow-600";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b bg-background px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">Actionable Insights</h1>
            <Badge variant="secondary" className="gap-1 text-xs">
              <Brain className="w-3 h-3" />
              Gemini AI
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Timeline-aware AI analysis · {insights.length} insights · {campaigns.length} campaigns loaded
            {filterStats && (
              <span className="ml-1">
                · {filterStats.analyzed} analyzed, {filterStats.skipped} skipped ({filterStats.deadCount} inactive)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {approvedCount > 0 && (
            <Badge variant="secondary" className="gap-1.5 text-xs">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              {approvedCount} approved
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setHistoryModalOpen(true)}
          >
            <History className="w-3.5 h-3.5" />
            AI History
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={handleGenerateAI}
            disabled={aiLoading || campaignsLoading || campaigns.length === 0}
          >
            {aiLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {aiLoading ? "Gemini is thinking…" : "Analyze with Gemini"}
          </Button>
        </div>
      </div>

      {/* Campaign loading state */}
      {campaignsLoading && (
        <div className="mx-6 mt-3 flex items-center gap-3 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <p>Loading campaign data from database…</p>
        </div>
      )}

      {/* Campaigns error */}
      {campaignsError && (
        <div className="mx-6 mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Failed to load campaign data: {campaignsError}</span>
        </div>
      )}

      {/* AI error */}
      {aiError && (
        <div className="mx-6 mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Gemini AI error: {aiError}</span>
          <button className="ml-auto underline" onClick={() => setAiError(null)}>Dismiss</button>
        </div>
      )}

      {/* AI loading overlay hint */}
      {aiLoading && (
        <div className="mx-6 mt-3 flex items-center gap-3 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <div>
            <p className="font-medium">Gemini is analyzing your campaign portfolio…</p>
            <p className="text-blue-600 mt-0.5">
              Checking change history, comparing time periods, detecting over-optimization and scaling opportunities.
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 px-6 py-5 space-y-5 overflow-auto">

        {/* Portfolio summary from Gemini */}
        {portfolioSummary && (
          <div className="rounded-xl border bg-background shadow-sm p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", 
                portfolioSummary.overallHealth === "good" ? "bg-emerald-500" : 
                portfolioSummary.overallHealth === "critical" ? "bg-red-500" : "bg-yellow-500"
              )} />
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Portfolio Health</p>
                <p className={cn("font-bold capitalize mt-0.5", healthColor)}>{portfolioSummary.overallHealth}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Top Opportunity</p>
                <p className="text-xs mt-0.5 text-foreground">{portfolioSummary.topOpportunity}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Biggest Risk</p>
                <p className="text-xs mt-0.5 text-foreground">{portfolioSummary.biggestRisk}</p>
              </div>
            </div>
          </div>
        )}

        {/* Timeline chart */}
        <div className="rounded-xl border bg-background shadow-sm">
          <div className="px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Portfolio Timeline</p>
              <Badge variant="outline" className="text-xs">Current vs. Previous Period</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="w-3.5 h-3.5" />
              </div>
              <div className="flex gap-1">
                {([7, 14, 30] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setChartDays(d)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-md transition-colors",
                      chartDays === d
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {d}d
                  </button>
                ))}
              </div>
              <Separator orientation="vertical" className="h-5" />
              <div className="flex gap-1">
                {(["acos", "sales"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setChartMetric(m)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-md capitalize transition-colors",
                      chartMetric === m
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {m === "acos" ? "ACOS" : "Sales"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="px-5 pt-3 pb-4">
            <div className="flex items-center gap-3 mb-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-6 h-0.5 bg-primary rounded-full inline-block" />
                Current period
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-6 h-px border-t-2 border-dashed border-muted-foreground inline-block" />
                Previous period
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-sm">📋</span>
                Change event
              </span>
            </div>
            <TimelineChart days={chartDays} changeEvents={changeEvents} metric={chartMetric} />
          </div>
        </div>

        {/* Change events log */}
        <div className="rounded-xl border bg-background shadow-sm">
          <div className="px-5 py-3 border-b flex items-center gap-2">
            <Layers className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-semibold">Recent Change History</p>
            <Badge variant="outline" className="text-xs ml-auto">
              {changeEvents.length} changes
            </Badge>
          </div>
          <div className="divide-y">
            {changeEvents.length === 0 && (
              <div className="px-5 py-6 text-center text-xs text-muted-foreground">
                No change history yet. Edit campaign fields to see changes here.
              </div>
            )}
            {changeEvents.map((ev) => (
              <div key={ev.id} className="px-5 py-3 flex items-center gap-3 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{ev.campaignName}</span>
                  <span className="text-muted-foreground mx-1.5">·</span>
                  <span className="text-muted-foreground">
                    {ev.field} changed{" "}
                    <span className="font-mono text-red-500 line-through">
                      {ev.changeType === "bid" || ev.changeType === "budget" ? `$${ev.oldValue}` : ev.oldValue}
                    </span>{" "}
                    →{" "}
                    <span className="font-mono text-emerald-600">
                      {ev.changeType === "bid" || ev.changeType === "budget" ? `$${ev.newValue}` : ev.newValue}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={ev.changedBy === "user" ? "secondary" : "outline"} className="text-[10px]">
                    {ev.changedBy === "user" ? "Manual" : "Auto"}
                  </Badge>
                  <span className="text-muted-foreground">
                    {new Date(ev.changedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Insights list */}
        <div>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Filter className="w-3.5 h-3.5" />
              <span>Filter:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["All", ...SEVERITY_ORDER] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSeverityFilter(s as InsightSeverity | "All")}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full border transition-colors font-medium",
                    severityFilter === s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  )}
                >
                  {s === "All" ? "All" : SEVERITY_LABEL[s]}
                  <span className="ml-1.5 opacity-70">({counts[s]})</span>
                </button>
              ))}
            </div>
            <div className="ml-auto text-xs text-muted-foreground">
              Sorted by severity · confidence
            </div>
          </div>

          <div className="space-y-4">
            {sorted.length === 0 && (
              <div className="text-center py-16 text-muted-foreground text-sm rounded-xl border bg-background">
                <Lightbulb className="w-8 h-8 mx-auto mb-3 opacity-30" />
                {campaigns.length === 0
                  ? "Loading campaign data…"
                  : "Click \"Analyze with Gemini\" to generate AI insights from your real campaign data."}
              </div>
            )}
            {sorted.map((insight) => (
              <InsightCard key={insight.id} insight={insight} onAction={handleAction} />
            ))}
          </div>
        </div>
      </div>

      {/* AI History Modal */}
      <AIHistoryModal
        open={historyModalOpen}
        onOpenChange={setHistoryModalOpen}
      />
    </div>
  );
}

