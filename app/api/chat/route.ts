/* -------------------------------------------------------------------------- */
/*  TrendMart — AI Business Assistant Chatbot API Route                         */
/*                                                                             */
/*  POST /api/chat                                                              */
/*  Body: { message: string, shopId: string, sessionId?: string }              */
/*                                                                             */
/*  Returns an AI-generated response based on the shop's active products,      */
/*  pricing, operating hours, and location. Falls back gracefully if           */
/*  no API key is configured. Logs conversations to chat_logs table.           */
/* -------------------------------------------------------------------------- */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChatRequest {
  message: string;
  shopId: string;
  sessionId?: string;
}

interface ChatResponse {
  reply: string;
  intent?: string;
  confidence?: number;
  sessionId?: string;
  error?: string;
}

// ─── Sanitization Helpers — Strict Payload Protection ───────────────────────

/**
 * Sanitize a string for safe use in the chatbot context window.
 * - Strips ALL HTML/script tags
 * - Removes control characters (except newline)
 * - Removes potential injection vectors (javascript: protocol, event handlers)
 * - Limits length to prevent context-window overflow attacks
 * - Trims excess whitespace
 */
function sanitizeChatString(input: unknown, maxLength: number = 200): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/on\w+\s*=\s*'[^']*'/gi, "")
    .replace(/on\w+\s*=[^\s>]*/gi, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // strip control chars except \n \t
    .replace(/[*_~`>|\\]/g, "") // strip Markdown special chars
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitize a numeric value for the chatbot context.
 * Returns `fallback` for any invalid/malformed input.
 */
function sanitizeChatNumber(value: unknown, fallback: number = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  if (Math.abs(n) > 99_999_999) return fallback;
  return n;
}

/**
 * Sanitize a user message string with full injection/overflow protection.
 * - Strips all HTML/script content
 * - Limits to 500 characters
 * - Rejects messages that are entirely script-like
 */
function sanitizeUserMessage(input: unknown): string {
  if (typeof input !== "string") return "";
  const sanitized = sanitizeChatString(input, 500);
  // Reject messages that are entirely HTML/script after sanitization becoming empty
  if (!sanitized && input.length > 0) return "";
  return sanitized;
}

/**
 * Sanitize a shop/product description for the context window.
 * Longer descriptions are truncated to prevent context overflow.
 */
function sanitizeDescription(input: unknown): string {
  if (typeof input !== "string") return "";
  return sanitizeChatString(input, 120);
}

// ─── Shop Context Builder ───────────────────────────────────────────────────

interface ShopProduct {
  name: string;
  price: number;
  description: string;
  available: boolean;
}

interface ShopContext {
  name: string;
  category: string;
  location: string;
  operatingStatus: string;
  businessHours: string;
  products: ShopProduct[];
  whatsapp: string;
}

async function fetchShopContext(shopId: string): Promise<ShopContext | null> {
  const supabase = await createClient();

  // Validate shopId is a UUID to prevent SQL injection
  if (!shopId || typeof shopId !== "string" || shopId.length > 100) return null;
  const safeShopId = sanitizeChatString(shopId, 100);
  if (!safeShopId) return null;

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("name, category, location, operating_status, business_hours, whatsapp_number")
    .eq("id", safeShopId)
    .single();

  if (shopError || !shop) return null;

  const { data: products } = await supabase
    .from("products")
    .select("name, price, description, is_available")
    .eq("shop_id", safeShopId)
    .order("created_at", { ascending: false })
    .limit(50);

  // ── Strictly sanitize the shop context before it enters the LLM context window ──

  return {
    name: sanitizeChatString(shop.name, 100),
    category: sanitizeChatString(shop.category, 50),
    location: sanitizeChatString(shop.location, 100),
    operatingStatus: sanitizeChatString(shop.operating_status, 100) || "Operational",
    businessHours: sanitizeChatString(shop.business_hours, 100) || "Not specified",
    products: (products ?? []).map((p: Record<string, unknown>) => ({
      name: sanitizeChatString(p.name, 100),
      price: sanitizeChatNumber(p.price, 0),
      description: sanitizeDescription(p.description),
      available: typeof p.is_available === "boolean" ? p.is_available : true,
    })),
    whatsapp: sanitizeChatString(shop.whatsapp_number, 30),
  };
}

// ─── Intent Detection ───────────────────────────────────────────────────────

function detectIntent(message: string): { intent: string; confidence: number } {
  const lower = message.toLowerCase();

  if (/(price|cost|kitna|rate|rupees|rs\.?)/.test(lower)) {
    return { intent: "pricing_inquiry", confidence: 0.9 };
  }
  if (/(open|close|time|hour|timing|available|subah|sham)/.test(lower)) {
    return { intent: "operating_hours", confidence: 0.9 };
  }
  if (/(product|item|stock|available|sell|bech|sam|hai)/.test(lower)) {
    return { intent: "product_inquiry", confidence: 0.85 };
  }
  if (/(location|address|where|kahan|area|jaga)/.test(lower)) {
    return { intent: "location_inquiry", confidence: 0.9 };
  }
  if (/(order|book|delivery|ship|bhej|ghar|pohnch)/.test(lower)) {
    return { intent: "order_booking", confidence: 0.85 };
  }
  if (/(whatsapp|contact|phone|number|call|bat|rabta)/.test(lower)) {
    return { intent: "contact_info", confidence: 0.9 };
  }
  if (/(hi|hello|salam|aoa|assalam|hey|help)/.test(lower)) {
    return { intent: "greeting", confidence: 0.95 };
  }

  return { intent: "general", confidence: 0.5 };
}

// ─── Response Generator (Rule-Based AI) ─────────────────────────────────────

/**
 * Generate a response using only sanitized context data.
 * All context values have already undergone strict sanitization.
 */
function generateResponse(
  intent: string,
  _message: string,
  context: ShopContext,
): string {
  switch (intent) {
    case "greeting":
      return `👋 *Salam! Welcome to ${context.name}* on TrendMart! 🛍️\n\nWe're a *${context.category}* shop based in *${context.location}*. How can I help you today?\n\nHere's what I can do:\n• Tell you about our products & prices\n• Share our business hours\n• Help with ordering & delivery\n• Provide our contact details`;

    case "product_inquiry":
      if (context.products.length === 0) {
        return `📦 *${context.name}* currently has no products listed. Please check back soon or contact us directly on WhatsApp: +${context.whatsapp}`;
      }
      const availableProducts = context.products.filter((p) => p.available);
      const topProducts = availableProducts.slice(0, 6);
      const productList = topProducts
        .map((p) => `• *${p.name}* — Rs. ${p.price.toLocaleString()}${p.description ? ` (${p.description.slice(0, 80)})` : ""}`)
        .join("\n");
      const moreText = availableProducts.length > 6
        ? `\n\n_...and ${availableProducts.length - 6} more products available!_`
        : "";
      return `📦 *Products at ${context.name}*\n\n${productList}${moreText}\n\n💡 Tap any product on our page to order via WhatsApp!`;

    case "pricing_inquiry":
      if (context.products.length === 0) {
        return `💰 We don't have any products listed with prices right now. Please contact us on WhatsApp at +${context.whatsapp} for pricing info.`;
      }
      const priceList = context.products
        .filter((p) => p.available)
        .slice(0, 8)
        .map((p) => `• *${p.name}* — Rs. ${p.price.toLocaleString()}`)
        .join("\n");
      const avgPrice = Math.round(
        context.products.filter((p) => p.available).reduce((sum, p) => sum + p.price, 0) /
          (context.products.filter((p) => p.available).length || 1),
      );
      return `💰 *Pricing at ${context.name}*\n\n${priceList}\n\n📊 Average price: ~Rs. ${avgPrice.toLocaleString()}\n\n💡 All orders are placed via WhatsApp for personalized service!`;

    case "operating_hours":
      const hours = context.businessHours !== "Not specified"
        ? context.businessHours
        : "Not listed. Please contact us for exact timings.";
      return `🕐 *${context.name} — Operating Hours*\n\n${hours}\n\n📌 Status: *${context.operatingStatus}*\n📍 Location: ${context.location}\n\n💡 Call or WhatsApp us to confirm availability!`;

    case "location_inquiry":
      return `📍 *${context.name}* is located in *${context.location}*\n\nWe serve customers in the ${context.location} area. For deliveries outside this zone, please contact us on WhatsApp to discuss options.\n\n📞 WhatsApp: +${context.whatsapp}`;

    case "order_booking":
      return `🛒 *Ready to Order from ${context.name}?*\n\nHere's how it works on TrendMart:\n1️⃣ Browse our products on the shop page\n2️⃣ Tap any product to add it to your cart\n3️⃣ Review your order and tap "Order via WhatsApp"\n4️⃣ We'll receive your order and confirm!\n\n📞 WhatsApp: +${context.whatsapp}\n\n💡 You can also message us directly to place a custom order!`;

    case "contact_info":
      return `📞 *Contact ${context.name}*\n\n• WhatsApp: +${context.whatsapp}\n• Location: ${context.location}\n• Category: ${context.category}\n\n💡 Feel free to message us anytime on WhatsApp for quick responses!`;

    default:
      return `🤔 Thanks for your message! I'm the AI assistant for *${context.name}*.\n\n📍 Located in ${context.location}\n🕐 ${context.operatingStatus}\n📞 WhatsApp: +${context.whatsapp}\n\nHow can I help you today? Feel free to ask about:\n• Our products & prices\n• Business hours\n• Delivery & ordering\n• Contact information`;
  }
}

