"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  Target,
  Wrench,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  RefreshCcw,
  Info,
} from "lucide-react";

type PromptMode = "profit" | "rank" | "maintenance";

interface PromptSaveState {
  loading: boolean;
  success: boolean;
  error: string | null;
}

const MODE_CONFIG: Record<
  PromptMode,
  {
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bgColor: string;
    borderColor: string;
  }
> = {
  profit: {
    label: "Profit Mode",
    description:
      "Instructions for campaigns focused on profitability — reducing ACOS, improving ROAS, cutting wasteful spend. The AI will apply these guidelines when analyzing unprofitable or high-spend campaigns.",
    icon: TrendingUp,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/20",
    borderColor: "border-emerald-200 dark:border-emerald-800",
  },
  rank: {
    label: "Rank Mode",
    description:
      "Instructions for campaigns focused on ranking and visibility — impression share, Top of Search placement, scaling winning campaigns. The AI applies these when a campaign has strong CVR but low spend/impressions.",
    icon: Target,
    color: "text-blue-600",
    bgColor: "bg-blue-50 dark:bg-blue-950/20",
    borderColor: "border-blue-200 dark:border-blue-800",
  },
  maintenance: {
    label: "Maintenance Mode",
    description:
      "Instructions for stable campaigns that just need monitoring and minor tweaks — conservative adjustments, negative keywords, budget caps. The AI uses these when a campaign is performing steadily.",
    icon: Wrench,
    color: "text-amber-600",
    bgColor: "bg-amber-50 dark:bg-amber-950/20",
    borderColor: "border-amber-200 dark:border-amber-800",
  },
};

export default function AdminPage() {
  const [prompts, setPrompts] = useState<Record<PromptMode, string>>({
    profit: "",
    rank: "",
    maintenance: "",
  });
  const [loadingFetch, setLoadingFetch] = useState(true);
  const [saveState, setSaveState] = useState<Record<PromptMode, PromptSaveState>>({
    profit: { loading: false, success: false, error: null },
    rank: { loading: false, success: false, error: null },
    maintenance: { loading: false, success: false, error: null },
  });

  useEffect(() => {
    fetchPrompts();
  }, []);

  async function fetchPrompts() {
    setLoadingFetch(true);
    try {
      const res = await fetch("/api/admin/ai-prompts");
      const json = await res.json();
      if (json.success) {
        setPrompts(json.data);
      }
    } catch (err) {
      console.error("[Admin] Failed to load prompts:", err);
    } finally {
      setLoadingFetch(false);
    }
  }

  async function savePrompt(mode: PromptMode) {
    setSaveState((prev) => ({
      ...prev,
      [mode]: { loading: true, success: false, error: null },
    }));

    try {
      const res = await fetch("/api/admin/ai-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, prompt: prompts[mode] }),
      });
      const json = await res.json();

      if (json.success) {
        setSaveState((prev) => ({
          ...prev,
          [mode]: { loading: false, success: true, error: null },
        }));
        // Reset success indicator after 3s
        setTimeout(() => {
          setSaveState((prev) => ({
            ...prev,
            [mode]: { ...prev[mode], success: false },
          }));
        }, 3000);
      } else {
        setSaveState((prev) => ({
          ...prev,
          [mode]: { loading: false, success: false, error: json.error || "Save failed" },
        }));
      }
    } catch (err) {
      setSaveState((prev) => ({
        ...prev,
        [mode]: { loading: false, success: false, error: String(err) },
      }));
    }
  }

  const modes: PromptMode[] = ["profit", "rank", "maintenance"];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b bg-background px-6 py-4 flex items-center justify-between gap-4 sticky top-0 z-20">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold">Admin Panel</h1>
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Sparkles className="w-3 h-3" />
              AI Configuration
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Customize AI strategy prompts for campaign suggestion generation
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={fetchPrompts}
          disabled={loadingFetch}
        >
          {loadingFetch ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCcw className="w-3.5 h-3.5" />
          )}
          Reload
        </Button>
      </div>

      {/* Info banner */}
      <div className="mx-6 mt-4 flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 dark:bg-blue-950/20 dark:border-blue-800 dark:text-blue-300">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          These prompts are injected into every AI suggestion generation call. The AI automatically
          applies the most relevant strategy based on each campaign&apos;s current situation.
          Changes take effect immediately on the next suggestion generation.
        </span>
      </div>

      {/* Prompt editors */}
      <div className="flex-1 overflow-auto px-6 py-4 space-y-5">
        {loadingFetch ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          modes.map((mode) => {
            const config = MODE_CONFIG[mode];
            const Icon = config.icon;
            const state = saveState[mode];

            return (
              <div
                key={mode}
                className={`rounded-xl border-2 ${config.borderColor} ${config.bgColor} overflow-hidden transition-all`}
              >
                {/* Card Header */}
                <div className="px-5 py-4 flex items-start gap-3 border-b border-current/10">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${config.bgColor} border ${config.borderColor}`}
                  >
                    <Icon className={`w-5 h-5 ${config.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className={`font-semibold text-sm ${config.color}`}>{config.label}</h2>
                      <Badge
                        variant="outline"
                        className={`text-[9px] uppercase tracking-wide ${config.color} border-current/30`}
                      >
                        {mode}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {config.description}
                    </p>
                  </div>
                </div>

                {/* Prompt editor */}
                <div className="px-5 py-4 space-y-3">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    System Prompt for {config.label}
                  </label>
                  <Textarea
                    value={prompts[mode]}
                    onChange={(e) =>
                      setPrompts((prev) => ({ ...prev, [mode]: e.target.value }))
                    }
                    placeholder={`Enter the AI instructions for ${config.label.toLowerCase()}…`}
                    className="min-h-[140px] text-xs resize-y font-mono leading-relaxed bg-background/80"
                  />

                  {/* Footer row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {state.success && (
                        <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Saved successfully
                        </span>
                      )}
                      {state.error && (
                        <span className="flex items-center gap-1 text-xs text-destructive">
                          <AlertCircle className="w-3.5 h-3.5" />
                          {state.error}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {prompts[mode].length} characters
                      </span>
                    </div>
                    <Button
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={() => savePrompt(mode)}
                      disabled={state.loading}
                    >
                      {state.loading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      {state.loading ? "Saving…" : "Save Prompt"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
