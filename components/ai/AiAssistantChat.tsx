"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistantRole } from "@/lib/ai/assistantEngine";
import {
  CUSTOMER_PROMPTS,
  MERCHANT_PROMPTS,
  SHOP_PROMPTS,
} from "@/lib/ai/assistantEngine";
import { AssistantMessage } from "@/components/ai/AssistantMessage";
import { TrendBotAvatar } from "@/components/trendbot/TrendBotAvatar";
import {
  ChatShellBody,
  ChatShellFooter,
  ChatShellHeader,
  FullScreenChatShell,
} from "@/components/chat/FullScreenChatShell";
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
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  initialPrompts,
}: AiAssistantChatProps) {
  const [sessionId] = useState(() => `ai_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: "welcome", role: "assistant", text: welcomeMessage(role, title), timestamp: Date.now() },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinkingStep, setThinkingStep] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>(initialPrompts ?? defaultPrompts(role));
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
        .slice(-10)
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
            await sleep(400 + Math.random() * 300);
          }
        } else {
          setThinkingStep(`${TREND_BOT_NAME} soch raha hai…`);
          await sleep(500);
        }
        setThinkingStep(null);

        if (data.suggestions?.length) setSuggestions(data.suggestions);

        setMessages((prev) => [
          ...prev,
          {
            id: `a_${Date.now()}`,
            role: "assistant",
            text: data.reply ?? `😕 ${TREND_BOT_NAME} abhi jawab nahi de saka. Dubara try karein.`,
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
            text: "⚠️ Connection issue — internet check karke dubara try karein.",
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

      <ChatShellBody>
        <div className="flex flex-1 flex-col gap-2 py-1">
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
                className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm sm:max-w-[80%] ${
                  msg.role === "user"
                    ? "rounded-br-sm bg-gradient-to-br from-emerald-600 to-teal-600 text-white"
                    : "rounded-bl-sm border border-white/80 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                }`}
              >
                {msg.role === "assistant" ? <AssistantMessage text={msg.text} /> : msg.text}
              </div>
            </div>
          ))}

          {loading ? (
            <div className="flex justify-start gap-2">
              <TrendBotAvatar size="sm" animated wiggle />
              <div className="rounded-2xl rounded-bl-sm border border-white/80 bg-white px-4 py-3 shadow-sm dark:bg-zinc-800">
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
      </ChatShellBody>

      {suggestions.length > 0 && !loading ? (
        <div className="shrink-0 border-t border-emerald-100/80 bg-white px-3 py-2 dark:border-emerald-900/30 dark:bg-zinc-950">
          <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto scrollbar-none">
            {suggestions.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void send(prompt)}
                className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
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
            onClick={() => void send(input)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-md transition hover:opacity-90 disabled:opacity-40"
            aria-label="Send"
          >
            <SendIcon />
          </button>
        </div>
      </ChatShellFooter>
    </FullScreenChatShell>
  );
}
