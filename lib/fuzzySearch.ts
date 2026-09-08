/* -------------------------------------------------------------------------- */
/*  TrendsMart — Intelligent Fuzzy / Tolerant Search Engine                   */
/*  Case-insensitive · Typo-tolerant · Stemming · Roman-Urdu aware            */
/*  Pipeline: normalise → stem → expand synonyms → phonetics → rank           */
/* -------------------------------------------------------------------------- */

/** Minimum score (0–100) to keep a result when fuzzy-filtering. */
export const FUZZY_MIN_SCORE = 22;   // slightly lower: Pakistani product names
                                      // can have variant spellings that score 25-27

/* -------------------------------------------------------------------------- */
/*  Synonym dictionary (Roman-Urdu + Pakistani English)                        */
/* -------------------------------------------------------------------------- */

const SYNONYMS: Record<string, string[]> = {
  // ── Food & Grocery ──────────────────────────────────────────────────────
  zinger:     ["zinger", "zinger burger", "chicken burger"],
  burger:     ["burger", "zinger burger", "anday wala burger", "bun kabab"],
  aata:       ["aata", "atta", "flour", "wheat flour", "maida"],
  atta:       ["atta", "aata", "flour", "wheat flour", "maida"],
  maida:      ["maida", "flour", "aata", "atta"],
  flour:      ["flour", "aata", "atta", "maida"],
  chawal:     ["chawal", "rice", "basmati", "chaawal"],
  rice:       ["rice", "chawal", "basmati", "chaawal"],
  basmati:    ["basmati", "rice", "chawal"],
  chicken:    ["chicken", "murgh", "murg", "murgi"],
  murgh:      ["murgh", "chicken", "murg"],
  gosht:      ["gosht", "meat", "mutton", "beef", "gusht", "ghosht"],
  meat:       ["meat", "gosht", "mutton", "beef", "gusht"],
  mutton:     ["mutton", "gosht", "meat", "lamb"],
  beef:       ["beef", "gosht", "meat", "bakra"],
  doodh:      ["doodh", "milk", "dudh"],
  dudh:       ["dudh", "doodh", "milk"],
  milk:       ["milk", "doodh", "dudh"],
  anda:       ["anda", "egg", "eggs", "anday"],
  anday:      ["anday", "anda", "egg", "eggs"],
  egg:        ["egg", "eggs", "anda", "anday"],
  eggs:       ["eggs", "egg", "anda", "anday"],
  roti:       ["roti", "chapati", "chapatti", "naan", "bread", "paratha"],
  chapati:    ["chapati", "chapatti", "roti", "bread"],
  naan:       ["naan", "nan", "bread", "roti"],
  paratha:    ["paratha", "roti", "bread"],
  bread:      ["bread", "roti", "chapati", "naan", "double roti"],
  pizza:      ["pizza", "piza", "piiza"],
  biryani:    ["biryani", "biryani rice", "biriyani", "beryani"],
  biriyani:   ["biriyani", "biryani", "beryani"],
  karahi:     ["karahi", "karahi gosht", "kadai", "kadhai"],
  samosa:     ["samosa", "snack", "snacks"],
  cheeni:     ["cheeni", "chini", "sugar", "shakkar"],
  chini:      ["chini", "cheeni", "sugar"],
  sugar:      ["sugar", "cheeni", "chini", "shakkar"],
  namak:      ["namak", "salt", "namk"],
  salt:       ["salt", "namak"],
  ghee:       ["ghee", "desi ghee", "ghi"],
  daal:       ["daal", "dal", "lentils", "dhal"],
  dal:        ["dal", "daal", "lentils"],
  lentils:    ["lentils", "daal", "dal"],
  masala:     ["masala", "spices", "spice", "masalay"],
  spice:      ["spice", "spices", "masala"],
  spices:     ["spices", "spice", "masala"],
  sabzi:      ["sabzi", "vegetables", "veggie", "veggies", "sabzee"],
  vegetable:  ["vegetable", "vegetables", "sabzi", "veggie"],
  vegetables: ["vegetables", "vegetable", "sabzi", "veggie"],
  soap:       ["soap", "sabun", "saabun"],
  sabun:      ["sabun", "soap", "saabun"],
  tomato:     ["tomato", "tomatoes", "tamatar", "tamater"],
  tamatar:    ["tamatar", "tomato", "tomatoes", "tamater"],
  onion:      ["onion", "pyaz", "piyaz", "piaz"],
  pyaz:       ["pyaz", "piyaz", "piaz", "onion"],
  piyaz:      ["piyaz", "pyaz", "onion"],
  potato:     ["potato", "aloo", "alu", "aaloo"],
  aloo:       ["aloo", "alu", "aaloo", "potato"],
  alu:        ["alu", "aloo", "potato"],
  oil:        ["oil", "tel", "cooking oil", "sunflower oil", "canola"],
  tel:        ["tel", "oil", "cooking oil"],
  water:      ["water", "pani", "paani"],
  pani:       ["pani", "paani", "water"],
  paani:      ["paani", "pani", "water"],
  juice:      ["juice", "joos", "juus"],
  joos:       ["joos", "juice", "juus"],
  chai:       ["chai", "tea", "cha"],
  tea:        ["tea", "chai", "cha"],
  coffee:     ["coffee", "kawa", "qahwa"],
  mithai:     ["mithai", "sweets", "sweet", "halwa"],
  sweets:     ["sweets", "mithai", "sweet", "halwa"],
  halwa:      ["halwa", "mithai", "sweets"],

  // ── Clothing & Fashion ───────────────────────────────────────────────────
  shalwar:    ["shalwar", "shalwar kameez", "suit", "salwar"],
  salwar:     ["salwar", "shalwar", "shalwar kameez", "suit"],
  kameez:     ["kameez", "shalwar kameez", "shirt", "top"],
  kurti:      ["kurti", "tunic", "top", "kurtee"],
  shirt:      ["shirt", "shirts", "kameez", "top", "tshirt", "t-shirt"],
  shirts:     ["shirts", "shirt", "kameez"],
  tshirt:     ["tshirt", "t-shirt", "t shirt", "shirt"],
  jeans:      ["jeans", "pant", "pants", "trouser", "trousers", "denim"],
  pant:       ["pant", "pants", "jeans", "trouser", "trousers"],
  pants:      ["pants", "pant", "jeans", "trouser"],
  trouser:    ["trouser", "trousers", "pant", "pants", "jeans"],
  trousers:   ["trousers", "trouser", "pant", "pants"],
  dress:      ["dress", "frock", "gown", "frak"],
  frock:      ["frock", "dress", "frak"],
  dupatta:    ["dupatta", "scarf", "dupata", "shawl"],
  scarf:      ["scarf", "dupatta", "shawl", "muffler"],
  shawl:      ["shawl", "dupatta", "scarf"],
  sandal:     ["sandal", "sandals", "chappal", "slipper", "slippers", "shoes"],
  chappal:    ["chappal", "sandal", "slipper", "shoes"],
  shoe:       ["shoe", "shoes", "sandal", "chappal", "sneaker", "sneakers"],
  shoes:      ["shoes", "shoe", "sandal", "chappal", "sneakers"],
  sneaker:    ["sneaker", "sneakers", "shoe", "shoes", "joggers"],
  sneakers:   ["sneakers", "sneaker", "shoes", "joggers"],
  jacket:     ["jacket", "coat", "blazer", "sherwani"],
  coat:       ["coat", "jacket", "blazer"],
  sweater:    ["sweater", "jumper", "sweter", "pullover"],
  abaya:      ["abaya", "abaaya", "burqa", "jubba"],
  hijab:      ["hijab", "scarf", "dupatta"],

  // ── Electronics ──────────────────────────────────────────────────────────
  mobile:     ["mobile", "phone", "smartphone", "mobil", "handset"],
  phone:      ["phone", "mobile", "smartphone", "handset", "fon"],
  smartphone: ["smartphone", "mobile", "phone", "android", "iphone"],
  laptop:     ["laptop", "notebook", "computer", "laptap", "leptop"],
  laptap:     ["laptap", "laptop", "leptop", "computer"],
  leptop:     ["leptop", "laptop", "laptap", "computer"],
  computer:   ["computer", "laptop", "desktop", "pc"],
  tablet:     ["tablet", "ipad", "tab", "android tablet"],
  earphone:   ["earphone", "earbuds", "headphone", "handsfree", "earbud"],
  earbuds:    ["earbuds", "earphone", "headphone", "handsfree"],
  headphone:  ["headphone", "earphone", "earbuds", "headphones"],
  headphones: ["headphones", "headphone", "earphone", "earbuds"],
  charger:    ["charger", "cable", "adapter", "adaptor", "charging"],
  cable:      ["cable", "charger", "wire", "usb"],
  powerbank:  ["powerbank", "power bank", "battery pack"],
  speaker:    ["speaker", "speakers", "bluetooth speaker", "sound box"],
  camera:     ["camera", "camra", "dslr", "webcam"],
  tv:         ["tv", "television", "led", "monitor", "screen"],
  led:        ["led", "tv", "television", "screen", "monitor"],

  // ── Beauty & Personal Care ────────────────────────────────────────────────
  makeup:     ["makeup", "cosmetics", "beauty", "make up", "mekyp"],
  cosmetics:  ["cosmetics", "makeup", "beauty"],
  cream:      ["cream", "lotion", "moisturizer", "kreem"],
  lotion:     ["lotion", "cream", "moisturizer", "body lotion"],
  perfume:    ["perfume", "fragrance", "ittar", "attar", "scent", "parfum"],
  ittar:      ["ittar", "attar", "perfume", "fragrance"],
  attar:      ["attar", "ittar", "perfume", "fragrance"],
  shampoo:    ["shampoo", "shampo", "hair wash"],
  conditioner:["conditioner", "hair conditioner"],
  lipstick:   ["lipstick", "lip color", "lip colour"],
  foundation: ["foundation", "base", "bb cream"],

  // ── Home & Kitchen ────────────────────────────────────────────────────────
  bartan:     ["bartan", "utensil", "utensils", "vessel", "cookware"],
  utensil:    ["utensil", "utensils", "bartan", "cookware"],
  pateela:    ["pateela", "pot", "degh", "deg"],
  pot:        ["pot", "pateela", "cookware", "pan"],
  pan:        ["pan", "tawa", "frying pan"],
  tawa:       ["tawa", "pan", "griddle"],
  fridge:     ["fridge", "refrigerator", "freezer"],
  fan:        ["fan", "ceiling fan", "table fan", "pankha"],
  pankha:     ["pankha", "fan", "ceiling fan"],
  carpet:     ["carpet", "rug", "qaleen", "darri"],
  qaleen:     ["qaleen", "carpet", "rug"],
  pillow:     ["pillow", "takiya", "cushion"],
  takiya:     ["takiya", "pillow", "cushion"],
  blanket:    ["blanket", "razai", "quilt", "comforter"],
  razai:      ["razai", "blanket", "quilt", "comforter"],
  chair:      ["chair", "kursi", "seat", "stool"],
  kursi:      ["kursi", "chair", "seat"],
  table:      ["table", "mez", "desk"],
  mez:        ["mez", "table", "desk"],

  // ── Stationery & School ───────────────────────────────────────────────────
  pen:        ["pen", "qalam", "ballpen", "ballpoint"],
  pencil:     ["pencil", "lead pencil"],
  book:       ["book", "books", "kitab", "notebook", "copy"],
  books:      ["books", "book", "kitab"],
  kitab:      ["kitab", "book", "books"],
  bag:        ["bag", "baig", "backpack", "purse", "handbag", "beg"],
  backpack:   ["backpack", "bag", "school bag"],
  purse:      ["purse", "bag", "handbag", "clutch"],

  // ── Days / Deals ──────────────────────────────────────────────────────────
  monday:     ["monday", "mon", "monday deal"],
  tuesday:    ["tuesday", "tue", "tuesday deal"],
  wednesday:  ["wednesday", "wed", "wednesday deal"],
  thursday:   ["thursday", "thu", "thursday deal"],
  friday:     ["friday", "fri", "friday deal", "juma"],
  saturday:   ["saturday", "sat", "saturday deal"],
  sunday:     ["sunday", "sun", "sunday deal"],
  mon:        ["mon", "monday"],
  tue:        ["tue", "tuesday"],
  wed:        ["wed", "wednesday"],
  thu:        ["thu", "thursday"],
  fri:        ["fri", "friday"],
  sat:        ["sat", "saturday"],
  sun:        ["sun", "sunday"],
  deal:       ["deal", "deals", "offer", "offers", "sale", "discount"],
  deals:      ["deals", "deal", "offer", "offers", "sale"],
  offer:      ["offer", "offers", "deal", "deals", "sale", "discount"],
  sale:       ["sale", "deal", "deals", "offer", "discount", "clearance"],
  discount:   ["discount", "off", "sale", "offer", "reduced"],

  // ── Months ────────────────────────────────────────────────────────────────
  august:     ["august", "aug"],
  september:  ["september", "sep", "sept"],
  october:    ["october", "oct"],
  november:   ["november", "nov"],
  december:   ["december", "dec"],
  january:    ["january", "jan"],
  february:   ["february", "feb"],
  march:      ["march", "mar"],
  april:      ["april", "apr"],
  june:       ["june", "jun"],
  july:       ["july", "jul"],

  // ── Category aliases ─────────────────────────────────────────────────────
  grocery:    ["grocery", "groceries", "kiryana", "general store", "kiranas"],
  groceries:  ["groceries", "grocery", "kiryana"],
  kiryana:    ["kiryana", "grocery", "groceries", "general store"],
  fashion:    ["fashion", "clothing", "clothes", "garments", "dress"],
  clothing:   ["clothing", "clothes", "garments", "fashion", "dress"],
  clothes:    ["clothes", "clothing", "garments", "fashion"],
  electronics:["electronics", "electric", "gadget", "gadgets", "tech"],
  gadget:     ["gadget", "gadgets", "electronics", "device"],
  toys:       ["toys", "toy", "game", "games", "khiloona"],
  toy:        ["toy", "toys", "game", "khiloona"],
  khiloona:   ["khiloona", "toy", "toys"],
  sports:     ["sports", "sport", "fitness", "gym"],
  fitness:    ["fitness", "gym", "sports", "exercise"],
  medicine:   ["medicine", "dawai", "dawa", "health"],
  dawai:      ["dawai", "dawa", "medicine", "health"],
  dawa:       ["dawa", "dawai", "medicine"],
  bakery:     ["bakery", "cake", "bread", "roti"],
  cake:       ["cake", "pastry", "bakery"],
  restaurant: ["restaurant", "food", "eatery", "dhaba", "hotel"],
  food:       ["food", "khana", "restaurant", "eatery"],
  khana:      ["khana", "food", "khaana"],
  khaana:     ["khaana", "khana", "food"],
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Normalize for comparison: ALWAYS lowercase, strip diacritics, collapse
 * punctuation/spaces, remove noise characters.
 * This is the single source of truth — every comparison goes through this.
 */
export function normalizeSearchText(input: string): string {
  return (input || "")
    .toLowerCase()                           // Case-insensitive: CAPS = small
    .normalize("NFKD")                       // decompose accented chars
    .replace(/[\u0300-\u036f]/g, "")         // strip diacritic marks
    .replace(/[^\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeffا-ي\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Simple English stemmer — handles common Pakistani English patterns. */
function stem(word: string): string[] {
  const w = word;
  const out = new Set<string>([w]);

  // Plural → singular: shirts → shirt, shoes → shoe, dresses → dress
  if (w.length > 4) {
    if (w.endsWith("ies"))  out.add(w.slice(0, -3) + "y");  // babies → baby
    if (w.endsWith("ves"))  out.add(w.slice(0, -3) + "f");  // knives → knife
    if (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("zes"))
                            out.add(w.slice(0, -2));          // dresses → dress
    if (w.endsWith("es"))   out.add(w.slice(0, -2));          // shoes → sho (weak)
    if (w.endsWith("s") && !w.endsWith("ss"))
                            out.add(w.slice(0, -1));          // shirts → shirt
    // -ing: running → run
    if (w.endsWith("ing") && w.length > 5) {
      out.add(w.slice(0, -3));
      out.add(w.slice(0, -3) + "e");
    }
    // -ed: cleaned → clean
    if (w.endsWith("ed") && w.length > 4) {
      out.add(w.slice(0, -2));
      out.add(w.slice(0, -1));
    }
    // -er/-est superlatives
    if (w.endsWith("er") && w.length > 4) out.add(w.slice(0, -2));
    if (w.endsWith("est") && w.length > 5) out.add(w.slice(0, -3));
  }

  return [...out].filter((x) => x.length >= 2);
}

/** Safe token for PostgREST ILIKE (escape chars that break the OR string). */
export function escapeIlikeToken(token: string): string {
  return token.replace(/[%_,.()'"\[\]{}]/g, " ").replace(/\s+/g, " ").trim();
}

/** Phonetic / spelling variants of a single token. */
function phoneticVariants(token: string): string[] {
  const t = normalizeSearchText(token);
  if (t.length < 2) return t ? [t] : [];
  const out = new Set<string>([t]);

  // Collapse repeated letters: zingger → zinger
  out.add(t.replace(/(.)\1+/g, "$1"));

  const swaps: Array<[RegExp, string]> = [
    [/ph/g,  "f"],
    [/f/g,   "ph"],
    [/gh/g,  "g"],
    [/kh/g,  "k"],
    [/sh/g,  "s"],
    [/ch/g,  "c"],
    [/th/g,  "t"],
    [/aa/g,  "a"],
    [/ee/g,  "i"],
    [/oo/g,  "u"],
    [/ou/g,  "o"],
    [/ck/g,  "k"],
    [/qu/g,  "k"],
    [/wh/g,  "w"],
    [/[iy]/g,"i"],   // kursi/kursy
    [/[aeou]/g, "a"],// cheap vowel collapse for Urdu romanisation
  ];

  for (const [re, rep] of swaps) {
    const v = t.replace(re, rep);
    if (v !== t) out.add(v);
  }

  // Common Urdu romanisation pairs
  const urduSwaps: Array<[RegExp, string]> = [
    [/z/g, "j"],  [/j/g, "z"],      // zarda / jarda
    [/q/g, "k"],  [/k/g, "q"],      // qalam / kalam
    [/c/g, "k"],                     // cake / kake
    [/v/g, "b"],  [/b/g, "v"],      // bartan / vartan (rare)
    [/w/g, "v"],                     // waja / vaja
  ];
  for (const [re, rep] of urduSwaps) {
    const v = t.replace(re, rep);
    if (v !== t && v.length >= 2) out.add(v);
  }

  // Adjacent transposition (common typo): sheos → shoes
  if (t.length >= 3 && t.length <= 14) {
    for (let i = 0; i < t.length - 1; i++) {
      out.add(t.slice(0, i) + t[i + 1] + t[i] + t.slice(i + 2));
    }
  }

  // Drop one char for short-medium words (missing letter typo)
  if (t.length >= 4 && t.length <= 10) {
    for (let i = 0; i < t.length; i++) {
      out.add(t.slice(0, i) + t.slice(i + 1));
    }
  }

  return [...out].filter((x) => x.length >= 2).slice(0, 16);
}

/**
 * Expand a user query into search tokens for ILIKE + ranking.
 * Order: original phrase → individual words → stems → synonyms → phonetics.
 * All output is lowercased — caps/small NEVER differ.
 */
export function expandSearchQuery(query: string, maxTokens = 16): string[] {
  const q = normalizeSearchText(query);   // guaranteed lowercase
  if (!q) return [];

  const tokens: string[] = [];
  const push = (t: string) => {
    const n = normalizeSearchText(t);     // double-ensure lowercase
    if (!n || tokens.includes(n) || n.length < 2) return;
    tokens.push(n);
  };

  // 1. Full phrase (allows multi-word ILIKE match)
  push(q);

  // 2. Individual words
  const words = q.split(" ").filter(Boolean);
  for (const w of words) push(w);

  // 3. Stems of each word
  for (const w of words) {
    for (const s of stem(w)) push(s);
  }

  // 4. Synonyms
  for (const w of words) {
    for (const s of stem(w)) {
      const syns = SYNONYMS[s] ?? SYNONYMS[w];
      if (syns) syns.forEach(push);
    }
  }

  // 5. Phonetic variants (last — most speculative)
  for (const w of words) {
    phoneticVariants(w).forEach(push);
  }

  return tokens.slice(0, maxTokens);
}

/**
 * Build PostgREST `.or()` ILIKE clause across columns for expanded tokens.
 * Higher maxPatterns → broader DB net → more candidates for client ranking.
 */
export function buildFuzzyIlikeOr(
  query: string,
  columns: string[],
  maxPatterns = 12,          // was 6 — doubled for better recall
): string | null {
  const patterns = expandSearchQuery(query, maxPatterns)
    .map(escapeIlikeToken)
    .filter(Boolean);
  if (!patterns.length || !columns.length) return null;

  return patterns
    .flatMap((p) => columns.map((c) => `${c}.ilike.%${p}%`))
    .join(",");
}

/* -------------------------------------------------------------------------- */
/*  Scoring                                                                    */
/* -------------------------------------------------------------------------- */

/** Classic Levenshtein distance (integer edits). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) row[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[b.length];
}

/**
 * Score one query-token against one text-token (0–100).
 * Exact → prefix → contains → synonym → edit-distance.
 * All comparisons are NORMALISED — case-insensitive guaranteed.
 */
function scoreTokenPair(queryToken: string, textToken: string): number {
  const qw = normalizeSearchText(queryToken);    // always lowercase
  const tw = normalizeSearchText(textToken);     // always lowercase
  if (!qw || !tw) return 0;

  // Build variant set: query word + its stems + synonyms
  const variantSet = new Set<string>([qw]);
  for (const s of stem(qw)) variantSet.add(normalizeSearchText(s));
  for (const s of stem(qw)) {
    (SYNONYMS[s] ?? SYNONYMS[qw] ?? []).forEach((x) =>
      variantSet.add(normalizeSearchText(x)),
    );
  }

  let best = 0;
  for (const v of variantSet) {
    if (!v || v.length < 2) continue;
    if (tw === v)                             best = Math.max(best, 100);
    else if (tw.startsWith(v) || v.startsWith(tw)) best = Math.max(best, 88);
    else if (tw.includes(v) || v.includes(tw)) best = Math.max(best, 74);
    else {
      const dist = levenshtein(v, tw);
      const maxLen = Math.max(v.length, tw.length);
      const ratio = maxLen > 0 ? dist / maxLen : 1;
      if (ratio <= 0.30 && Math.min(v.length, tw.length) >= 3) {
        best = Math.max(best, clamp(70 - ratio * 45));
      } else if (ratio <= 0.45 && Math.min(v.length, tw.length) >= 4) {
        best = Math.max(best, clamp(54 - ratio * 30));
      }
    }
  }
  return best;
}

/**
 * Best score for one query word against full normalised text.
 */
function scoreQueryWordAgainstText(qw: string, text: string, tWords: string[]): number {
  let best = 0;

  // Token-by-token comparison
  for (const tw of tWords) {
    best = Math.max(best, scoreTokenPair(qw, tw));
  }

  // Substring / contains against the full normalised title
  const variantSet = new Set<string>([qw]);
  for (const s of stem(qw)) variantSet.add(s);
  (SYNONYMS[qw] ?? []).forEach((x) => variantSet.add(normalizeSearchText(x)));

  for (const v of variantSet) {
    if (!v || v.length < 2) continue;
    if (text.includes(v)) best = Math.max(best, clamp(78 + Math.min(8, v.length)));
  }
  return best;
}

/**
 * Score how well `text` matches `query` (0–100).
 * Normalises both inputs so caps/small NEVER affect ranking.
 */
export function scoreTextMatch(query: string, text: string): number {
  const q = normalizeSearchText(query);    // lowercase
  const t = normalizeSearchText(text);     // lowercase
  if (!q || !t) return 0;

  // ── Exact / phrase matches (highest priority) ──────────────────────────
  if (t === q) return 100;
  if (t.startsWith(q)) return clamp(94 + Math.min(5, (q.length / t.length) * 6));
  if (t.includes(q))   return clamp(82 + Math.min(10, (q.length / t.length) * 12));

  // Check stems of the whole query too
  for (const s of stem(q)) {
    if (t === s)          return 96;
    if (t.startsWith(s)) return 88;
    if (t.includes(s))   return 80;
  }

  // ── Multi-word scoring ─────────────────────────────────────────────────
  const qWords = q.split(" ").filter(Boolean);
  const tWords = t.split(" ").filter(Boolean);
  if (!qWords.length) return 0;

  const wordScores = qWords.map((qw) => scoreQueryWordAgainstText(qw, t, tWords));
  const matched    = wordScores.filter((s) => s >= 48);
  const matchRatio = matched.length / qWords.length;
  const avgMatched =
    matched.length > 0
      ? matched.reduce((a, b) => a + b, 0) / matched.length
      : 0;

  if (matched.length > 0) {
    const coverageBoost  = matchRatio * 28;
    const multiWordBonus = matched.length > 1 ? matched.length * 4 : 0;
    return clamp(Math.round(avgMatched * 0.62 + coverageBoost + multiWordBonus));
  }

  // ── Whole-string edit distance fallback ───────────────────────────────
  const window = t.slice(0, Math.max(q.length + 4, Math.min(t.length, q.length * 2)));
  const dist   = levenshtein(q, window);
  const ratio  = dist / Math.max(q.length, window.length, 1);
  if (ratio <= 0.38 && q.length >= 3) return clamp(56 - ratio * 50);

  return 0;
}

/** Best score across multiple fields (name weighted higher via caller weights). */
export function scoreFieldsMatch(
  query: string,
  fields: Array<string | null | undefined>,
  weights?: number[],
): number {
  let best = 0;
  fields.forEach((field, i) => {
    if (!field) return;
    const w = weights?.[i] ?? 1;
    best = Math.max(best, scoreTextMatch(query, field) * w);
  });
  return clamp(best);
}

export interface FuzzyRanked<T> {
  item: T;
  score: number;
}

/**
 * Filter + rank items by fuzzy relevance.
 * Exact/prefix results come first; typos still included when close enough.
 */
export function fuzzyFilterAndRank<T>(
  items: T[],
  query: string,
  getFields: (item: T) => Array<string | null | undefined>,
  options?: { minScore?: number; weights?: number[]; limit?: number },
): FuzzyRanked<T>[] {
  const q = normalizeSearchText(query);   // lowercase — case NEVER matters
  if (!q) return items.map((item) => ({ item, score: 100 }));

  const minScore = options?.minScore ?? FUZZY_MIN_SCORE;
  const ranked: FuzzyRanked<T>[] = [];

  for (const item of items) {
    const score = scoreFieldsMatch(q, getFields(item), options?.weights);
    if (score >= minScore) ranked.push({ item, score });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Prefer shorter titles on ties (closest match feel)
    const an = String(getFields(a.item)[0] ?? "");
    const bn = String(getFields(b.item)[0] ?? "");
    if (an.length !== bn.length) return an.length - bn.length;
    return an.localeCompare(bn);
  });

  if (options?.limit != null) return ranked.slice(0, options.limit);
  return ranked;
}

/** Convenience: does text fuzzily match query? */
export function fuzzyMatches(
  query: string,
  text: string,
  minScore = FUZZY_MIN_SCORE,
): boolean {
  return scoreTextMatch(query, text) >= minScore;
}

/** "Did you mean" style suggestions from synonym map + phonetics. */
export function suggestSearchCorrections(query: string, limit = 5): string[] {
  const q = normalizeSearchText(query);
  if (q.length < 2) return [];
  const out: string[] = [];
  const push = (s: string) => {
    const n = normalizeSearchText(s);
    if (!n || n === q || out.includes(n)) return;
    out.push(n);
  };

  for (const word of q.split(" ")) {
    for (const s of stem(word)) {
      (SYNONYMS[s] ?? SYNONYMS[word] ?? []).forEach(push);
    }
    // Find closest synonym key by edit distance
    let bestKey = "";
    let bestDist = Infinity;
    for (const key of Object.keys(SYNONYMS)) {
      const d = levenshtein(word, key);
      if (d > 0 && d < bestDist && d <= 2 && word.length >= 3) {
        bestDist = d;
        bestKey = key;
      }
    }
    if (bestKey) (SYNONYMS[bestKey] ?? [bestKey]).forEach(push);
  }

  return out.slice(0, limit);
}
