"use client";

import { useEffect, useRef } from "react";
import type { AssistantRole } from "@/lib/ai/assistantEngine";
import { AssistantMessage } from "@/components/ai/AssistantMessage";
import { TrendBotAvatar } from "@/components/trendbot/TrendBotAvatar";
import { useTrendBotChat } from "@/hooks/useTrendBotChat";
import { TREND_BOT_NAME, TREND_BOT_TAGLINE } from "@/lib/ai/trendBotBrand";

export interface TrendBotPanelProps {
  role: AssistantRole;
  shopId?: string;
  shopName?: string;
  shopCategory?: string;
  welcomeText: string;
  initialPrompts: string[];
  open: boolean;
  onClose: () => void;
  subtitle?: string;
}

function SendIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
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

/** Full-screen TrendBot — sits between navbar and bottom nav */
export function TrendBotPanel({
  role,
  shopId,
  shopName,
  shopCategory,
  welcomeText,
  initialPrompts,
  open,
  onClose,
  subtitle,
}: TrendBotPanelProps) {
  const {
    messages,
    input,
    setInput,
    loading,
    thinkingStep,
    suggestions,
    sendMessage,
    setFeedback,
    sessionLabel,
  } = useTrendBotChat({ role, shopId, shopName, shopCategory, welcomeText, initialPrompts });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const headerTitle = role === "shop" && shopName ? shopName : TREND_BOT_NAME;
  const headerSub = subtitle ?? TREND_BOT_TAGLINE;

  useEffect(() => {
    if (!open) return;
    document.documentElement.classList.add("tm-trendbot-open");
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    return () => {
      document.documentElement.classList.remove("tm-trendbot-open");
      document.body.style.overflow = "";
      clearTimeout(t);
    };
  }, [open]);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinkingStep, open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  return (
    <div
      className={`tm-trendbot-fullscreen fixed inset-x-0 z-[125] flex flex-col bg-white transition-transform duration-300 ease-out dark:bg-zinc-950 ${
        open ? "translate-y-0" : "pointer-events-none translate-y-full"
      }`}
      style={{
        top: "var(--tm-navbar-sticky-offset, 62px)",
        bottom: "calc(3.75rem + env(safe-area-inset-bottom, 0px))",
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`${TREND_BOT_NAME} chat`}
      aria-hidden={!open}
    >
      <div className="relative shrink-0 overflow-hidden bg-gradient-to-r from-emerald-600 via-teal-600 to-teal-500 px-4 py-3 text-white shadow-md">
        <div className="relative flex items-center gap-3">
          <TrendBotAvatar size="md" animated={!loading} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-base font-bold tracking-tight">{headerTitle}</p>
              <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[0.55rem] font-bold uppercase">
                AI
              </span>
            </div>
            <p className="truncate text-xs opacity-90">{headerSub}</p>
            <p className="mt-0.5 truncate text-[0.65rem] opacity-75">{sessionLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/15 p-2 transition hover:bg-white/25"
            aria-label="Close TrendBot"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gradient-to-b from-white via-emerald-50/20 to-white px-4 py-4 dark:from-zinc-950 dark:via-emerald-950/10 dark:to-zinc-950">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start gap-2.5"}`}
            >
              {msg.role === "bot" ? (
                <div className="mt-0.5 shrink-0">
                  <TrendBotAvatar size="sm" animated={false} />
                </div>
              ) : null}
              <div className="max-w-[88%] sm:max-w-[80%]">
                <div
                  className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "rounded-br-md bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/25"
                      : "rounded-bl-md border border-emerald-100/90 bg-white text-zinc-800 shadow-sm dark:border-emerald-900/40 dark:bg-zinc-900 dark:text-zinc-100"
                  }`}
                >
                  {msg.role === "bot" ? <AssistantMessage text={msg.text} /> : msg.text}
                </div>
                {msg.role === "bot" && msg.id !== "welcome" ? (
                  <div className="mt-1.5 flex items-center gap-2 px-1">
                    <span className="text-[0.6rem] text-zinc-400">Helpful?</span>
                    <button
                      type="button"
                      onClick={() => setFeedback(msg.id, "helpful")}
                      className={`rounded p-1 transition ${msg.feedback === "helpful" ? "text-emerald-600" : "text-zinc-300 hover:text-emerald-500"}`}
                      aria-label="Helpful"
                    >
                      <ThumbsUpIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => setFeedback(msg.id, "not_helpful")}
                      className={`rounded p-1 transition ${msg.feedback === "not_helpful" ? "text-red-500" : "text-zinc-300 hover:text-red-400"}`}
                      aria-label="Not helpful"
                    >
                      <ThumbsDownIcon />
                    </button>
                    {msg.feedback === "helpful" ? (
                      <span className="text-[0.6rem] text-emerald-600">Shukriya — seekh liya!</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {loading ? (
            <div className="flex justify-start gap-2.5">
              <TrendBotAvatar size="sm" animated wiggle />
              <div className="rounded-2xl rounded-bl-md border border-emerald-100 bg-white px-4 py-3 shadow-sm dark:border-emerald-900/40 dark:bg-zinc-900">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  </span>
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    {thinkingStep ?? "Processing…"}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {!loading && suggestions.length > 0 ? (
        <div className="shrink-0 border-t border-emerald-100 bg-white/95 px-4 py-2.5 backdrop-blur-sm dark:border-emerald-900/30 dark:bg-zinc-950/95">
          <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-emerald-600/80">
            Suggested for you
          </p>
          <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
            {suggestions.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => void sendMessage(p)}
                className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 active:scale-95 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="shrink-0 border-t border-emerald-100 bg-white px-4 py-3 dark:border-emerald-900/30 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="TrendBot se kuch bhi pucho… (Urdu / English)"
            disabled={loading}
            className="max-h-28 min-h-[48px] flex-1 resize-none rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50 dark:border-emerald-900/40 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={loading || !input.trim()}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/30 transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send"
          >
            <SendIcon />
          </button>
        </div>
        <p className="mx-auto mt-2 max-w-2xl text-center text-[0.65rem] text-emerald-600/70">
          {TREND_BOT_NAME} · Powered by TrendsMart · Learns from your feedback
        </p>
      </div>
    </div>
  );
}
