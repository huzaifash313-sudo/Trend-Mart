import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isPromptInjection,
  sanitizeChatString,
  sanitizeUserMessage,
} from "@/lib/ai/sanitize";
import {
  runAssistant,
  type AssistantRole,
} from "@/lib/ai/assistantEngine";

interface AiAssistantBody {
  message: string;
  role: AssistantRole;
  shopId?: string;
  shopCategory?: string;
  shopName?: string;
  sessionId?: string;
  history?: { role: "user" | "assistant"; text: string }[];
  memoryHints?: string[];
  pathname?: string;
  cartSummary?: { count: number; total: number; lines: string[] };
  location?: { lat: number; lng: number; label?: string };
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: AiAssistantBody;

  try {
    body = (await request.json()) as AiAssistantBody;
  } catch {
    return NextResponse.json(
      { reply: "Invalid request.", error: "malformed_json" },
      { status: 400 },
    );
  }

  const message = sanitizeUserMessage(body.message);
  if (!message) {
    return NextResponse.json(
      { reply: "Please type a valid message.", error: "empty_message" },
      { status: 400 },
    );
  }

  if (isPromptInjection(message)) {
    return NextResponse.json({
      reply: "I can only help with TrendsMart shopping and business questions.",
      error: "prompt_injection_blocked",
    });
  }

  const role = body.role;
  if (role !== "customer" && role !== "merchant" && role !== "shop") {
    return NextResponse.json(
      { reply: "Invalid assistant mode.", error: "invalid_role" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const shopId = body.shopId ? sanitizeChatString(body.shopId, 100) : undefined;
  const shopCategory = body.shopCategory ? sanitizeChatString(body.shopCategory, 80) : undefined;
  const shopName = body.shopName ? sanitizeChatString(body.shopName, 100) : undefined;
  const sessionId = body.sessionId
    ? sanitizeChatString(body.sessionId, 50)
    : `ai_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const pathname = body.pathname ? sanitizeChatString(body.pathname, 120) : undefined;

  const cartSummary = body.cartSummary
    ? {
        count: Math.max(0, Math.min(99, Number(body.cartSummary.count) || 0)),
        total: Math.max(0, Number(body.cartSummary.total) || 0),
        lines: (body.cartSummary.lines ?? []).slice(0, 8).map((l) => sanitizeChatString(l, 120)),
      }
    : undefined;

  const location =
    body.location &&
    Number.isFinite(body.location.lat) &&
    Number.isFinite(body.location.lng)
      ? {
          lat: Number(body.location.lat),
          lng: Number(body.location.lng),
          label: body.location.label ? sanitizeChatString(body.location.label, 80) : undefined,
        }
      : undefined;

  if (role === "merchant" && !user) {
    return NextResponse.json(
      { reply: "Sign in as a merchant to use the Business AI Coach.", error: "auth_required", sessionId },
      { status: 401 },
    );
  }

  try {
    const history = (body.history ?? [])
      .slice(-8)
      .map((h) => ({
        role: h.role,
        text: sanitizeChatString(h.text, 500),
      }))
      .filter((h) => h.text.length > 0);

    const result = await runAssistant(supabase, {
      message,
      role,
      shopId,
      shopCategory,
      shopName,
      userId: user?.id,
      history,
      memoryHints: (body.memoryHints ?? []).slice(0, 5).map((h) => sanitizeChatString(h, 80)),
      pathname,
      cartSummary,
      location,
    });

    if ((role === "shop" || role === "merchant") && shopId) {
      logShopChat(supabase, shopId, sessionId, message, result.reply, result.intent, result.confidence).catch(
        () => {},
      );
    }

    return NextResponse.json({
      reply: result.reply,
      intent: result.intent,
      confidence: result.confidence,
      suggestions: result.suggestions,
      thinkingSteps: result.thinkingSteps,
      products: result.products ?? [],
      handoff: result.handoff ?? null,
      sessionId,
    });
  } catch (err) {
    console.error("[AI Assistant]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { reply: "Something went wrong. Please try again.", error: "internal_error", sessionId },
      { status: 500 },
    );
  }
}

async function logShopChat(
  supabase: Awaited<ReturnType<typeof createClient>>,
  shopId: string,
  sessionId: string,
  userMessage: string,
  botResponse: string,
  intent: string,
  confidence: number,
): Promise<void> {
  await supabase.from("chat_logs").insert({
    shop_id: shopId,
    session_id: sessionId,
    user_message: sanitizeChatString(userMessage, 1000),
    bot_response: sanitizeChatString(botResponse, 2000),
    intent: sanitizeChatString(intent, 50),
    confidence,
    resolved: false,
  });
}
