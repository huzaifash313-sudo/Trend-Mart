"use client";

import { useRef } from "react";
import Link from "next/link";
import type { AssistantRole } from "@/lib/ai/assistantEngine";
import {
  CUSTOMER_PROMPTS,
  MERCHANT_PROMPTS,
  SHOP_PROMPTS,
} from "@/lib/ai/assistantEngine";
import { AssistantMessage } from "@/components/ai/AssistantMessage";
import { ProductResultCards } from "@/components/ai/ProductResultCards";
import { TrendBotAvatar } from "@/components/trendbot/TrendBotAvatar";
import {
  ChatShellBody,
  ChatShellFooter,
  ChatShellHeader,
  FullScreenChatShell,
} from "@/components/chat/FullScreenChatShell";
import { TREND_BOT_NAME, TREND_BOT_TAGLINE, TREND_BOT_WELCOME_CUSTOMER } from "@/lib/ai/trendBotBrand";
import { useTrendBotChat } from "@/hooks/useTrendBotChat";

interface AiAssistantChatProps {
  role: AssistantRole;
  shopId?: string;
  shopName?: string;
  shopCategory?: string;
  title: string;
  subtitle: string;
  backHref?: string;
  backLabel?: string;
  initialPrompts?: string[];
  initialQuery?: string | null;
}

function SendIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
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
    return `👋 *Welcome!* Main *${title}* ka TrendBot hoon.\n\nProducts, prices, links — ya "best mobile ka link do".`;
  }
  return TREND_BOT_WELCOME_CUSTOMER;
}

export default function AiAssistantChat({
  role,
  shopId,
  shopName,
  shopCategory,
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  initialPrompts,
  initialQuery,
}: AiAssistantChatProps) {
  const prompts = initialPrompts ?? defaultPrompts(role);
  const {
    messages,
    input,
    setInput,
    loading,
    thinkingStep,
    suggestions,
    sendMessage,
    setFeedback,
    showOnboarding,
    dismissOnboarding,
  } = useTrendBotChat({
    role,
    shopId,
    shopName,
    shopCategory,
    welcomeText: welcomeMessage(role, title),
    initialPrompts: prompts,
    initialQuery,
  });

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const headerTitle = role === "merchant" ? title : TREND_BOT_NAME;

  return (
    <FullScreenChatShell>
      <ChatShellHeader
        title={headerTitle}
        subtitle={role === "merchant" ? subtitle : TREND_BOT_TAGLINE}
        backHref={backHref}
        backLabel={backLabel}
        avatar={<TrendBotAvatar size="sm" animated={!loading} />}
        badge="Free AI"
      />

      {showOnboarding ? (
        <div className="shrink-0 border-b border-emerald-100 bg-emerald-50/90 px-3 py-2 dark:border-emerald-900/40 dark:bg-emerald-950/40">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[0.7rem] text-emerald-800 dark:text-emerald-200">
              Shareable tip: <code className="rounded bg-white/70 px-1">/assistant?q=best+mobile</code>
            </p>
            <button type="button" onClick={dismissOnboarding} className="text-[0.65rem] font-semibold text-emerald-700">
              Got it
            </button>
          </div>
        </div>
      ) : null}

      <ChatShellBody>
        <div className="flex flex-1 flex-col gap-2 py-1">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start gap-2"}`}
            >
              {msg.role === "bot" ? (
                <div className="mt-1 shrink-0">
                  <TrendBotAvatar size="sm" animated={false} />
                </div>
              ) : null}
              <div className="max-w-[88%] sm:max-w-[80%]">
                <div
                  className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                    msg.role === "user"
                      ? "rounded-br-sm bg-gradient-to-br from-emerald-600 to-teal-600 text-white"
                      : "rounded-bl-sm border border-white/80 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  }`}
                >
                  {msg.role === "bot" ? <AssistantMessage text={msg.text} /> : msg.text}
                </div>
                {msg.role === "bot" && msg.products?.length ? (
                  <ProductResultCards products={msg.products} />
                ) : null}
                {msg.role === "bot" && msg.id !== "welcome" ? (
                  <div className="mt-1 flex gap-2 px-1">
                    <button
                      type="button"
                      onClick={() => setFeedback(msg.id, "helpful")}
                      className={`text-[0.65rem] font-semibold ${msg.feedback === "helpful" ? "text-emerald-600" : "text-zinc-400"}`}
                    >
                      👍 Helpful
                    </button>
                    <button
                      type="button"
                      onClick={() => setFeedback(msg.id, "not_helpful")}
                      className={`text-[0.65rem] font-semibold ${msg.feedback === "not_helpful" ? "text-red-500" : "text-zinc-400"}`}
                    >
                      👎
                    </button>
                    {msg.handoff ? (
                      <Link href={msg.handoff.href} className="ml-auto text-[0.65rem] font-semibold text-emerald-700">
                        {msg.handoff.label} →
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {loading ? (
            <div className="flex justify-start gap-2">
              <TrendBotAvatar size="sm" animated wiggle />
              <div className="rounded-2xl rounded-bl-sm border border-white/80 bg-white px-4 py-3 shadow-sm dark:bg-zinc-800">
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  {thinkingStep ?? "Processing…"}
                </span>
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </ChatShellBody>

      {suggestions.length > 0 && !loading ? (
        <div className="shrink-0 border-t border-emerald-100/80 bg-white px-3 py-2 dark:border-emerald-900/30 dark:bg-zinc-950">
          <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto scrollbar-none">
            {suggestions.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void sendMessage(prompt)}
                className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800"
              >
                {prompt}
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
            className="max-h-28 min-h-[44px] flex-1 resize-none rounded-3xl border border-emerald-100 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-emerald-900/40 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="button"
            disabled={loading || !input.trim()}
            onClick={() => void sendMessage()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-md disabled:opacity-40"
            aria-label="Send"
          >
            <SendIcon />
          </button>
        </div>
      </ChatShellFooter>
    </FullScreenChatShell>
  );
}
