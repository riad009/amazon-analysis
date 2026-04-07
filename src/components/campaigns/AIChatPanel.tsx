"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Campaign } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Loader2, Send, Bot, User, X, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AIChatPanelProps {
  campaign: Campaign;
  onClose: () => void;
}

export function AIChatPanel({ campaign, onClose }: AIChatPanelProps) {
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

  // Auto-send opening message from AI on first mount
  useEffect(() => {
    let cancelled = false;
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
            content: `Hi! I'm your Amazon PPC assistant for **${campaign.name}**. Ask me anything about this campaign's performance, bids, or strategy.`,
          }]);
        }
      } catch {
        if (!cancelled) {
          setMessages([{
            role: "assistant",
            content: `Hi! I'm ready to help you analyze **${campaign.name}**. What would you like to know?`,
          }]);
        }
      } finally {
        if (!cancelled) setInitializing(false);
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
      if (json.success) {
        setMessages((prev) => [...prev, { role: "assistant", content: json.message }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Sorry, I encountered an error: ${json.error}` },
        ]);
      }
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
    <div className="mt-2 rounded-xl border border-primary/20 bg-gradient-to-b from-primary/5 to-background shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border-b border-primary/15">
        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
          <MessageCircle className="w-3.5 h-3.5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">
            AI Chat — {campaign.name}
          </p>
          <p className="text-[10px] text-muted-foreground">Campaign-specific Amazon PPC assistant</p>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Close chat"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex flex-col gap-2.5 px-3 py-3 max-h-[320px] overflow-y-auto scrollbar-thin">
        {initializing ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Analyzing campaign…</span>
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
                  "w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                  msg.role === "assistant"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                )}
              >
                {msg.role === "assistant" ? (
                  <Bot className="w-3 h-3" />
                ) : (
                  <User className="w-3 h-3" />
                )}
              </div>

              {/* Bubble */}
              <div
                className={cn(
                  "rounded-xl px-3 py-2 text-xs max-w-[85%] leading-relaxed",
                  msg.role === "assistant"
                    ? "bg-muted text-foreground rounded-tl-none"
                    : "bg-primary text-primary-foreground rounded-tr-none"
                )}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}

        {/* Typing indicator */}
        {loading && (
          <div className="flex gap-2 items-start">
            <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
              <Bot className="w-3 h-3" />
            </div>
            <div className="bg-muted rounded-xl rounded-tl-none px-3 py-2 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-primary/15 p-2 flex gap-2 items-end bg-background/50">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this campaign… (Enter to send)"
          disabled={loading || initializing}
          rows={1}
          className="flex-1 text-xs rounded-lg border border-input bg-background px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all min-h-[34px] max-h-[100px] placeholder:text-muted-foreground disabled:opacity-50"
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />
        <Button
          size="sm"
          className="h-[34px] px-3 shrink-0 bg-primary hover:bg-primary/90"
          onClick={handleSend}
          disabled={!input.trim() || loading || initializing}
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
