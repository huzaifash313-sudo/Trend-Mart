/* Expand search terms — rich Urdu/English/Punjabi marketplace synonyms (API-free) */

const SYNONYMS: Record<string, string[]> = {
  // phones / gadgets
  mobile: ["phone", "smartphone", "cell", "handset", "mobail", "mobil"],
  phone: ["mobile", "smartphone", "mobail"],
  smartphone: ["mobile", "phone"],
  iphone: ["apple", "mobile", "phone"],
  samsung: ["mobile", "phone", "galaxy"],
  oppo: ["mobile", "phone"],
  vivo: ["mobile", "phone"],
  infinix: ["mobile", "phone"],
  tecno: ["mobile", "phone"],
  redmi: ["xiaomi", "mobile", "phone"],
  xiaomi: ["redmi", "mobile", "phone"],
  realme: ["mobile", "phone"],
  nokia: ["mobile", "phone"],
  laptop: ["notebook", "computer", "leptop", "labtop"],
  computer: ["laptop", "pc"],
  pc: ["computer", "laptop"],
  earphone: ["earbuds", "headphone", "handsfree", "kanwale"],
  headphone: ["earphone", "earbuds"],
  earbuds: ["earphone", "airpods", "handsfree"],
  airpods: ["earbuds", "earphone"],
  watch: ["smartwatch", "wristwatch", "ghadi", "ghari"],
  smartwatch: ["watch", "ghadi"],
  charger: ["adapter", "cable", "charging"],
  powerbank: ["power bank", "battery pack"],
  speaker: ["bluetooth speaker", "sound"],
  tablet: ["ipad", "tab"],
  // food
  burger: ["zinger", "fast food", "bargar"],
  zinger: ["burger", "chicken burger"],
  biryani: ["rice", "biryaniyan"],
  pizza: ["peza", "piza", "fast food"],
  shawarma: ["roll", "wrap"],
  karahi: ["kadhai", "qorma"],
  nihari: ["stew"],
  paratha: ["parantha"],
  fries: ["chips", "french fries"],
  chai: ["tea", "chaye"],
  coffee: ["cafe"],
  juice: ["shake", "mocktail"],
  // grocery
  aata: ["atta", "flour"],
  atta: ["aata", "flour"],
  chawal: ["rice", "basmati"],
  rice: ["chawal", "basmati"],
  doodh: ["milk"],
  milk: ["doodh"],
  chicken: ["murgh", "murgi"],
  murgh: ["chicken"],
  gosht: ["mutton", "meat", "beef"],
  oil: ["cooking oil", "ghee"],
  sugar: ["cheeni", "chini"],
  cheeni: ["sugar"],
  tea: ["chai"],
  soap: ["bodywash", "wash"],
  shampoo: ["hair wash"],
  detergent: ["surf", "washing powder"],
  // fashion
  shalwar: ["kameez", "suit"],
  kameez: ["shalwar", "qameez"],
  kurti: ["tunic", "fashion"],
  jeans: ["denim", "pants"],
  shoes: ["sneakers", "footwear", "jutay", "jootay"],
  sneakers: ["shoes"],
  shirt: ["qameez", "kameez"],
  abaya: ["hijab", "modest wear"],
  dupatta: ["scarf"],
  // beauty
  perfume: ["fragrance", "ittar", "attar"],
  makeup: ["cosmetics", "beauty"],
  cream: ["lotion", "moisturizer"],
  lipstick: ["makeup"],
  // home
  fridge: ["refrigerator"],
  ac: ["airconditioner", "air conditioner", "split ac"],
  fan: ["ceiling fan", "pedestal fan"],
  iron: ["press"],
  sofa: ["couch", "furniture"],
  bed: ["mattress", "furniture"],
  // health
  medicine: ["dawai", "pharmacy", "tablet"],
  dawai: ["medicine"],
  panadol: ["paracetamol", "medicine"],
  // misc
  bag: ["handbag", "backpack"],
  wallet: ["purse"],
  toy: ["toys", "kids"],
  // intent-ish expansions used in search rarely
  sasta: ["cheap", "budget"],
  cheap: ["sasta", "budget"],
};

/** Common misspellings / roman variants → canonical */
const SPELL_FIX: Record<string, string> = {
  mobail: "mobile",
  mobil: "mobile",
  fon: "phone",
  leptop: "laptop",
  labtop: "laptop",
  leptoop: "laptop",
  bargar: "burger",
  peza: "pizza",
  piza: "pizza",
  jutay: "shoes",
  jootay: "shoes",
  kapray: "clothes",
  kapre: "clothes",
  dawai: "medicine",
  dawakhana: "pharmacy",
  ghadi: "watch",
  ghari: "watch",
  chaye: "chai",
  chahye: "chahiye",
  chahida: "chahiye",
  kithe: "kahan",
  kithay: "kahan",
  dasso: "batao",
  daso: "batao",
  vekhao: "dikhao",
  labbo: "dhundo",
  sastay: "sasta",
  changa: "best",
  vadhia: "best",
};

export type SearchSortMode = "relevance" | "cheapest" | "best_deal" | "best_pick";

export function expandSearchTerms(query: string): string[] {
  const terms = new Set<string>();
  const cleaned = query.toLowerCase().trim();
  if (cleaned.length >= 2) terms.add(cleaned);

  for (let word of cleaned.split(/\s+/)) {
    if (word.length < 2) continue;
    word = SPELL_FIX[word] ?? word;
    terms.add(word);
    for (const syn of SYNONYMS[word] ?? []) {
      terms.add(syn);
    }
    // also expand synonyms of spell-fixed form
    const fixed = SPELL_FIX[word];
    if (fixed) {
      for (const syn of SYNONYMS[fixed] ?? []) terms.add(syn);
    }
  }

  return [...terms].slice(0, 12);
}

export function detectSortMode(message: string): SearchSortMode {
  const lower = message.toLowerCase();
  if (/(sasta|cheap|kam price|lowest|minimum|sasti|sastay|budget)/i.test(lower)) {
    return "cheapest";
  }
  if (/(best deal|best discount|behtarin offer|zyada discount|max discount)/i.test(lower)) {
    return "best_deal";
  }
  if (/(best|top|behtarin|recommended|achha|achhi|changa|vadhia)/i.test(lower)) {
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

/** Apply roman spelling fixes to a full query string */
export function applySpellFixes(query: string): string {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => SPELL_FIX[w] ?? w)
    .join(" ")
    .trim();
}
