/* Legacy alias — storefront ChatWidget may still call POST /api/chat */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPromptInjection, sanitizeChatString, sanitizeUserMessage } from "@/lib/ai/sanitize";
import { runAssistant } from "@/lib/ai/assistantEngine";

export async function POST(request: Request): Promise<NextResponse> {
  let body: { message?: string; shopId?: string; sessionId?: string };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ reply: "Invalid request.", error: "malformed_json" }, { status: 400 });
  }

  const message = sanitizeUserMessage(body.message);
  const shopId = body.shopId ? sanitizeChatString(body.shopId, 100) : "";

  if (!message || !shopId) {
    return NextResponse.json({ reply: "Missing message or shop.", error: "invalid" }, { status: 400 });
  }

  if (isPromptInjection(message)) {
    return NextResponse.json({
      reply: "I can only help with questions about this shop.",
      error: "prompt_injection_blocked",
    });
  }

  const sessionId = body.sessionId
    ? sanitizeChatString(body.sessionId, 50)
    : `chat_${Date.now()}`;

  try {
    const supabase = await createClient();
    const result = await runAssistant(supabase, { message, role: "shop", shopId });

    await supabase.from("chat_logs").insert({
      shop_id: shopId,
      session_id: sessionId,
      user_message: sanitizeChatString(message, 1000),
      bot_response: sanitizeChatString(result.reply, 2000),
      intent: sanitizeChatString(result.intent, 50),
      confidence: result.confidence,
      resolved: false,
    });

    return NextResponse.json({
      reply: result.reply,
      intent: result.intent,
      confidence: result.confidence,
      sessionId,
    });
  } catch {
    return NextResponse.json(
      { reply: "Something went wrong. Please try again.", error: "internal_error" },
      { status: 500 },
    );
  }
}
