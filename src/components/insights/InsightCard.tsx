"use client";

import { useState } from "react";
import { Insight } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AISuggestionPanel } from "@/components/campaigns/AISuggestionPanel";
import { severityColor, severityIcon, formatPercent, formatCurrency, changeClass, changeArrow } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  GitBranch,
  Lightbulb,
  Target,
  AlertCircle,
  Zap,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

interface InsightCardProps {
  insight: Insight;
  onAction: (insightId: string, action: "approve" | "deny" | "modify", note?: string) => void;
}

const categoryConfig: Record<
  string,
  { label: string; icon: React.ElementType; colorClass: string }
> = {
  top_of_search_loss: { label: "Top of Search Loss", icon: TrendingDown, colorClass: "text-red-500" },
  over_optimized: { label: "Over-Optimized", icon: AlertCircle, colorClass: "text-orange-500" },
  declining: { label: "Declining", icon: TrendingDown, colorClass: "text-yellow-600" },
  dying: { label: "Dying Campaign", icon: Zap, colorClass: "text-red-600" },
  improving: { label: "Opportunity", icon: TrendingUp, colorClass: "text-emerald-600" },
  budget_limited: { label: "Budget Limited", icon: Target, colorClass: "text-blue-600" },
};

function ConfidenceMeter({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-yellow-500" : "bg-red-400"
          )}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-8 text-right">{score}%</span>
    </div>
  );
}

export function InsightCard({ insight, onAction }: InsightCardProps) {
  const [expanded, setExpanded] = useState(true);
  const cat = categoryConfig[insight.category] ?? {
    label: insight.category,
    icon: Lightbulb,
    colorClass: "text-muted-foreground",
  };
  const CatIcon = cat.icon;

  function handleAction(
    _sid: string,
    action: "approve" | "deny" | "modify",
    note?: string
  ) {
    onAction(insight.id, action, note);
  }

  return (
    <div
      className={cn(
        "rounded-xl border-l-4 border shadow-sm overflow-hidden",
        severityColor(insight.severity)
      )}
    >
      {/* Card header */}
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="text-lg mt-0.5">{severityIcon(insight.severity)}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <CatIcon className={cn("w-4 h-4 shrink-0", cat.colorClass)} />
              <span className={cn("text-xs font-semibold uppercase tracking-wide", cat.colorClass)}>
                {cat.label}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {insight.campaignName}
              </Badge>
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-[10px] text-muted-foreground">AI Confidence</span>
                <Badge
                  variant={
                    insight.confidence === "High"
                      ? "default"
                      : insight.confidence === "Medium"
                      ? "secondary"
                      : "outline"
                  }
                  className="text-[10px]"
                >
                  {insight.confidence}
                </Badge>
              </div>
            </div>
            <h3 className="font-bold text-sm text-foreground">{insight.title}</h3>
            <ConfidenceMeter score={insight.confidenceScore} />
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground transition-colors mt-1 shrink-0"
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-5 py-4 space-y-4">
          {/* What changed / Why / Action */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <GitBranch className="w-3 h-3" /> What Changed
              </div>
              <p className="text-foreground text-xs leading-relaxed">{insight.whatChanged}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <AlertCircle className="w-3 h-3" /> Likely Cause
              </div>
              <p className="text-foreground text-xs leading-relaxed">{insight.likelyCause}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Target className="w-3 h-3" /> Recommended Action
              </div>
              <p className="text-foreground text-xs leading-relaxed">{insight.recommendedAction}</p>
            </div>
          </div>

          {/* Metric deltas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {insight.metrics.map((m) => {
              const isAcos = m.label === "ACOS";
              const isSpend = m.label === "Spend";
              const inverse = isAcos || isSpend;
              return (
                <div
                  key={m.label}
                  className="rounded-lg bg-background/80 border px-3 py-2.5 space-y-0.5"
                >
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                    {m.label}
                  </p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-bold font-mono">
                      {m.unit === "$"
                        ? formatCurrency(Number(m.current))
                        : m.unit === "%"
                        ? formatPercent(Number(m.current))
                        : m.current}
                      {m.unit !== "$" && m.unit !== "%" && m.unit ? m.unit : ""}
                    </span>
                    {Math.abs(m.change) > 0.1 && (
                      <span
                        className={cn("text-xs font-semibold", changeClass(m.change, inverse))}
                      >
                        {changeArrow(m.change)}{Math.abs(m.change).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    vs{" "}
                    {m.unit === "$"
                      ? formatCurrency(Number(m.previous))
                      : m.unit === "%"
                      ? formatPercent(Number(m.previous))
                      : m.previous}
                    {m.unit !== "$" && m.unit !== "%" && m.unit ? m.unit : ""}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Related change event */}
          {insight.relatedChangeEvent && (
            <div className="flex items-center gap-2 text-xs bg-background border rounded-md px-3 py-2">
              <span className="text-muted-foreground shrink-0">📋 Change detected:</span>
              <span className="font-medium">
                {insight.relatedChangeEvent.field} changed from{" "}
                <span className="font-mono">
                  {typeof insight.relatedChangeEvent.oldValue === "number" &&
                  insight.relatedChangeEvent.changeType === "bid"
                    ? `$${insight.relatedChangeEvent.oldValue}`
                    : insight.relatedChangeEvent.oldValue}
                </span>{" "}
                →{" "}
                <span className="font-mono">
                  {typeof insight.relatedChangeEvent.newValue === "number" &&
                  insight.relatedChangeEvent.changeType === "bid"
                    ? `$${insight.relatedChangeEvent.newValue}`
                    : insight.relatedChangeEvent.newValue}
                </span>
              </span>
              <span className="text-muted-foreground ml-auto shrink-0">
                {new Date(insight.relatedChangeEvent.changedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          )}

          {/* Structured action */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Structured Action — approve, modify, or deny
            </p>
            <AISuggestionPanel
              suggestion={insight.structuredAction}
              onAction={handleAction}
            />
          </div>
        </div>
      )}
    </div>
  );
}
