/* Session memory — follow-up resolution from chat history */

export interface HistoryMessage {
  role: "user" | "assistant";
  text: string;
}

const FOLLOW_UP =
  /^(link|url|uska|iska|uski|iski|wo|wahi|wala|wali|aur|more|or|sasta|cheaper|dikhao|batao|dedo|de do|haan|yes|ok|theek|achha)$/i;

const LINK_ONLY =
  /^(link|url|link do|url do|uska link|iska link|open karo|khol do|dedo|de do|dikhao|ka link|ki link)$/i;

const LINK_IN_PHRASE = /\b(link do|url do|ka link do|ki link do|link dedo|link chahiye)\b/i;

const CHEAPER =
  /(sasta|cheap|kam price|discount|discounted)/i;

export function resolveMessageWithHistory(
  message: string,
  history?: HistoryMessage[],
): string {
  if (!history?.length) return message;

  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  if (LINK_ONLY.test(lower) || (trimmed.length < 20 && LINK_IN_PHRASE.test(lower))) {
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i];
      if (h.role === "user" && h.text.length > 3 && !LINK_ONLY.test(h.text.toLowerCase())) {
        return h.text;
      }
    }
  }

  if (FOLLOW_UP.test(lower) || lower.length < 12) {
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i];
      if (h.role === "user" && h.text.length > 4) {
        if (CHEAPER.test(lower)) return `sasta ${h.text}`;
        if (FOLLOW_UP.test(lower)) return h.text;
        return `${h.text} ${trimmed}`;
      }
    }
  }

  return message;
}

export function lastAssistantIntent(history?: HistoryMessage[]): string | undefined {
  if (!history?.length) return undefined;
  for (let i = history.length - 1; i >= 0; i--) {
    const t = history[i].text;
      if (history[i].role === "assistant") {
      if (t.includes("Top pick") || t.includes("Best matches") || t.includes("🔍") || t.includes("product(s) across"))
        return "product_search";
      if (t.includes("Business Snapshot") || t.includes("📊")) return "business_summary";
      if (t.includes("Growth Strategy")) return "growth_strategy";
    }
  }
  return undefined;
}
