"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Campaign } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Loader2, Send, Bot, User, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AIChatPanelProps {
  campaign: Campaign;
  onClose: () => void;
  initialMessage?: string;
}

export function AIChatPanel({ campaign, onClose, initialMessage }: AIChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-fetch AI opening message on mount (skip if initialMessage provided)
  useEffect(() => {
    let cancelled = false;

    // If we already have an AI analysis, use it directly — no API call needed
    if (initialMessage) {
      setMessages([{ role: "assistant", content: initialMessage }]);
      setInitializing(false);
      setTimeout(() => inputRef.current?.focus(), 100);
      return;
    }

    async function fetchOpening() {
      setInitializing(true);
      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaign, messages: [] }),
        });
        const json = await res.json();
        if (!cancelled && json.success) {
          setMessages([{ role: "assistant", content: json.message }]);
        } else if (!cancelled) {
          setMessages([{
            role: "assistant",
            content: `I'm ready to help you analyze ${campaign.name}. What would you like to know about this campaign?`,
          }]);
        }
      } catch {
        if (!cancelled) {
          setMessages([{
            role: "assistant",
            content: `Ready to help with ${campaign.name}. Ask me anything about bids, ACOS, or strategy.`,
          }]);
        }
      } finally {
        if (!cancelled) {
          setInitializing(false);
          setTimeout(() => inputRef.current?.focus(), 100);
        }
      }
    }
    fetchOpening();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign, messages: updated }),
      });
      const json = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: json.success
            ? json.message
            : `Error: ${json.error}`,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Connection error: ${String(err)}` },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-dashed border-primary/30 mt-3 pt-3">
      {/* Section label */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-semibold text-primary uppercase tracking-wide">
            AI Chat — {campaign.name}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
        >
          close
        </button>
      </div>

      {/* Message thread */}
      <div className="flex flex-col gap-3 max-h-[280px] overflow-y-auto pr-1 pb-1 scrollbar-thin">
        {initializing ? (
          <div className="flex items-center gap-2 py-3 px-1">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Analyzing campaign data…
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={cn(
                "flex gap-2 items-start",
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              )}
            >
              {/* Avatar */}
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                  msg.role === "assistant"
                    ? "bg-primary/10 border border-primary/20"
                    : "bg-muted border border-border"
                )}
              >
                {msg.role === "assistant" ? (
                  <Bot className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </div>

              {/* Message bubble */}
              <div
                className={cn(
                  "text-xs leading-relaxed rounded-xl px-3 py-2 max-w-[82%]",
                  msg.role === "assistant"
                    ? "bg-muted text-foreground rounded-tl-sm"
                    : "bg-primary text-primary-foreground rounded-tr-sm"
                )}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}

        {/* AI typing indicator */}
        {loading && (
          <div className="flex gap-2 items-start">
            <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="bg-muted rounded-xl rounded-tl-sm px-3 py-2.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input row */}
      <div className="flex gap-2 items-end mt-3 pt-2 border-t border-border/50">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this campaign… (⏎ to send)"
          disabled={loading || initializing}
          rows={1}
          className="flex-1 text-xs rounded-lg border border-input bg-background/70 px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all placeholder:text-muted-foreground disabled:opacity-50 min-h-[34px] max-h-[90px]"
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />
        <Button
          size="sm"
          className="h-[34px] w-[34px] p-0 shrink-0"
          onClick={handleSend}
          disabled={!input.trim() || loading || initializing}
          title="Send (Enter)"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}
