"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { AssistantRole } from "@/lib/ai/assistantEngine";
import {
  CUSTOMER_PROMPTS,
  MERCHANT_PROMPTS,
  SHOP_PROMPTS,
} from "@/lib/ai/assistantEngine";
import { AssistantMessage } from "@/components/ai/AssistantMessage";
import { TrendBotAvatar } from "@/components/trendbot/TrendBotAvatar";
import { TREND_BOT_NAME, TREND_BOT_TAGLINE, TREND_BOT_WELCOME_CUSTOMER } from "@/lib/ai/trendBotBrand";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

interface AiAssistantChatProps {
  role: AssistantRole;
  shopId?: string;
  title: string;
  subtitle: string;
  accentClass?: string;
  backHref?: string;
  backLabel?: string;
  initialPrompts?: string[];
}

function SendIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function renderFormattedText(text: string): React.ReactNode {
  return <AssistantMessage text={text} />;
}

function defaultPrompts(role: AssistantRole): string[] {
  if (role === "merchant") return MERCHANT_PROMPTS;
  if (role === "shop") return SHOP_PROMPTS;
  return CUSTOMER_PROMPTS;
}

function welcomeMessage(role: AssistantRole, title: string): string {
  if (role === "merchant") {
    return `👋 *Salam!* Main *TrendBot Business Coach* hoon — *${title}* ke liye.\n\n*Live analytics*, best products, growth strategy — sab aapke real store data se.\n\nTry: "Meri shop ki live summary" ya "Aaj kitne orders aaye?"`;
  }
  if (role === "shop") {
    return `👋 *Welcome!* Main *${title}* ka TrendBot hoon.\n\nProducts, prices, links — ya "best mobile ka link do".\n\nHuman chat: *Message seller* button.`;
  }
  return TREND_BOT_WELCOME_CUSTOMER;
}

export default function AiAssistantChat({
  role,
  shopId,
  title,
  subtitle,
  accentClass = "from-emerald-600 via-teal-600 to-teal-500",
  backHref,
  backLabel = "← Back",
  initialPrompts,
}: AiAssistantChatProps) {
  const [sessionId] = useState(
    () => `ai_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  );
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      text: welcomeMessage(role, title),
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinkingStep, setThinkingStep] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>(
    initialPrompts ?? defaultPrompts(role),
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, thinkingStep]);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: ChatMessage = {
        id: `u_${Date.now()}`,
        role: "user",
        text: trimmed,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);
      setThinkingStep(null);

      const history = [...messages, userMsg]
        .filter((m) => m.id !== "welcome")
        .slice(-8)
        .map((m) => ({ role: m.role === "user" ? ("user" as const) : ("assistant" as const), text: m.text }));

      try {
        const res = await fetch("/api/ai-assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, role, shopId, sessionId, history }),
        });
        const data = (await res.json()) as {
          reply?: string;
          suggestions?: string[];
          thinkingSteps?: string[];
        };

        if (data.thinkingSteps?.length) {
          for (const step of data.thinkingSteps) {
            setThinkingStep(step);
            await sleep(450 + Math.random() * 350);
          }
        } else {
          setThinkingStep(`${TREND_BOT_NAME} soch raha hai…`);
          await sleep(600);
        }
        setThinkingStep(null);

        if (data.suggestions?.length) {
          setSuggestions(data.suggestions);
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `a_${Date.now()}`,
            role: "assistant",
            text: data.reply ?? `😕 ${TREND_BOT_NAME} abhi jawab nahi de saka. Dubara try karein ya sawal clear likhein.`,
            timestamp: Date.now(),
          },
        ]);
      } catch {
        setThinkingStep(null);
        setMessages((prev) => [
          ...prev,
          {
            id: `e_${Date.now()}`,
            role: "assistant",
            text: "Connection issue — check internet and retry.",
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [loading, messages, role, sessionId, shopId],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100dvh-8rem)] max-w-3xl flex-col px-4 py-4 pb-safe-nav">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            {TREND_BOT_NAME} · {TREND_BOT_TAGLINE}
          </p>
          <h1 className="tm-font-display text-xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            {role === "merchant" ? "TrendBot Business Coach" : TREND_BOT_NAME}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>
        </div>
        {backHref ? (
          <Link
            href={backHref}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            {backLabel}
          </Link>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-lg shadow-emerald-900/5 dark:border-emerald-900/30 dark:bg-zinc-900">
        <div className={`flex shrink-0 items-center gap-3 bg-gradient-to-r ${accentClass} px-4 py-3 text-white`}>
          <TrendBotAvatar size="sm" animated={!loading} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{role === "merchant" ? title : TREND_BOT_NAME}</p>
            <p className="text-[0.65rem] opacity-90">{TREND_BOT_TAGLINE}</p>
          </div>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide">
            Free
          </span>
        </div>

        <div className="flex-1 overflow-y-auto bg-gradient-to-b from-white to-emerald-50/30 px-3 py-4 dark:from-zinc-950 dark:to-emerald-950/10 sm:px-4">
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start gap-2"}`}
              >
                {msg.role === "assistant" ? (
                  <div className="mt-1 shrink-0">
                    <TrendBotAvatar size="sm" animated={false} />
                  </div>
                ) : null}
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed sm:max-w-[78%] ${
                    msg.role === "user"
                      ? "rounded-br-md bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/20"
                      : "rounded-bl-md border border-emerald-100 bg-white text-zinc-800 shadow-sm dark:border-emerald-900/30 dark:bg-zinc-900 dark:text-zinc-100"
                  }`}
                >
                  {renderFormattedText(msg.text)}
                </div>
              </div>
            ))}
            {loading ? (
              <div className="flex justify-start gap-2">
                <TrendBotAvatar size="sm" animated wiggle />
                <div className="rounded-2xl rounded-bl-md border border-emerald-100 bg-white px-4 py-3 shadow-sm dark:border-emerald-900/40 dark:bg-zinc-900">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      {thinkingStep ?? "Processing…"}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Quick prompts */}
        {suggestions.length > 0 && !loading ? (
          <div className="shrink-0 border-t border-zinc-100 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-400">
              Quick prompts
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {suggestions.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void send(prompt)}
                  className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Composer */}
        <div className="shrink-0 border-t border-zinc-100 p-3 dark:border-zinc-800">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="TrendBot se pucho… (Urdu / English)"
              className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-emerald-100 bg-emerald-50/50 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-emerald-900/40 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <button
              type="button"
              disabled={loading || !input.trim()}
              onClick={() => void send(input)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-600 text-white transition hover:opacity-90 disabled:opacity-40"
              aria-label="Send"
            >
              <SendIcon />
            </button>
          </div>
          <p className="mt-2 text-center text-[0.6rem] text-emerald-600/70">
            {TREND_BOT_NAME} · Powered by TrendsMart · 100% Free AI
          </p>
        </div>
      </div>
    </div>
  );
}
