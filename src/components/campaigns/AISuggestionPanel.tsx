"use client";

import { useState } from "react";
import { AISuggestion } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { confidenceBadgeVariant, formatCurrency } from "@/lib/format";
import {
  CheckCircle2,
  XCircle,
  Pencil,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowRight,
  Loader2,
  Zap,
} from "lucide-react";

interface AISuggestionPanelProps {
  suggestion: AISuggestion;
  onAction: (
    suggestionId: string,
    action: "approve" | "deny" | "modify",
    note?: string
  ) => void;
  onApply?: (suggestion: AISuggestion) => Promise<{ success: boolean; error?: string }>;
}

export function AISuggestionPanel({ suggestion, onAction, onApply }: AISuggestionPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<"idle" | "deny" | "modify">("idle");
  const [note, setNote] = useState("");
  const [applying, setApplying] = useState(false);

  const isDone = suggestion.status !== "pending";

  const statusStyles: Record<string, string> = {
    approved: "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20",
    denied: "border-red-400 bg-red-50 dark:bg-red-950/20",
    modified: "border-blue-400 bg-blue-50 dark:bg-blue-950/20",
    pending: "border-muted bg-background",
  };

  const typeIcon: Record<string, string> = {
    raise_bid: "📈",
    lower_bid: "📉",
    increase_budget: "💰",
    decrease_budget: "✂️",
    pause_campaign: "⏸️",
    enable_campaign: "▶️",
    add_negative_keyword: "🚫",
    adjust_placement: "🎯",
  };

  function handleAction(action: "approve" | "deny" | "modify") {
    if (action === "approve") {
      onAction(suggestion.id, "approve");
    } else {
      onAction(suggestion.id, action, note);
      setNote("");
      setMode("idle");
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border text-sm transition-all",
        statusStyles[suggestion.status]
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-3">
        <span className="text-base mt-0.5 shrink-0">{typeIcon[suggestion.type]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
            <p className="font-semibold text-foreground">{suggestion.title}</p>
            <Badge variant={confidenceBadgeVariant(suggestion.confidence)} className="text-[10px]">
              {suggestion.confidence} confidence
            </Badge>
            {isDone && (
              <Badge
                variant={
                  suggestion.status === "approved"
                    ? "default"
                    : suggestion.status === "denied"
                    ? "destructive"
                    : "secondary"
                }
                className="text-[10px] capitalize"
              >
                {suggestion.status}
              </Badge>
            )}
          </div>

          <p className="text-muted-foreground mt-0.5 text-xs">{suggestion.description}</p>

          {/* Recommended value */}
          {suggestion.recommendedValue !== undefined && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Current:</span>
              <span className="font-mono font-medium">
                {suggestion.unit === "$"
                  ? formatCurrency(Number(suggestion.currentValue))
                  : suggestion.currentValue}
              </span>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">Recommended:</span>
              <span className="font-mono font-semibold text-emerald-600">
                {suggestion.unit === "$"
                  ? formatCurrency(Number(suggestion.recommendedValue))
                  : suggestion.recommendedValue}
              </span>
            </div>
          )}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded rationale */}
      {expanded && (
        <div className="px-4 pb-3 space-y-2 border-t pt-3 text-xs text-muted-foreground">
          <div>
            <span className="font-semibold text-foreground uppercase tracking-wide text-[10px]">Rationale</span>
            <p className="mt-0.5">{suggestion.rationale}</p>
          </div>
          <div>
            <span className="font-semibold text-foreground uppercase tracking-wide text-[10px]">Expected Impact</span>
            <p className="mt-0.5">{suggestion.impact}</p>
          </div>
          {suggestion.userNote && (
            <div>
              <span className="font-semibold text-foreground uppercase tracking-wide text-[10px]">Your note</span>
              <p className="mt-0.5 italic">{suggestion.userNote}</p>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {!isDone && mode === "idle" && (
        <div className="flex items-center gap-2 px-3 pb-3">
          {onApply && suggestion.recommendedValue !== undefined && (
            <Button
              size="sm"
              className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              disabled={applying}
              onClick={async () => {
                setApplying(true);
                try {
                  const result = await onApply(suggestion);
                  if (result.success) {
                    onAction(suggestion.id, "approve");
                  }
                } finally {
                  setApplying(false);
                }
              }}
            >
              {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {applying ? "Applying…" : "Apply"}
            </Button>
          )}
          <Button
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => handleAction("approve")}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            onClick={() => setMode("modify")}
          >
            <Pencil className="w-3.5 h-3.5" />
            Modify
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive"
            onClick={() => setMode("deny")}
          >
            <XCircle className="w-3.5 h-3.5" />
            Deny
          </Button>
        </div>
      )}

      {/* Deny / Modify note input */}
      {!isDone && (mode === "deny" || mode === "modify") && (
        <div className="px-3 pb-3 space-y-2">
          <Textarea
            placeholder={
              mode === "deny"
                ? "Tell the AI why you're denying this suggestion (optional but helps it learn)…"
                : "Describe your modification and why (e.g. 'Raising to $2.50 instead — more conservative')…"
            }
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="text-xs min-h-[70px] resize-none"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              variant={mode === "deny" ? "destructive" : "default"}
              onClick={() => handleAction(mode)}
            >
              {mode === "deny" ? "Confirm Deny" : "Confirm Modify"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                setMode("idle");
                setNote("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
