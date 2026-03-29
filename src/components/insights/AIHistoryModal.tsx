"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2, History, CheckCircle2, XCircle, Edit3, Mail, Brain,
  Eye, RefreshCcw, Sparkles, TrendingUp, TrendingDown, ArrowRight,
  Clock, Zap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface AIHistoryEntry {
  _id: string;
  profileId: string;
  campaignId: string;
  campaignName: string;
  suggestionType: string;
  suggestionTitle: string;
  action: "approve" | "deny" | "modify";
  userEmail: string;
  userNote?: string;
  currentValue?: number | string;
  recommendedValue?: number | string;
  unit?: string;
  timestamp: string;
}

interface LearningData {
  totalActions: number;
  approvals: { type: string; title: string; campaign: string; email: string; timestamp: string }[];
  denials: { type: string; title: string; campaign: string; email: string; note?: string; timestamp: string }[];
  modifications: { type: string; title: string; campaign: string; email: string; note?: string; timestamp: string }[];
  typeBreakdown: Record<string, { approve: number; deny: number; modify: number }>;
  patterns: string[];
  summary: string;
  promptText: string | null;
  lastUpdated?: string;
}

interface AIHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const actionConfig = {
  approve: {
    label: "Approved",
    icon: CheckCircle2,
    color: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-200",
  },
  deny: {
    label: "Denied",
    icon: XCircle,
    color: "text-red-600",
    bg: "bg-red-50 border-red-200",
  },
  modify: {
    label: "Modified",
    icon: Edit3,
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-200",
  },
};

type Tab = "actions" | "brain";

