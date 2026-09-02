"use client";

import { useEffect, useRef } from "react";
import type { AssistantRole } from "@/lib/ai/assistantEngine";
import { AssistantMessage } from "@/components/ai/AssistantMessage";
import { TrendBotAvatar } from "@/components/trendbot/TrendBotAvatar";
import { useTrendBotChat } from "@/hooks/useTrendBotChat";
import { TREND_BOT_NAME, TREND_BOT_TAGLINE } from "@/lib/ai/trendBotBrand";
import {
  ChatShellBody,
  ChatShellFooter,
  ChatShellHeader,
  FullScreenChatShell,
} from "@/components/chat/FullScreenChatShell";

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

  useEffect(() => {
    if (!open) return;
    document.documentElement.classList.add("tm-trendbot-open");
    return () => {
      document.documentElement.classList.remove("tm-trendbot-open");
    };
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const headerTitle = role === "shop" && shopName ? shopName : TREND_BOT_NAME;
  const headerSub = subtitle ?? TREND_BOT_TAGLINE;

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinkingStep, open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  if (!open) return null;

  return (
    <FullScreenChatShell className="z-[130]">
      <ChatShellHeader
        title={headerTitle}
        subtitle={`${headerSub} · ${sessionLabel}`}
        onBack={onClose}
        backLabel="Close TrendBot"
        avatar={<TrendBotAvatar size="sm" animated={!loading} />}
        badge="AI"
      />

      <ChatShellBody>
        <div className="space-y-3 py-1">
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
      </ChatShellBody>

      {!loading && suggestions.length > 0 ? (
        <div className="shrink-0 border-t border-emerald-100 bg-white px-3 py-2 dark:border-emerald-900/30 dark:bg-zinc-950">
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {suggestions.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => void sendMessage(p)}
                className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <ChatShellFooter>
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message…"
            disabled={loading}
            className="max-h-28 min-h-[48px] flex-1 resize-none rounded-3xl border border-emerald-100 bg-white px-4 py-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none dark:border-emerald-900/40 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={loading || !input.trim()}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-md disabled:opacity-40"
            aria-label="Send"
          >
            <SendIcon />
          </button>
        </div>
      </ChatShellFooter>
    </FullScreenChatShell>
  );
}
