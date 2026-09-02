/* Optional free LLM bridge — Groq or Gemini (only if API key set) */

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
    | "out_of_scope"
    | "unclear";
  searchQuery: string;
  categoryHint: string;
  language: string;
  confidence: number;
  reason: string;
}

function getProvider(): { base: string; key: string; model: string; name: string } | null {
  const groq = process.env.GROQ_API_KEY?.trim();
  if (groq) {
    return {
      name: "groq",
      key: groq,
      base: "https://api.groq.com/openai/v1/chat/completions",
      model: process.env.GROQ_MODEL?.trim() || "llama-3.1-8b-instant",
    };
  }
  const gemini = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_AI_API_KEY?.trim();
  if (gemini) {
    return {
      name: "gemini",
      key: gemini,
      base: `https://generativelanguage.googleapis.com/v1beta/models/${
        process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash"
      }:generateContent?key=${gemini}`,
      model: process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash",
    };
  }
  return null;
}

export function hasFreeLlmKey(): boolean {
  return Boolean(getProvider());
}

const SYSTEM = `You are TrendBot NLU for TrendsMart (Pakistan local marketplace by owner Huzaifa).
Return ONLY compact JSON (no markdown):
{"intent":"product_search|shop_search|app_help|order_help|merchant_help|category_browse|brand_owner|out_of_scope|unclear","searchQuery":"","categoryHint":"","language":"en|roman_urdu|urdu|punjabi|mixed","confidence":0.0,"reason":""}

Facts:
- TrendsMart owner/founder = Huzaifa
- App: hyper-local multi-vendor marketplace + WhatsApp ordering

Rules:
- Understand English, Roman Urdu, Urdu script, Punjabi.
- searchQuery = short English/Roman product or shop keywords for DB search.
- categoryHint = one of TrendsMart categories if clear, else "".
- Owner/founder questions → intent=brand_owner, confidence>=0.95
- Policy/how-it-works → intent=app_help
- If not about TrendsMart shopping/merchant/brand → out_of_scope
- NEVER invent product names that user did not imply.
- Prefer helping; only unclear when message is nonsense.`;

function parseJson(text: string): LlmUnderstanding | null {
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

async function callGroq(
  provider: { base: string; key: string; model: string },
  message: string,
  role: string,
): Promise<LlmUnderstanding | null> {
  const res = await fetch(provider.base, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.1,
      max_tokens: 220,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Role=${role}\nUser message: ${message.slice(0, 400)}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return parseJson(data.choices?.[0]?.message?.content ?? "");
}

async function callGemini(
  provider: { base: string; model: string },
  message: string,
  role: string,
): Promise<LlmUnderstanding | null> {
  const res = await fetch(provider.base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: `${SYSTEM}\n\nRole=${role}\nUser message: ${message.slice(0, 400)}` }],
        },
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 220 },
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return parseJson(text);
}

/** Understand user message via free LLM. Returns null if no key / failure. */
export async function understandWithFreeLlm(
  message: string,
  role: "customer" | "merchant" | "shop",
): Promise<LlmUnderstanding | null> {
  const provider = getProvider();
  if (!provider) return null;
  try {
    if (provider.name === "groq") return await callGroq(provider, message, role);
    return await callGemini(provider, message, role);
  } catch {
    return null;
  }
}
