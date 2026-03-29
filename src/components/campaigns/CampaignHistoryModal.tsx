"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, History, ArrowRight, User } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { formatDistanceToNow } from "date-fns";

interface HistoryEntry {
  _id: string;
  profileId: string;
  campaignId: string;
  field: string;
  oldValue: string | number;
  newValue: string | number;
  changedBy: string;
  changedAt: string;
}

interface CampaignHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
  profileId: string;
}

const FIELD_LABELS: Record<string, string> = {
  dailyBudget: "Daily Budget",
  bid: "Bid",
  status: "Status",
  biddingStrategy: "Bidding Strategy",
  placementBidTOS: "TOS Placement Bid",
  placementBidPP: "PP Placement Bid",
};

function formatFieldValue(field: string, value: string | number): string {
  if (field === "dailyBudget" || field === "bid") {
    return formatCurrency(Number(value));
  }
  if (field === "placementBidTOS" || field === "placementBidPP") {
    return `${value}%`;
  }
  return String(value);
}

export function CampaignHistoryModal({
  open,
  onOpenChange,
  campaignId,
  campaignName,
  profileId,
}: CampaignHistoryModalProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !campaignId || !profileId) return;
    setLoading(true);
    setError(null);

    fetch(
      `/api/amazon/campaigns/history?profileId=${encodeURIComponent(profileId)}&campaignId=${encodeURIComponent(campaignId)}`
    )
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setHistory(json.data);
        } else {
          setError(json.error || "Failed to load history");
        }
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [open, campaignId, profileId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="w-4 h-4" />
            Change History
          </DialogTitle>
          <p className="text-xs text-muted-foreground truncate" title={campaignName}>
            {campaignName}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto mt-2">
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading history…
            </div>
          )}

          {error && (
            <div className="text-center py-8 text-sm text-red-500">
              {error}
            </div>
          )}

          {!loading && !error && history.length === 0 && (
            <div className="text-center py-12 text-sm text-muted-foreground">
              <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No changes recorded yet for this campaign.
            </div>
          )}

          {!loading && !error && history.length > 0 && (
            <div className="space-y-1">
              {history.map((entry) => (
                <div
                  key={entry._id}
                  className="flex items-start gap-3 rounded-lg border px-3 py-2.5 text-xs"
                >
                  <div className="shrink-0 mt-0.5">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-[10px]">
                        {FIELD_LABELS[entry.field] || entry.field}
                      </Badge>
                      <span className="text-muted-foreground">
                        {formatDistanceToNow(new Date(entry.changedAt), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="font-mono text-red-600 line-through">
                        {formatFieldValue(entry.field, entry.oldValue)}
                      </span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="font-mono font-semibold text-emerald-600">
                        {formatFieldValue(entry.field, entry.newValue)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-muted-foreground">
                      <User className="w-3 h-3" />
                      <span>{entry.changedBy}</span>
                      <span className="mx-1">·</span>
                      <span>{new Date(entry.changedAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
