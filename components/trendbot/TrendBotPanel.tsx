"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistantRole } from "@/lib/ai/assistantEngine";
import { AssistantMessage } from "@/components/ai/AssistantMessage";
import { TrendBotAvatar } from "@/components/trendbot/TrendBotAvatar";
import { TREND_BOT_NAME, TREND_BOT_TAGLINE } from "@/lib/ai/trendBotBrand";

interface ChatMessage {
  id: string;
  role: "user" | "bot";
  text: string;
  timestamp: number;
}

export interface TrendBotPanelProps {
  role: AssistantRole;
  shopId?: string;
  shopName?: string;
  welcomeText: string;
  initialPrompts: string[];
  open: boolean;
  onClose: () => void;
  subtitle?: string;
  /** Panel anchor — global left, shop pages right */
  anchor?: "left" | "right";
}

function SendIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
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

export function TrendBotPanel({
  role,
  shopId,
  shopName,
  welcomeText,
  initialPrompts,
  open,
  onClose,
  subtitle,
  anchor = "left",
}: TrendBotPanelProps) {
  const [sessionId] = useState(() => `tb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: "welcome", role: "bot", text: welcomeText, timestamp: Date.now() },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinkingStep, setThinkingStep] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState(initialPrompts);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const headerTitle =
    role === "shop" && shopName ? `${shopName} · ${TREND_BOT_NAME}` : TREND_BOT_NAME;
  const headerSub = subtitle ?? TREND_BOT_TAGLINE;
  const anchorClass = anchor === "right" ? "right-4 left-auto" : "left-4";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinkingStep]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  const sendMessage = useCallback(
    async (textOverride?: string) => {
      const text = (textOverride ?? input).trim();
      if (!text || loading) return;

      const userMessage: ChatMessage = {
        id: `u_${Date.now()}`,
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
        const res = await fetch("/api/ai-assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, role, shopId, sessionId, history }),
        });

        const data = (await res.json()) as {
          reply?: string;
          suggestions?: string[];
          thinkingSteps?: string[];
          error?: string;
        };

        if (data.thinkingSteps?.length) {
          for (const step of data.thinkingSteps) {
            setThinkingStep(step);
            await new Promise((r) => setTimeout(r, 380 + Math.random() * 320));
          }
        } else {
          setThinkingStep(`${TREND_BOT_NAME} soch raha hai…`);
          await new Promise((r) => setTimeout(r, 550));
        }
        setThinkingStep(null);

        if (data.suggestions?.length) setSuggestions(data.suggestions);

        let reply = data.reply;
        if (!reply) {
          if (data.error === "auth_required") {
            reply =
              "🔐 Is feature ke liye sign in chahiye.\n\n[Sign in](/login) karein — warna product search ke liye [TrendBot](/assistant) public page use karein.";
          } else {
            reply =
              "😕 Abhi jawab generate nahi ho saka.\n\n• Internet check karein\n• Sawal thora clear likhein\n• Ya try: *best mobile ka link do*";
          }
        }

        setMessages((prev) => [
          ...prev,
          { id: `b_${Date.now()}`, role: "bot", text: reply, timestamp: Date.now() },
        ]);
      } catch {
        setThinkingStep(null);
        setMessages((prev) => [
          ...prev,
          {
            id: `e_${Date.now()}`,
            role: "bot",
            text:
              "⚠️ *Connection issue*\n\nInternet check karein aur dubara try karein. Agar masla barhta hai to [Support](/support) se rabta karein.",
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages, role, sessionId, shopId],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  return (
    <div
      className={`fixed bottom-24 ${anchorClass} z-[140] w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-2xl shadow-emerald-900/10 transition-all duration-300 md:bottom-8 ${
        open ? "tm-trendbot-panel-open scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0 translate-y-4"
      }`}
      role="dialog"
      aria-label={`${TREND_BOT_NAME} chat`}
      aria-hidden={!open}
    >
      <div className="flex items-center gap-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-teal-500 px-3 py-3 text-white">
        <TrendBotAvatar size="sm" animated={!loading} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold tracking-tight">{headerTitle}</p>
          <p className="truncate text-[0.65rem] opacity-90">{headerSub}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1.5 transition hover:bg-white/15"
          aria-label="Close TrendBot"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="h-[min(320px,45dvh)] overflow-y-auto bg-gradient-to-b from-white to-emerald-50/40 px-3 py-3">
        <div className="space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start gap-2"}`}>
              {msg.role === "bot" ? (
                <div className="mt-1 shrink-0">
                  <TrendBotAvatar size="sm" animated={false} />
                </div>
              ) : null}
              <div
                className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "rounded-br-md bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/20"
                    : "rounded-bl-md border border-emerald-100/80 bg-white text-zinc-800 shadow-sm"
                }`}
              >
                {msg.role === "bot" ? <AssistantMessage text={msg.text} /> : msg.text}
              </div>
            </div>
          ))}
          {loading ? (
            <div className="flex justify-start gap-2">
              <TrendBotAvatar size="sm" animated wiggle />
              <div className="rounded-2xl rounded-bl-md border border-emerald-100 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  <span className="text-xs font-medium text-emerald-700">{thinkingStep ?? "Processing…"}</span>
                </div>
              </div>
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {!loading && suggestions.length > 0 ? (
        <div className="border-t border-emerald-100 bg-white px-2 py-2">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            {suggestions.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => void sendMessage(p)}
                className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[0.65rem] font-semibold text-emerald-800 transition hover:bg-emerald-100"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="border-t border-emerald-100 bg-white p-2.5">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="TrendBot se pucho… (Urdu / English)"
            disabled={loading}
            className="flex-1 rounded-xl border border-emerald-100 bg-emerald-50/50 px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={loading || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send"
          >
            <SendIcon />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[0.6rem] text-emerald-600/70">
          {TREND_BOT_NAME} · Powered by TrendsMart · 100% Free AI
        </p>
      </div>
    </div>
  );
}