export function AIHistoryModal({ open, onOpenChange }: AIHistoryModalProps) {
  const [tab, setTab] = useState<Tab>("brain");
  const [entries, setEntries] = useState<AIHistoryEntry[]>([]);
  const [learning, setLearning] = useState<LearningData | null>(null);
  const [loading, setLoading] = useState(false);
  const [learningLoading, setLearningLoading] = useState(false);

  const fetchHistory = useCallback(() => {
    setLoading(true);
    fetch("/api/ai/history?limit=100")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) setEntries(json.data);
      })
      .catch((err) => console.error("[AIHistory] fetch error:", err))
      .finally(() => setLoading(false));
  }, []);

  const fetchLearning = useCallback(() => {
    setLearningLoading(true);
    fetch("/api/ai/learning-prompt")
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setLearning(json.data);
      })
      .catch((err) => console.error("[AILearning] fetch error:", err))
      .finally(() => setLearningLoading(false));
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchHistory();
    fetchLearning();
  }, [open, fetchHistory, fetchLearning]);

  const approveCount = entries.filter((e) => e.action === "approve").length;
  const denyCount = entries.filter((e) => e.action === "deny").length;
  const modifyCount = entries.filter((e) => e.action === "modify").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            AI Decision History
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            See how your actions shape AI suggestions in real time.
          </p>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b pb-0 -mb-px">
          <button
            onClick={() => setTab("brain")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors",
              tab === "brain"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Eye className="w-3.5 h-3.5" />
            AI Brain — Live Prompt
          </button>
          <button
            onClick={() => setTab("actions")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors",
              tab === "actions"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <History className="w-3.5 h-3.5" />
            Actions ({entries.length})
          </button>
        </div>

        {/* ────── AI Brain Tab ────── */}
        {tab === "brain" && (
          <div className="flex-1 overflow-auto -mx-6 px-6 space-y-4 py-3">
            {learningLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading AI brain state…</span>
              </div>
            )}

            {!learningLoading && learning && learning.totalActions === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Brain className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">AI has no learning data yet</p>
                <p className="text-xs mt-1">Approve, deny, or modify AI suggestions — the AI will learn your preferences and adjust future recommendations.</p>
              </div>
            )}

            {!learningLoading && learning && learning.totalActions > 0 && (
              <>
                {/* Summary card */}
                <div className="rounded-xl border bg-gradient-to-br from-violet-50 to-blue-50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 text-violet-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-violet-900">What the AI Learned</p>
                      <p className="text-xs text-violet-700 mt-1 leading-relaxed">{learning.summary}</p>
                      {learning.lastUpdated && (
                        <div className="flex items-center gap-1 mt-2 text-[10px] text-violet-500">
                          <Clock className="w-3 h-3" />
                          Last updated {formatDistanceToNow(new Date(learning.lastUpdated), { addSuffix: true })}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 shrink-0"
                      onClick={fetchLearning}
                    >
                      <RefreshCcw className={cn("w-3.5 h-3.5", learningLoading && "animate-spin")} />
                    </Button>
                  </div>
                </div>

                {/* Pattern detection */}
                {learning.patterns.length > 0 && (
                  <div className="rounded-xl border bg-background p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Zap className="w-4 h-4 text-amber-500" />
                      <p className="text-xs font-semibold">Detected Patterns</p>
                      <Badge variant="outline" className="text-[10px] ml-auto">Real-time</Badge>
                    </div>
                    <div className="space-y-2">
                      {learning.patterns.map((pattern, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          {pattern.includes("DENY") || pattern.includes("avoid") ? (
                            <TrendingDown className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                          ) : pattern.includes("APPROVE") || pattern.includes("favor") ? (
                            <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          ) : (
                            <Edit3 className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                          )}
                          <span className="text-muted-foreground leading-relaxed">{pattern}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Type breakdown chart */}
                {Object.keys(learning.typeBreakdown).length > 0 && (
                  <div className="rounded-xl border bg-background p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Brain className="w-4 h-4 text-primary" />
                      <p className="text-xs font-semibold">Action Breakdown by Type</p>
                    </div>
                    <div className="space-y-2.5">
                      {Object.entries(learning.typeBreakdown).map(([type, counts]) => {
                        const total = counts.approve + counts.deny + counts.modify;
                        return (
                          <div key={type}>
                            <div className="flex items-center justify-between text-[11px] mb-1">
                              <span className="font-medium text-foreground">{type.replace(/_/g, " ")}</span>
                              <span className="text-muted-foreground">{total} action{total !== 1 ? "s" : ""}</span>
                            </div>
                            <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                              {counts.approve > 0 && (
                                <div
                                  className="bg-emerald-500 transition-all"
                                  style={{ width: `${(counts.approve / total) * 100}%` }}
                                  title={`${counts.approve} approved`}
                                />
                              )}
                              {counts.modify > 0 && (
                                <div
                                  className="bg-blue-500 transition-all"
                                  style={{ width: `${(counts.modify / total) * 100}%` }}
                                  title={`${counts.modify} modified`}
                                />
                              )}
                              {counts.deny > 0 && (
                                <div
                                  className="bg-red-500 transition-all"
                                  style={{ width: `${(counts.deny / total) * 100}%` }}
                                  title={`${counts.deny} denied`}
                                />
                              )}
                            </div>
                            <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                              {counts.approve > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{counts.approve} approved</span>}
                              {counts.modify > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />{counts.modify} modified</span>}
                              {counts.deny > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />{counts.deny} denied</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Live prompt preview */}
                {learning.promptText && (
                  <div className="rounded-xl border bg-background">
                    <div className="px-4 py-3 border-b flex items-center gap-2">
                      <Eye className="w-4 h-4 text-primary" />
                      <p className="text-xs font-semibold">Live AI Prompt</p>
                      <Badge variant="secondary" className="text-[10px] gap-1 ml-auto">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Injected into every Gemini call
                      </Badge>
                    </div>
                    <div className="p-4 max-h-[300px] overflow-auto">
                      <pre className="text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap font-mono bg-muted/50 rounded-lg p-4 border">
                        {learning.promptText}
                      </pre>
                    </div>
                    <div className="px-4 py-2.5 border-t bg-muted/30">
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                        <ArrowRight className="w-3 h-3" />
                        This exact text is appended to the system prompt every time Gemini generates suggestions. As you approve/deny/modify, this prompt updates automatically.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ────── Actions Tab ────── */}
        {tab === "actions" && (
          <>
            {/* Summary bar */}
            {entries.length > 0 && (
              <div className="flex items-center gap-3 text-xs pb-2 border-b">
                <span className="text-muted-foreground">{entries.length} total actions</span>
                <Badge variant="secondary" className="gap-1 text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" />
                  {approveCount} approved
                </Badge>
                <Badge variant="secondary" className="gap-1 text-[10px] bg-red-50 text-red-700 border-red-200">
                  <XCircle className="w-3 h-3" />
                  {denyCount} denied
                </Badge>
                <Badge variant="secondary" className="gap-1 text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                  <Edit3 className="w-3 h-3" />
                  {modifyCount} modified
                </Badge>
              </div>
            )}

            <div className="flex-1 overflow-auto -mx-6 px-6">
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading history…</span>
                </div>
              )}

              {!loading && entries.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <History className="w-8 h-8 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No AI actions recorded yet.</p>
                  <p className="text-xs mt-1">Approve, deny, or modify AI suggestions to see history here.</p>
                </div>
              )}

              {!loading && entries.length > 0 && (
                <div className="space-y-3 py-2">
                  {entries.map((entry) => {
                    const config = actionConfig[entry.action];
                    const Icon = config.icon;
                    return (
                      <div
                        key={entry._id}
                        className={`rounded-lg border p-3 ${config.bg}`}
                      >
                        <div className="flex items-start gap-3">
                          <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${config.color}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-semibold ${config.color}`}>
                                {config.label}
                              </span>
                              <Badge variant="outline" className="text-[10px]">
                                {entry.suggestionType.replace(/_/g, " ")}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                                {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
                              </span>
                            </div>
                            <p className="text-xs font-medium mt-1">{entry.suggestionTitle}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Campaign: <span className="font-medium text-foreground">{entry.campaignName}</span>
                            </p>
                            {(entry.currentValue != null || entry.recommendedValue != null) && (
                              <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                                {entry.currentValue != null && (
                                  <span className="text-red-500 line-through">
                                    {entry.unit === "$" ? "$" : ""}{entry.currentValue}{entry.unit === "%" ? "%" : ""}
                                  </span>
                                )}
                                {entry.currentValue != null && entry.recommendedValue != null && " → "}
                                {entry.recommendedValue != null && (
                                  <span className="text-emerald-600">
                                    {entry.unit === "$" ? "$" : ""}{entry.recommendedValue}{entry.unit === "%" ? "%" : ""}
                                  </span>
                                )}
                              </p>
                            )}
                            {entry.userNote && (
                              <p className="text-xs text-muted-foreground mt-1 italic">
                                &quot;{entry.userNote}&quot;
                              </p>
                            )}
                            <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
                              <Mail className="w-3 h-3" />
                              <span>{entry.userEmail}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
