/* Client TrendBot chat state — context, products, feedback, voice-ready */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { AssistantRole } from "@/lib/ai/assistantEngine";
import type { ProductSearchHit } from "@/lib/ai/productSearch";
import { TREND_BOT_NAME } from "@/lib/ai/trendBotBrand";
import {
  getMemoryHint,
  getSessionLabel,
  personalizePrompts,
  recordTrendBotHelpful,
  recordTrendBotNotHelpful,
  recordTrendBotQuery,
  startTrendBotSession,
} from "@/lib/ai/trendBotMemory";
import { useCartStore } from "@/store/cartStore";
import { useLocation } from "@/context/LocationContext";

export interface TrendBotMessage {
  id: string;
  role: "user" | "bot";
  text: string;
  timestamp: number;
  intent?: string;
  feedback?: "helpful" | "not_helpful";
  products?: ProductSearchHit[];
  handoff?: { type: string; href: string; label: string };
}

interface UseTrendBotChatOptions {
  role: AssistantRole;
  shopId?: string;
  shopName?: string;
  shopCategory?: string;
  welcomeText: string;
  initialPrompts: string[];
  /** Prefill + auto-send once (shareable /assistant?q=) */
  initialQuery?: string | null;
}

export function useTrendBotChat({
  role,
  shopId,
  shopName,
  shopCategory,
  welcomeText,
  initialPrompts,
  initialQuery,
}: UseTrendBotChatOptions) {
  const pathname = usePathname() ?? "/";
  const cartItems = useCartStore((s) => s.items);
  const { coordinates, location } = useLocation();

  const [sessionId] = useState(() => `tb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
  const [sessionCount, setSessionCount] = useState(1);
  const [messages, setMessages] = useState<TrendBotMessage[]>(() => [
    { id: "welcome", role: "bot", text: welcomeText, timestamp: Date.now() },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinkingStep, setThinkingStep] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState(initialPrompts);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const lastUserQuery = useRef("");
  const autoSent = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const mem = startTrendBotSession(shopCategory);
    setSessionCount(mem.sessions);
    setSuggestions(personalizePrompts(initialPrompts));
    try {
      if (!sessionStorage.getItem("tm_trendbot_onboard_v1")) {
        setShowOnboarding(true);
      }
    } catch {
      /* ignore */
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [initialPrompts, shopCategory]);

  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false);
    try {
      sessionStorage.setItem("tm_trendbot_onboard_v1", "1");
    } catch {
      /* ignore */
    }
  }, []);

  const buildContextPayload = useCallback(() => {
    const lines = cartItems.slice(0, 6).map((i) => {
      const qty = i.quantity ?? 1;
      return `${qty}× ${i.name} @ Rs. ${Number(i.price).toLocaleString("en-PK")}`;
    });
    const total = cartItems.reduce((sum, i) => sum + Number(i.price) * (i.quantity ?? 1), 0);
    return {
      pathname,
      cartSummary: {
        count: cartItems.reduce((n, i) => n + (i.quantity ?? 1), 0),
        total,
        lines,
      },
      location:
        coordinates?.latitude != null && coordinates?.longitude != null
          ? {
              lat: coordinates.latitude,
              lng: coordinates.longitude,
              label: location?.city || location?.deliveryZone || undefined,
            }
          : undefined,
      memoryHints: getMemoryHint().slice(0, 5),
    };
  }, [cartItems, coordinates, location, pathname]);

  const sendMessage = useCallback(
    async (textOverride?: string) => {
      const text = (textOverride ?? input).trim();
      if (!text || loading) return;

      dismissOnboarding();
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

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const hardTimeout = setTimeout(() => controller.abort(), 45_000);

      try {
        const ctx = buildContextPayload();
        const res = await fetch("/api/ai-assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            message: text,
            role,
            shopId,
            shopName,
            shopCategory,
            sessionId,
            history,
            ...ctx,
          }),
        });

        const data = (await res.json()) as {
          reply?: string;
          suggestions?: string[];
          thinkingSteps?: string[];
          intent?: string;
          error?: string;
          products?: ProductSearchHit[];
          handoff?: TrendBotMessage["handoff"];
        };

        // Never drop a successful payload — even if abort fires during thinking UI.
        const commitReply = (textReply: string) => {
          if (data.suggestions?.length) {
            setSuggestions(personalizePrompts(data.suggestions));
          }
          setMessages((prev) => [
            ...prev,
            {
              id: `b_${Date.now()}`,
              role: "bot",
              text: textReply,
              timestamp: Date.now(),
              intent: data.intent,
              products: data.products,
              handoff: data.handoff,
            },
          ]);
        };

        let reply = data.reply;
        if (!reply) {
          reply =
            data.error === "auth_required"
              ? "🔐 Sign in chahiye.\n\n[Sign in](/login) karein."
              : `🤖 *${TREND_BOT_NAME}* abhi reply nahi de saka, lekin aap yeh try karein:\n\n` +
                `• *best mobile ka link do*\n` +
                `• *best deals*\n` +
                `• *order kaise karun*\n\n` +
                `👉 [Products](/products) · [Deals](/deals) · [Support](/support)`;
        }

        if (!controller.signal.aborted && data.thinkingSteps?.length) {
          for (const step of data.thinkingSteps.slice(0, 3)) {
            if (controller.signal.aborted) break;
            setThinkingStep(step);
            await new Promise((r) => setTimeout(r, 90 + Math.random() * 110));
          }
        } else if (!controller.signal.aborted) {
          setThinkingStep(`${TREND_BOT_NAME} soch raha hai…`);
          await new Promise((r) => setTimeout(r, 120));
        }
        setThinkingStep(null);
        commitReply(reply);
      } catch (err) {
        const superseded = abortRef.current !== null && abortRef.current !== controller;
        if (superseded) return;
        setThinkingStep(null);
        const aborted =
          controller.signal.aborted || (err instanceof Error && err.name === "AbortError");
        setMessages((prev) => [
          ...prev,
          {
            id: `e_${Date.now()}`,
            role: "bot",
            text: aborted
              ? "⏳ Reply thora late ho gaya — short sawal dubara try karein, ya [Support](/support)."
              : "⚠️ *Connection issue* — internet check karke dubara try karein.",
            timestamp: Date.now(),
          },
        ]);
      } finally {
        clearTimeout(hardTimeout);
        if (abortRef.current === controller) {
          abortRef.current = null;
          setLoading(false);
        }
      }
    },
    [
      buildContextPayload,
      dismissOnboarding,
      input,
      loading,
      messages,
      role,
      sessionId,
      shopCategory,
      shopId,
      shopName,
    ],
  );

  useEffect(() => {
    if (!initialQuery || autoSent.current) return;
    autoSent.current = true;
    setInput(initialQuery);
    const t = setTimeout(() => void sendMessage(initialQuery), 400);
    return () => clearTimeout(t);
    // intentionally once on mount for shareable links
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const setFeedback = useCallback(
    (messageId: string, feedback: "helpful" | "not_helpful") => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          if (feedback === "helpful") {
            recordTrendBotHelpful(lastUserQuery.current, m.intent);
            setSuggestions((s) => personalizePrompts(s));
          } else {
            recordTrendBotNotHelpful(lastUserQuery.current);
          }
          void fetch("/api/ai-assistant/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              feedback,
              intent: m.intent,
              query: lastUserQuery.current,
              shopId,
            }),
          }).catch(() => undefined);
          return { ...m, feedback };
        }),
      );
    },
    [sessionId, shopId],
  );

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
    showOnboarding,
    dismissOnboarding,
    sessionId,
  };
}
