"use client";

import { useState } from "react";
import { AISuggestion } from "@/lib/types";
import { Campaign } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { confidenceBadgeVariant, formatCurrency } from "@/lib/format";
import { AIChatModal } from "./AIChatModal";
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
  MessageCircle,
  Bot,
} from "lucide-react";

interface AISuggestionPanelProps {
  suggestion: AISuggestion;
  campaign: Campaign;
  onAction: (
    suggestionId: string,
    action: "approve" | "deny" | "modify",
    note?: string
  ) => void;
  onApply?: (suggestion: AISuggestion) => Promise<{ success: boolean; error?: string }>;
}

export function AISuggestionPanel({ suggestion, campaign, onAction, onApply }: AISuggestionPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<"idle" | "deny" | "modify">("idle");
  const [note, setNote] = useState("");
  const [applying, setApplying] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const isDone = suggestion.status !== "pending";

  const statusStyles: Record<string, string> = {
    approved: "border-emerald-500/50 bg-gradient-to-r from-emerald-50 to-background dark:from-emerald-950/30 dark:to-background",
    denied: "border-red-400/50 bg-gradient-to-r from-red-50 to-background dark:from-red-950/30 dark:to-background",
    modified: "border-blue-400/50 bg-gradient-to-r from-blue-50 to-background dark:from-blue-950/30 dark:to-background",
    pending: "border-border bg-background hover:shadow-md",
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

  // Build initial message for chat from existing AI analysis
  const initialChatMessage = `Here's my analysis of **${campaign.name}**:\n\n**${suggestion.title}** (${suggestion.confidence} confidence)\n\n${suggestion.description}\n\n${suggestion.rationale ? `**Rationale:** ${suggestion.rationale}\n\n` : ""}${suggestion.impact ? `**Expected Impact:** ${suggestion.impact}\n\n` : ""}${suggestion.recommendedValue !== undefined ? `**Current Value:** ${suggestion.unit === "$" ? formatCurrency(Number(suggestion.currentValue)) : suggestion.currentValue} → **Recommended:** ${suggestion.unit === "$" ? formatCurrency(Number(suggestion.recommendedValue)) : suggestion.recommendedValue}\n\n` : ""}How can I help you further with this campaign?`;

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
        "rounded-xl border text-sm transition-all shadow-sm",
        statusStyles[suggestion.status]
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-lg">{typeIcon[suggestion.type]}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-foreground text-[15px]">{suggestion.title}</p>
            <Badge variant={confidenceBadgeVariant(suggestion.confidence)} className="text-[10px] px-2">
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

          <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{suggestion.description}</p>

          {/* Recommended value */}
          {suggestion.recommendedValue !== undefined && (
            <div className="mt-3 flex items-center gap-3 text-xs bg-muted/50 rounded-lg px-3 py-2 w-fit">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Current:</span>
                <span className="font-mono font-semibold text-foreground">
                  {suggestion.unit === "$"
                    ? formatCurrency(Number(suggestion.currentValue))
                    : suggestion.currentValue}
                </span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-primary" />
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Recommended:</span>
                <span className="font-mono font-bold text-emerald-600">
                  {suggestion.unit === "$"
                    ? formatCurrency(Number(suggestion.recommendedValue))
                    : suggestion.recommendedValue}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-1 p-1 rounded-md hover:bg-muted"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded rationale */}
      {expanded && (
        <div className="mx-4 mb-3 space-y-2 border-t pt-3 text-xs text-muted-foreground">
          <div>
            <span className="font-semibold text-foreground uppercase tracking-wide text-[10px]">Rationale</span>
            <p className="mt-0.5 leading-relaxed">{suggestion.rationale}</p>
          </div>
          <div>
            <span className="font-semibold text-foreground uppercase tracking-wide text-[10px]">Expected Impact</span>
            <p className="mt-0.5 leading-relaxed">{suggestion.impact}</p>
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
        <div className="flex items-center gap-2 px-4 pb-4 pt-1 flex-wrap">
          {/* AI Analysis — opens chat with cached context */}
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5 transition-all border-primary/40 hover:border-primary hover:bg-primary/5 text-primary font-medium"
            onClick={() => setChatOpen(true)}
          >
            <Bot className="w-3.5 h-3.5" />
            AI Chat
          </Button>

          <div className="w-px h-5 bg-border mx-0.5" />

          {onApply && suggestion.recommendedValue !== undefined && (
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
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
            className="h-8 text-xs gap-1.5"
            onClick={() => handleAction("approve")}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={() => setMode("modify")}
          >
            <Pencil className="w-3.5 h-3.5" />
            Modify
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs gap-1.5 text-destructive hover:text-destructive"
            onClick={() => setMode("deny")}
          >
            <XCircle className="w-3.5 h-3.5" />
            Deny
          </Button>
        </div>
      )}

      {/* Deny / Modify note input */}
      {!isDone && (mode === "deny" || mode === "modify") && (
        <div className="px-4 pb-4 space-y-2">
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

      {/* AI Chat Modal — uses cached analysis as initial message */}
      <AIChatModal
        open={chatOpen}
        onOpenChange={setChatOpen}
        campaign={campaign}
        initialMessage={initialChatMessage}
      />
    </div>
  );
}
