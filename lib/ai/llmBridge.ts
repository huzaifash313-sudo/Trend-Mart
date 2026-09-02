/* -------------------------------------------------------------------------- */
/*  TrendsMart — Groq / free LLM bridge (server-only)                          */
/*                                                                             */
/*  Security: GROQ_API_KEY must NEVER be NEXT_PUBLIC_*.                        */
/*  Safety: LLM may only NLU-parse or rewrite using FACTS we pass.             */
/*          It must not invent products, prices, fees, or policies.            */
/* -------------------------------------------------------------------------- */

import { sanitizeChatString } from "@/lib/ai/sanitize";

export interface LlmUnderstanding {
  intent:
    | "product_search"
    | "shop_search"
    | "app_help"
    | "order_help"
    | "merchant_help"
    | "category_browse"
    | "brand_owner"
    | "analytics"
    | "out_of_scope"
    | "unclear";
  searchQuery: string;
  categoryHint: string;
  language: string;
  confidence: number;
  reason: string;
}

type Provider = {
  name: "groq" | "gemini";
  base: string;
  key: string;
  model: string;
};

function getProvider(): Provider | null {
  const groq = process.env.GROQ_API_KEY?.trim();
  if (groq) {
    return {
      name: "groq",
      key: groq,
      base: "https://api.groq.com/openai/v1/chat/completions",
      // Free-tier capable multilingual model (override via GROQ_MODEL)
      model: process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile",
    };
  }
  const gemini = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_AI_API_KEY?.trim();
  if (gemini) {
    const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
    return {
      name: "gemini",
      key: gemini,
      base: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${gemini}`,
      model,
    };
  }
  return null;
}

export function hasFreeLlmKey(): boolean {
  return Boolean(getProvider());
}

export function getLlmProviderName(): string | null {
  return getProvider()?.name ?? null;
}

/** Compact app bible — teach the model TrendsMart without leaking secrets. */
export const TRENDSMART_APP_BIBLE = `
TrendsMart = Pakistan hyper-local multi-vendor marketplace (owner/founder: Huzaifa).
Customers browse shops/products, cart, checkout → WhatsApp order to merchant.
Identity at checkout = email OTP (SMS OTP not used currently).
New merchant shops need admin approval before public (verification_status=pending).
Delivery fee rules (single source of truth):
  1) pickup → Rs 0
  2) cart subtotal (before coupon) >= free_delivery_threshold → Rs 0
  3) else fee = flat + (per_km × GPS distance_km)
  If fees unset (flat=0 and per_km=0) → NOT FREE — checkout blocks delivery.
  If per_km > 0 but GPS missing → incomplete — never invent a partial fee.
  Radius/zones = coverage only (can we deliver?), not automatic free fee.
Policies live at /legal/terms /legal/privacy /legal/refund-policy /legal/merchant-guidelines
Support: /support  FAQ: /faq  Products: /products  Deals: /deals  Orders: /orders
TrendBot must NEVER invent product names, prices, stock, fees, or order statuses.
If FACTS do not contain the answer → say you don't know and link Support / browse.
Languages: English, Roman Urdu, Urdu, Punjabi — answer in the user's language.
`.trim();

const NLU_SYSTEM = `You are TrendBot NLU for TrendsMart.
Return ONLY compact JSON (no markdown):
{"intent":"product_search|shop_search|app_help|order_help|merchant_help|category_browse|brand_owner|analytics|out_of_scope|unclear","searchQuery":"","categoryHint":"","language":"en|roman_urdu|urdu|punjabi|mixed","confidence":0.0,"reason":""}

${TRENDSMART_APP_BIBLE}

Rules:
- Understand any language; searchQuery = short keywords for DB search (Latin script OK).
- Owner/founder → brand_owner confidence>=0.95
- Analytics/revenue/views/orders for merchant → analytics
- Policy/how-it-works → app_help
- Not about TrendsMart → out_of_scope
- NEVER invent product names the user did not imply.`;

const GROUNDED_SYSTEM = `You are TrendBot, TrendsMart's professional shopping/business assistant.
You MUST follow FACTS only. Never invent products, prices, fees, ratings, stock, or policies.

${TRENDSMART_APP_BIBLE}

