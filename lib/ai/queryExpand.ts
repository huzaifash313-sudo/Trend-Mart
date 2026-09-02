/* Expand search terms using marketplace synonyms (Urdu / English) */

const SYNONYMS: Record<string, string[]> = {
  mobile: ["phone", "smartphone", "cell"],
  phone: ["mobile", "smartphone"],
  smartphone: ["mobile", "phone"],
  iphone: ["apple", "mobile", "phone"],
  samsung: ["mobile", "phone", "galaxy"],
  laptop: ["notebook", "computer"],
  computer: ["laptop", "pc"],
  earphone: ["earbuds", "headphone", "handsfree"],
  headphone: ["earphone", "earbuds"],
  burger: ["zinger", "fast food"],
  biryani: ["rice", "karahi"],
  aata: ["atta", "flour"],
  atta: ["aata", "flour"],
  chawal: ["rice", "basmati"],
  rice: ["chawal", "basmati"],
  doodh: ["milk"],
  milk: ["doodh"],
  chicken: ["murgh"],
  shalwar: ["kameez", "suit"],
  kurti: ["tunic", "fashion"],
  perfume: ["fragrance", "ittar"],
  makeup: ["cosmetics", "beauty"],
};

export type SearchSortMode = "relevance" | "cheapest" | "best_deal" | "best_pick";

export function expandSearchTerms(query: string): string[] {
  const terms = new Set<string>();
  const cleaned = query.toLowerCase().trim();
  if (cleaned.length >= 2) terms.add(cleaned);

  for (const word of cleaned.split(/\s+/)) {
    if (word.length < 2) continue;
    terms.add(word);
    for (const syn of SYNONYMS[word] ?? []) {
      terms.add(syn);
    }
  }

  return [...terms].slice(0, 8);
}

export function detectSortMode(message: string): SearchSortMode {
  const lower = message.toLowerCase();
  if (/(sasta|cheap|kam price|lowest|minimum|sasti|discount|off)/i.test(lower)) {
    return "cheapest";
  }
  if (/(best deal|best discount|behtarin offer|zyada discount)/i.test(lower)) {
    return "best_deal";
  }
  if (/(best|top|behtarin|recommended|achha|achhi)/i.test(lower)) {
    return "best_pick";
  }
  return "relevance";
}

export function buildSupabaseOrFilter(terms: string[]): string {
  const parts: string[] = [];
  for (const t of terms) {
    const safe = t.replace(/[%_\\,]/g, "").slice(0, 40);
    if (safe.length < 2) continue;
    parts.push(`name.ilike.%${safe}%`);
    parts.push(`description.ilike.%${safe}%`);
  }
  return parts.length ? parts.join(",") : "name.ilike.%_%";
}
