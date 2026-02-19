"use client";

import { useState, useCallback } from "react";
import { Campaign, ChangeEvent, AISuggestion, Insight } from "@/lib/types";
import { MOCK_CAMPAIGNS, MOCK_CHANGE_EVENTS, MOCK_INSIGHTS } from "@/lib/mock-data";

// ─── Campaign Suggestions Hook ─────────────────────────────────────────────

interface GeminiSuggestion {
  type: AISuggestion["type"];
  title: string;
  description: string;
  rationale: string;
  impact: string;
  confidence: AISuggestion["confidence"];
  currentValue: number | null;
  recommendedValue: number | null;
  unit: string | null;
}

interface CampaignSuggestionsResponse {
  campaignSuggestions: {
    campaignId: string;
    suggestions: GeminiSuggestion[];
  }[];
}

export function useAICampaignSuggestions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGenerated, setLastGenerated] = useState<Date | null>(null);

  const generate = useCallback(
    async (
      campaigns: Campaign[],
      changeEvents: ChangeEvent[],
      dateRange: { from: Date; to: Date }
    ): Promise<Map<string, AISuggestion[]>> => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/ai/campaign-suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaigns,
            changeEvents,
            dateRange: {
              from: dateRange.from.toISOString().split("T")[0],
              to: dateRange.to.toISOString().split("T")[0],
            },
          }),
        });

        if (!res.ok) throw new Error(`API error ${res.status}`);

        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? "Unknown error");

        const data = json.data as CampaignSuggestionsResponse;
        const map = new Map<string, AISuggestion[]>();

        for (const item of data.campaignSuggestions) {
          const suggestions: AISuggestion[] = item.suggestions.map((s, idx) => ({
            id: `gemini-${item.campaignId}-${idx}`,
            campaignId: item.campaignId,
            type: s.type,
            title: s.title,
            description: s.description,
            rationale: s.rationale,
            impact: s.impact,
            confidence: s.confidence,
            currentValue: s.currentValue ?? undefined,
            recommendedValue: s.recommendedValue ?? undefined,
            unit: s.unit ?? undefined,
            status: "pending",
            createdAt: new Date().toISOString(),
          }));
          map.set(item.campaignId, suggestions);
        }

        setLastGenerated(new Date());
        return map;
      } catch (err) {
        const msg = String(err);
        setError(msg);
        console.error("[useAICampaignSuggestions]", err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { generate, loading, error, lastGenerated };
}

// ─── Insights Hook ──────────────────────────────────────────────────────────

interface GeminiMetric {
  label: string;
  current: number;
  previous: number;
  change: number;
  unit: string;
}

interface GeminiStructuredAction {
  type: AISuggestion["type"];
  title: string;
  description: string;
  rationale: string;
  impact: string;
  confidence: AISuggestion["confidence"];
  currentValue: number | null;
  recommendedValue: number | null;
  unit: string | null;
}

interface GeminiInsight {
  campaignId: string;
  campaignName: string;
  category: Insight["category"];
  severity: Insight["severity"];
  title: string;
  whatChanged: string;
  likelyCause: string;
  recommendedAction: string;
  confidence: Insight["confidence"];
  confidenceScore: number;
  metrics: GeminiMetric[];
  structuredAction: GeminiStructuredAction;
}

interface InsightsResponse {
  insights: GeminiInsight[];
  portfolioSummary: {
    overallHealth: string;
    topOpportunity: string;
    biggestRisk: string;
  };
}

export function useAIInsights() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portfolioSummary, setPortfolioSummary] = useState<InsightsResponse["portfolioSummary"] | null>(null);

  const generate = useCallback(
    async (
      campaigns: Campaign[],
      changeEvents: ChangeEvent[],
      dateRange: { from: Date; to: Date }
    ): Promise<Insight[]> => {
      setLoading(true);
      setError(null);

      // Compute comparison period (same length, immediately before)
      const duration = dateRange.to.getTime() - dateRange.from.getTime();
      const compTo = new Date(dateRange.from.getTime() - 1);
      const compFrom = new Date(compTo.getTime() - duration);

      try {
        const res = await fetch("/api/ai/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaigns,
            changeEvents,
            dateRange: {
              from: dateRange.from.toISOString().split("T")[0],
              to: dateRange.to.toISOString().split("T")[0],
            },
            comparisonPeriod: {
              from: compFrom.toISOString().split("T")[0],
              to: compTo.toISOString().split("T")[0],
            },
          }),
        });

        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          if (res.status === 429) throw new Error("Rate limit: " + (j.error ?? "Please wait a minute and try again."));
          throw new Error(`API error ${res.status}`);
        }
        if (data.portfolioSummary) setPortfolioSummary(data.portfolioSummary);

        const insights: Insight[] = data.insights.map((g, i) => ({
          id: `gemini-insight-${i}`,
          campaignId: g.campaignId,
          campaignName: g.campaignName,
          category: g.category,
          severity: g.severity,
          title: g.title,
          whatChanged: g.whatChanged,
          likelyCause: g.likelyCause,
          recommendedAction: g.recommendedAction,
          confidence: g.confidence,
          confidenceScore: Math.min(100, Math.max(0, g.confidenceScore)),
          metrics: g.metrics,
          structuredAction: {
            id: `gemini-action-${i}`,
            campaignId: g.campaignId,
            type: g.structuredAction.type,
            title: g.structuredAction.title,
            description: g.structuredAction.description,
            rationale: g.structuredAction.rationale,
            impact: g.structuredAction.impact,
            confidence: g.structuredAction.confidence,
            currentValue: g.structuredAction.currentValue ?? undefined,
            recommendedValue: g.structuredAction.recommendedValue ?? undefined,
            unit: g.structuredAction.unit ?? undefined,
            status: "pending",
            createdAt: new Date().toISOString(),
          },
          relatedChangeEvent: changeEvents.find((e) => e.campaignId === g.campaignId),
          detectedAt: new Date().toISOString(),
        }));

        return insights;
      } catch (err) {
        const msg = String(err);
        setError(msg);
        console.error("[useAIInsights]", err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { generate, loading, error, portfolioSummary };
}
