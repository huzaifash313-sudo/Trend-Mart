"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AssistantMessage } from "@/components/ai/AssistantMessage";
import { SHOP_PROMPTS } from "@/lib/ai/assistantEngine";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — AI Business Assistant Chat Widget                              */
/*                                                                             */
/*  A floating chat bubble and expandable chat window that appears on          */
/*  storefront pages. Customers can ask questions and the AI responds          */
/*  based on the shop's active products, pricing, hours, and location.         */
/* -------------------------------------------------------------------------- */

// ─── Icons ──────────────────────────────────────────────────────────────────

function ChatIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /><circle cx="12" cy="16" r="1" />
    </svg>
  );
}

function ThumbsUpIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" /><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function ThumbsDownIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" /><path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
    </svg>
  );
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "bot";
  text: string;
  timestamp: number;
  feedback?: "helpful" | "not_helpful";
}

interface ChatWidgetProps {
  shopId: string;
  shopName?: string;
  accentHex?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ChatWidget({ shopId, shopName = "Shop", accentHex = "#10b981" }: ChatWidgetProps) {
  const [sessionId] = useState(
    () => `chat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  );

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: "welcome",
      role: "bot",
      text: `👋 *Salam!* Main *${shopName}* ka AI assistant hoon.\n\nPooch sakte hain products, prices, timings — ya seedha:\n"best mobile ka link do"\n\nLinks tap karke product khol sakte hain.`,
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinkingStep, setThinkingStep] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>(SHOP_PROMPTS);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const sendMessage = useCallback(async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;

    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: "user",
      text,
      timestamp: Date.now(),
    };

    const history = [...messages, userMessage]
      .filter((m) => m.id !== "welcome")
      .slice(-8)
      .map((m) => ({
        role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
        text: m.text,
      }));

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setThinkingStep(null);

    try {
      const response = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, role: "shop", shopId, sessionId, history }),
      });

      const data = (await response.json()) as {
        reply: string;
        suggestions?: string[];
        thinkingSteps?: string[];
      };

      if (data.thinkingSteps?.length) {
        for (const step of data.thinkingSteps) {
          setThinkingStep(step);
          await new Promise((r) => setTimeout(r, 400 + Math.random() * 300));
        }
      } else {
        setThinkingStep("Scanning catalog…");
        await new Promise((r) => setTimeout(r, 500));
      }
      setThinkingStep(null);

      if (data.suggestions?.length) setSuggestions(data.suggestions);

      setMessages((prev) => [
        ...prev,
        {
          id: `bot_${Date.now()}`,
          role: "bot",
          text: data.reply ?? "Sorry, I couldn't process that. Please try again.",
          timestamp: Date.now(),
        },
      ]);
    } catch {
      setThinkingStep(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `bot_${Date.now()}`,
          role: "bot",
          text: "I'm having trouble connecting. Please check your internet and try again.",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, shopId, sessionId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  const handleFeedback = useCallback((messageId: string, feedback: "helpful" | "not_helpful") => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, feedback } : m)),
    );
  }, []);

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`fixed bottom-24 right-4 z-[140] flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 active:scale-95 md:bottom-8 ${
          open ? "scale-0 opacity-0" : "scale-100 opacity-100"
        }`}
        style={{ backgroundColor: accentHex }}
        aria-label={open ? "Close chat" : "Open chat assistant"}
      >
        <span className="text-white">{open ? <CloseIcon /> : <ChatIcon />}</span>
      </button>

      {/* Chat window */}
      <div
        className={`fixed bottom-24 right-4 z-[140] w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 dark:bg-zinc-900 md:bottom-8 ${
          open ? "scale-100 opacity-100 translate-y-0" : "scale-95 opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 text-white"
          style={{ backgroundColor: accentHex }}
        >
          <div className="flex items-center gap-2">
            <BotIcon />
            <div>
              <p className="text-sm font-bold">{shopName} Assistant</p>
              <p className="text-[0.6rem] opacity-80">Free AI · Products & orders help</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full p-1 hover:bg-white/10 transition-colors"
            aria-label="Close chat"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Messages */}
        <div className="h-80 overflow-y-auto bg-zinc-50 px-3 py-3 space-y-3 dark:bg-[color:var(--tm-surface)]">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "rounded-br-md text-white"
                    : "rounded-bl-md bg-white text-zinc-800 shadow-sm dark:bg-zinc-800 dark:text-zinc-200"
                }`}
                style={msg.role === "user" ? { backgroundColor: accentHex } : undefined}
              >
                {msg.role === "bot" ? <AssistantMessage text={msg.text} /> : msg.text}
                {msg.role === "bot" && msg.id !== "welcome" && (
                  <div className="mt-1.5 flex items-center gap-2 border-t border-zinc-100 pt-1.5 dark:border-zinc-700">
                    <span className="text-[0.6rem] text-zinc-400">Was this helpful?</span>
                    <button
                      type="button"
                      onClick={() => handleFeedback(msg.id, "helpful")}
                      className={`rounded p-0.5 transition-colors ${
                        msg.feedback === "helpful"
                          ? "text-emerald-500"
                          : "text-zinc-300 hover:text-emerald-500 dark:text-zinc-600"
                      }`}
                      aria-label="Helpful"
                    >
                      <ThumbsUpIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFeedback(msg.id, "not_helpful")}
                      className={`rounded p-0.5 transition-colors ${
                        msg.feedback === "not_helpful"
                          ? "text-red-500"
                          : "text-zinc-300 hover:text-red-500 dark:text-zinc-600"
                      }`}
                      aria-label="Not helpful"
                    >
                      <ThumbsDownIcon />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md bg-white px-4 py-2.5 shadow-sm dark:bg-zinc-800">
                <p className="text-[0.65rem] font-medium text-zinc-600 dark:text-zinc-300">
                  {thinkingStep ?? "Processing…"}
                </p>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick prompts */}
        {!loading && suggestions.length > 0 && (
          <div className="border-t border-zinc-100 bg-white px-2 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
              {suggestions.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => void sendMessage(p)}
                  className="shrink-0 rounded-full border border-zinc-200 px-2.5 py-1 text-[0.65rem] font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question"
              disabled={loading}
              className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-300/50 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500/40"
            />
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={loading || !input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: accentHex }}
              aria-label="Send message"
            >
              <SendIcon />
            </button>
          </div>
          <p className="mt-1.5 text-center text-[0.6rem] text-zinc-400 dark:text-zinc-500">
            AI assistant for {shopName} • Powered by TrendsMart
          </p>
        </div>
      </div>
    </>
  );
}