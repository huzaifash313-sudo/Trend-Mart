"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistantRole } from "@/lib/ai/assistantEngine";
import { TREND_BOT_NAME } from "@/lib/ai/trendBotBrand";
import {
  getSessionLabel,
  personalizePrompts,
  recordTrendBotHelpful,
  recordTrendBotNotHelpful,
  recordTrendBotQuery,
  startTrendBotSession,
} from "@/lib/ai/trendBotMemory";

export interface TrendBotMessage {
  id: string;
  role: "user" | "bot";
  text: string;
  timestamp: number;
  intent?: string;
  feedback?: "helpful" | "not_helpful";
}

interface UseTrendBotChatOptions {
  role: AssistantRole;
  shopId?: string;
  shopName?: string;
  shopCategory?: string;
  welcomeText: string;
  initialPrompts: string[];
}

export function useTrendBotChat({
  role,
  shopId,
  shopName,
  shopCategory,
  welcomeText,
  initialPrompts,
}: UseTrendBotChatOptions) {
  const [sessionId] = useState(() => `tb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
  const [sessionCount, setSessionCount] = useState(1);
  const [messages, setMessages] = useState<TrendBotMessage[]>(() => [
    { id: "welcome", role: "bot", text: welcomeText, timestamp: Date.now() },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinkingStep, setThinkingStep] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState(initialPrompts);
  const lastUserQuery = useRef("");

  useEffect(() => {
    const mem = startTrendBotSession(shopCategory);
    setSessionCount(mem.sessions);
    setSuggestions(personalizePrompts(initialPrompts));
  }, [initialPrompts, shopCategory]);

  const sendMessage = useCallback(
    async (textOverride?: string) => {
      const text = (textOverride ?? input).trim();
      if (!text || loading) return;

      lastUserQuery.current = text;
      recordTrendBotQuery(text);

      const userMessage: TrendBotMessage = {
        id: `u_${Date.now()}`,
        role: "user",
        text,
        timestamp: Date.now(),
      };

      const history = [...messages, userMessage]
        .filter((m) => m.id !== "welcome")
        .slice(-10)
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
          body: JSON.stringify({
            message: text,
            role,
            shopId,
            shopName,
            shopCategory,
            sessionId,
            history,
            memoryHints: personalizePrompts([]).slice(0, 3),
          }),
        });

        const data = (await res.json()) as {
          reply?: string;
          suggestions?: string[];
          thinkingSteps?: string[];
          intent?: string;
          error?: string;
        };

        if (data.thinkingSteps?.length) {
          for (const step of data.thinkingSteps) {
            setThinkingStep(step);
            await new Promise((r) => setTimeout(r, 350 + Math.random() * 280));
          }
        } else {
          setThinkingStep(`${TREND_BOT_NAME} analyze kar raha hai…`);
          await new Promise((r) => setTimeout(r, 500));
        }
        setThinkingStep(null);

        if (data.suggestions?.length) {
          setSuggestions(personalizePrompts(data.suggestions));
        }

        let reply = data.reply;
        if (!reply) {
          reply =
            data.error === "auth_required"
              ? "🔐 Sign in chahiye.\n\n[Sign in](/login) karein."
              : `😕 *Jawab nahi mil saka*\n\n• Internet check karein\n• Sawal clear likhein\n• Example: *best mobile ka link do*\n\n_${TREND_BOT_NAME} har baar behtar ho raha hai — dubara try karein._`;
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `b_${Date.now()}`,
            role: "bot",
            text: reply,
            timestamp: Date.now(),
            intent: data.intent,
          },
        ]);
      } catch {
        setThinkingStep(null);
        setMessages((prev) => [
          ...prev,
          {
            id: `e_${Date.now()}`,
            role: "bot",
            text: "⚠️ *Connection issue* — internet check karke dubara try karein.",
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages, role, sessionId, shopCategory, shopId, shopName],
  );

  const setFeedback = useCallback((messageId: string, feedback: "helpful" | "not_helpful") => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        if (feedback === "helpful") {
          recordTrendBotHelpful(lastUserQuery.current, m.intent);
          setSuggestions((s) => personalizePrompts(s));
        } else {
          recordTrendBotNotHelpful(lastUserQuery.current);
        }
        return { ...m, feedback };
      }),
    );
  }, []);

  return {
    messages,
    input,
    setInput,
    loading,
    thinkingStep,
    suggestions,
    sendMessage,
    setFeedback,
    sessionLabel: getSessionLabel(sessionCount),
  };
}