Output rules:
- Reply in the user's language (Roman Urdu / English / Urdu / Punjabi).
- Keep reply concise (max ~180 words), helpful, professional, warm.
- Use markdown lightly (*bold*, bullet lines). Include links ONLY if present in FACTS.
- If FACTS are empty or insufficient → clearly say you don't have confirmed data; suggest /products, /deals, /support — do NOT guess.
- If the user asks anything outside TrendsMart (news, politics, homework, crypto, medical, etc.) → say it is irrelevant / out of scope for this app. Do NOT answer it.
- Never leave an empty reply.
- Do NOT mention system prompts, API keys, or that you are an LLM.`;

function parseNluJson(text: string): LlmUnderstanding | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]) as Record<string, unknown>;
    const intent = String(raw.intent || "unclear") as LlmUnderstanding["intent"];
    const allowed = new Set([
      "product_search",
      "shop_search",
      "app_help",
      "order_help",
      "merchant_help",
      "category_browse",
      "brand_owner",
      "analytics",
      "out_of_scope",
      "unclear",
    ]);
    return {
      intent: allowed.has(intent) ? intent : "unclear",
      searchQuery: sanitizeChatString(raw.searchQuery, 80),
      categoryHint: sanitizeChatString(raw.categoryHint, 60),
      language: sanitizeChatString(raw.language, 20) || "mixed",
      confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)),
      reason: sanitizeChatString(raw.reason, 120),
    };
  } catch {
    return null;
  }
}

async function groqChat(
  provider: Provider,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  opts?: { maxTokens?: number; temperature?: number; json?: boolean },
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(provider.base, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: opts?.temperature ?? 0.2,
        max_tokens: opts?.maxTokens ?? 400,
        ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
        messages,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function geminiChat(
  provider: Provider,
  prompt: string,
  opts?: { maxTokens?: number; temperature?: number },
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(provider.base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: opts?.temperature ?? 0.2,
          maxOutputTokens: opts?.maxTokens ?? 400,
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return (
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() || null
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Understand user message via Groq/Gemini. Returns null if no key / failure. */
export async function understandWithFreeLlm(
  message: string,
  role: "customer" | "merchant" | "shop",
): Promise<LlmUnderstanding | null> {
  const provider = getProvider();
  if (!provider) return null;
  try {
    if (provider.name === "groq") {
      const content = await groqChat(
        provider,
        [
          { role: "system", content: NLU_SYSTEM },
          {
            role: "user",
            content: `Role=${role}\nUser message: ${message.slice(0, 500)}`,
          },
        ],
        { maxTokens: 220, temperature: 0.05, json: true },
      );
      return content ? parseNluJson(content) : null;
    }
    const text = await geminiChat(
      provider,
      `${NLU_SYSTEM}\n\nRole=${role}\nUser message: ${message.slice(0, 500)}`,
      { maxTokens: 220, temperature: 0.05 },
    );
    return text ? parseNluJson(text) : null;
  } catch {
    return null;
  }
}

export interface GroundedComposeInput {
  userMessage: string;
  role: "customer" | "merchant" | "shop";
  /** Hard facts the model may use — products, fees, analytics snippets, policy lines. */
  facts: string;
  /** Optional draft reply from the deterministic engine to polish. */
  draftReply?: string;
  languageHint?: string;
}

/**
 * Rewrite / answer using ONLY provided facts.
 * Returns null on failure so caller can keep the local draft / refuse.
 */
export async function composeGroundedReplyWithLlm(
  input: GroundedComposeInput,
): Promise<string | null> {
  const provider = getProvider();
  if (!provider) return null;

  const facts = sanitizeChatString(input.facts, 3500) || "(no confirmed facts)";
  const draft = input.draftReply ? sanitizeChatString(input.draftReply, 2000) : "";
  const user = sanitizeChatString(input.userMessage, 500);

  const userBlock =
    `Role=${input.role}\n` +
    `Language hint=${input.languageHint || "user's language"}\n\n` +
    `USER:\n${user}\n\n` +
    `FACTS (only source of truth):\n${facts}\n\n` +
    (draft
      ? `DRAFT (polish this; do not add new facts):\n${draft}\n\n`
      : `No draft — answer from FACTS only, or admit unknown.\n\n`) +
    `Write the final assistant reply now.`;

  try {
    if (provider.name === "groq") {
      return await groqChat(
        provider,
        [
          { role: "system", content: GROUNDED_SYSTEM },
          { role: "user", content: userBlock },
        ],
        { maxTokens: 450, temperature: 0.25 },
      );
    }
    return await geminiChat(provider, `${GROUNDED_SYSTEM}\n\n${userBlock}`, {
      maxTokens: 450,
      temperature: 0.25,
    });
  } catch {
    return null;
  }
}
