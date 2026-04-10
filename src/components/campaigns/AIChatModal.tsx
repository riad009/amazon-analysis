"use client";

import { Campaign } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AIChatPanel } from "./AIChatPanel";
import { Bot } from "lucide-react";

interface AIChatModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: Campaign | null;
  initialMessage?: string;
}

export function AIChatModal({ open, onOpenChange, campaign, initialMessage }: AIChatModalProps) {
  if (!campaign) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bot className="w-5 h-5 text-primary" />
            AI Chat — {campaign.name}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Ask questions about this campaign&apos;s performance, bids, ACOS, and strategy.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-hidden px-6 py-4">
          <AIChatModalBody campaign={campaign} onClose={() => onOpenChange(false)} initialMessage={initialMessage} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Inner body — re-mounts AIChatPanel so it gets a fresh conversation each time.
 * Wrapped in its own component so it unmounts/remounts when campaign changes.
 */
function AIChatModalBody({ campaign, onClose, initialMessage }: { campaign: Campaign; onClose: () => void; initialMessage?: string }) {
  return (
    <div className="[&>div]:border-t-0 [&>div]:mt-0 [&>div]:pt-0 chat-modal-body">
      <style>{`.chat-modal-body .scrollbar-thin { max-height: 50vh; }`}</style>
      <AIChatPanel campaign={campaign} onClose={onClose} initialMessage={initialMessage} />
    </div>
  );
}