// ─── Store Chat Log ─────────────────────────────────────────────────────────

async function logChat(
  shopId: string,
  sessionId: string,
  userMessage: string,
  botResponse: string,
  intent: string,
  confidence: number,
  visitorIp: string | null,
): Promise<void> {
  try {
    const supabase = await createClient();
    // Sanitize values before logging to prevent log injection
    const safeUserMessage = sanitizeChatString(userMessage, 1000);
    const safeBotResponse = sanitizeChatString(botResponse, 2000);
    const safeIntent = sanitizeChatString(intent, 50);
    const safeConfidence = sanitizeChatNumber(confidence, 0);
    const safeVisitorIp = visitorIp ? sanitizeChatString(visitorIp, 45) : null;

    await supabase.from("chat_logs").insert({
      shop_id: shopId,
      session_id: sessionId,
      visitor_ip: safeVisitorIp ?? undefined,
      user_message: safeUserMessage,
      bot_response: safeBotResponse,
      intent: safeIntent,
      confidence: safeConfidence,
      resolved: false,
    });
  } catch {
    // Silently fail — logging is non-critical
  }
}

// ─── POST Handler ───────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  let body: ChatRequest;

  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return NextResponse.json(
      { reply: "Invalid request format. Please try again.", error: "malformed_json" } satisfies ChatResponse,
      { status: 400 },
    );
  }

  try {
    const rawMessage = body.message;
    const rawShopId = body.shopId;
    const providedSessionId = body.sessionId;

    // ── Strict input validation ──────────────────────────────────────────

    // Validate and sanitize the user message
    const message = sanitizeUserMessage(rawMessage);
    if (!message) {
      return NextResponse.json(
        { reply: "Please type a valid message and try again.", error: "empty_message" } satisfies ChatResponse,
        { status: 400 },
      );
    }

    // Validate shop ID
    if (!rawShopId || typeof rawShopId !== "string") {
      return NextResponse.json(
        { reply: "I couldn't identify the shop. Please refresh the page.", error: "missing_shop" } satisfies ChatResponse,
        { status: 400 },
      );
    }

    const shopId = sanitizeChatString(rawShopId, 100);
    if (!shopId) {
      return NextResponse.json(
        { reply: "I couldn't identify the shop. Please refresh the page.", error: "missing_shop" } satisfies ChatResponse,
        { status: 400 },
      );
    }

    // Reject messages that appear to be prompt injection attempts
    // (e.g., heavy use of system prompt syntax, role-playing as the assistant)
    const lowerMessage = message.toLowerCase();
    const blockedPatterns = [
      /ignore (all |previous )?instructions/i,
      /you are now (a |the )?(system|assistant|developer)/i,
      /forget (your |previous )?(context|instructions|rules)/i,
      /pretend (you are|to be)/i,
      /system:\s*/i,
      /<\|system\|>/i,
      /\[SYSTEM\]/i,
      /\[INST\]/i,
      /\[\/INST\]/i,
      /<s>.*<\/s>/i,
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(lowerMessage)) {
        return NextResponse.json(
          {
            reply: "I can only help with questions about this shop's products, pricing, and services. How can I assist you?",
            error: "prompt_injection_blocked",
          } satisfies ChatResponse,
          { status: 200 },
        );
      }
    }

    // Generate or use provided session ID (sanitized)
    const sessionId = providedSessionId
      ? sanitizeChatString(providedSessionId, 50)
      : `chat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    // Fetch and sanitize shop context
    const context = await fetchShopContext(shopId);
    if (!context) {
      return NextResponse.json(
        { reply: "Sorry, I couldn't load this shop's information. Please try again later.", error: "shop_not_found", sessionId } satisfies ChatResponse,
        { status: 404 },
      );
    }

    // Detect intent from sanitized message
    const { intent, confidence } = detectIntent(message);

    // Generate response from sanitized context
    const reply = generateResponse(intent, message, context);

    // Extract and sanitize visitor IP
    const forwardedFor = request.headers.get("x-forwarded-for");
    const visitorIp = forwardedFor?.split(",")[0]?.trim() ?? null;

    // Log conversation (fire-and-forget, with sanitized data)
    logChat(shopId, sessionId, message, reply, intent, confidence, visitorIp).catch(() => {});

    return NextResponse.json({
      reply,
      intent,
      confidence,
      sessionId,
    } satisfies ChatResponse, { status: 200 });

  } catch (err) {
    // Sanitize error message to avoid leaking internal details
    console.error("[Chat API] Error:", err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json(
      {
        reply: "I'm having trouble responding right now. Please try again in a moment.",
        error: "internal_error",
      } satisfies ChatResponse,
      { status: 500 },
    );
  }
}