/* -------------------------------------------------------------------------- */
/*  TrendMart — Fuzzy / tolerant search ranking                               */
/*  exact → prefix → contains → token → phonetic → edit-distance              */
/* -------------------------------------------------------------------------- */

/** Minimum score (0–100) to keep a result when fuzzy-filtering. */
export const FUZZY_MIN_SCORE = 28;

const SYNONYMS: Record<string, string[]> = {
  zinger: ["zinger", "zinger burger", "chicken burger"],
  burger: ["burger", "zinger burger", "anday wala burger"],
  aata: ["aata", "atta", "flour"],
  atta: ["atta", "aata", "flour"],
  chawal: ["chawal", "rice", "basmati"],
  rice: ["rice", "chawal", "basmati"],
  chicken: ["chicken", "murgh"],
  murgh: ["murgh", "chicken"],
  gosht: ["gosht", "meat", "mutton", "beef"],
  doodh: ["doodh", "milk"],
  milk: ["milk", "doodh"],
  anda: ["anda", "egg", "eggs"],
  egg: ["egg", "eggs", "anda"],
  roti: ["roti", "chapati", "naan", "bread"],
  pizza: ["pizza"],
  biryani: ["biryani", "biryani rice"],
  karahi: ["karahi", "karahi"],
  samosa: ["samosa", "snack"],
  shalwar: ["shalwar", "shalwar kameez", "suit"],
  kameez: ["kameez", "shalwar kameez"],
  kurti: ["kurti", "tunic"],
  mobile: ["mobile", "phone", "smartphone"],
  phone: ["phone", "mobile", "smartphone"],
  laptop: ["laptop", "notebook", "computer"],
  earphone: ["earphone", "earbuds", "headphone", "handsfree"],
  headphone: ["headphone", "earphone", "earbuds"],
  charger: ["charger", "cable", "adapter"],
  makeup: ["makeup", "cosmetics", "beauty"],
  cream: ["cream", "lotion", "moisturizer"],
  perfume: ["perfume", "fragrance", "ittar"],
  cheeni: ["cheeni", "chini", "sugar"],
  sugar: ["sugar", "cheeni", "chini"],
  namak: ["namak", "salt"],
  ghee: ["ghee", "desi ghee"],
  daal: ["daal", "dal", "lentils"],
  masala: ["masala", "spices"],
  sabzi: ["sabzi", "vegetables"],
  soap: ["soap", "sabun"],
  sabun: ["sabun", "soap"],
  tomato: ["tomato", "tomatoes", "tamatar"],
  tomatoes: ["tomatoes", "tomato", "tamatar"],
  tamatar: ["tamatar", "tomato", "tomatoes"],
  onion: ["onion", "pyaz", "piyaz"],
  pyaz: ["pyaz", "piyaz", "onion"],
  potato: ["potato", "aloo", "alu"],
  aloo: ["aloo", "alu", "potato"],
  oil: ["oil", "tel"],
  tel: ["tel", "oil"],
  water: ["water", "pani"],
  pani: ["pani", "water"],
  bread: ["bread", "roti", "double roti"],
  // Deal day / date search
  monday: ["monday", "mon", "monday deal"],
  tuesday: ["tuesday", "tue", "tuesday deal"],
  wednesday: ["wednesday", "wed", "wednesday deal"],
  thursday: ["thursday", "thu", "thursday deal"],
  friday: ["friday", "fri", "friday deal"],
  saturday: ["saturday", "sat", "saturday deal"],
  sunday: ["sunday", "sun", "sunday deal"],
  mon: ["mon", "monday", "monday deal"],
  tue: ["tue", "tuesday", "tuesday deal"],
  wed: ["wed", "wednesday", "wednesday deal"],
  thu: ["thu", "thursday", "thursday deal"],
  fri: ["fri", "friday", "friday deal"],
  sat: ["sat", "saturday", "saturday deal"],
  sun: ["sun", "sunday", "sunday deal"],
  deal: ["deal", "deals", "offer", "offers", "sale"],
  deals: ["deals", "deal", "offer", "offers"],
  august: ["august", "aug"],
  september: ["september", "sep", "sept"],
  october: ["october", "oct"],
  november: ["november", "nov"],
  december: ["december", "dec"],
  january: ["january", "jan"],
  february: ["february", "feb"],
  march: ["march", "mar"],
  april: ["april", "apr"],
  june: ["june", "jun"],
  july: ["july", "jul"],
};

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

/** Normalize for comparison: lowercase, collapse spaces, strip noise. */
export function normalizeSearchText(input: string): string {
  return (input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Safe token for PostgREST ILIKE (escape % _ ,). */
export function escapeIlikeToken(token: string): string {
  return token.replace(/[%_,.()']/g, " ").replace(/\s+/g, " ").trim();
}

/** Phonetic / typing variants of a single token. */
function phoneticVariants(token: string): string[] {
  const t = normalizeSearchText(token);
  if (t.length < 2) return t ? [t] : [];
  const out = new Set<string>([t]);

  // Collapse repeated letters: zingger → zinger
  out.add(t.replace(/(.)\1+/g, "$1"));

  const swaps: Array<[RegExp, string]> = [
    [/ph/g, "f"],
    [/f/g, "ph"],
    [/gh/g, "g"],
    [/kh/g, "k"],
    [/sh/g, "s"],
    [/ch/g, "c"],
    [/th/g, "t"],
    [/aa/g, "a"],
    [/ee/g, "i"],
    [/oo/g, "u"],
    [/ou/g, "o"],
    [/ie/g, "ei"],
    [/ei/g, "ie"],
    [/ck/g, "k"],
    [/qu/g, "k"],
  ];
  for (const [re, rep] of swaps) {
    if (re.test(t)) out.add(t.replace(re, rep));
  }

  // Adjacent transposition (common typo)
  if (t.length >= 3 && t.length <= 14) {
    for (let i = 0; i < t.length - 1; i += 1) {
      out.add(t.slice(0, i) + t[i + 1] + t[i] + t.slice(i + 2));
    }
  }

  // Drop one char / double one char for short words
  if (t.length >= 4 && t.length <= 10) {
    for (let i = 0; i < t.length; i += 1) {
      out.add(t.slice(0, i) + t.slice(i + 1));
    }
  }

  return [...out].filter((x) => x.length >= 2).slice(0, 12);
}

/**
 * Expand a user query into search tokens / phrases for ILIKE + ranking.
 * Order: original phrase, words, synonyms, phonetics.
 */
export function expandSearchQuery(query: string, maxTokens = 12): string[] {
  const q = normalizeSearchText(query);
  if (!q) return [];

  const tokens: string[] = [];
  const push = (t: string) => {
    const n = normalizeSearchText(t);
    if (!n || tokens.includes(n)) return;
    tokens.push(n);
  };

  push(q);
  for (const word of q.split(" ")) push(word);

  for (const word of q.split(" ")) {
    const syns = SYNONYMS[word];
    if (syns) syns.forEach(push);
  }

  for (const word of q.split(" ")) {
    phoneticVariants(word).forEach(push);
  }

  return tokens.slice(0, maxTokens);
}

/** Build PostgREST `.or()` ILIKE clause across columns for expanded tokens. */
export function buildFuzzyIlikeOr(
  query: string,
  columns: string[],
  maxPatterns = 6,
): string | null {
  const patterns = expandSearchQuery(query, maxPatterns)
    .map(escapeIlikeToken)
    .filter(Boolean);
  if (!patterns.length || !columns.length) return null;

  return patterns
    .flatMap((p) => columns.map((c) => `${c}.ilike.%${p}%`))
    .join(",");
}

/** Classic Levenshtein distance (integer edits). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) row[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
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
 * Exact > prefix > contains > synonym > edit-distance.
 */
function scoreTokenPair(queryToken: string, textToken: string): number {
  const qw = normalizeSearchText(queryToken);
  const tw = normalizeSearchText(textToken);
  if (!qw || !tw) return 0;

  const variants = [qw, ...(SYNONYMS[qw] ?? []).map(normalizeSearchText)];
  let best = 0;

  for (const v of variants) {
    if (!v) continue;
    if (tw === v) best = Math.max(best, 100);
    else if (tw.startsWith(v) || v.startsWith(tw)) best = Math.max(best, 86);
    else if (tw.includes(v) || v.includes(tw)) best = Math.max(best, 72);
    else {
      const dist = levenshtein(v, tw);
      const maxLen = Math.max(v.length, tw.length);
      const ratio = maxLen ? dist / maxLen : 1;
      if (ratio <= 0.34 && Math.min(v.length, tw.length) >= 3) {
        best = Math.max(best, clamp(68 - ratio * 40));
      } else if (ratio <= 0.45 && Math.min(v.length, tw.length) >= 4) {
        best = Math.max(best, clamp(52 - ratio * 30));
      }
    }
  }

  return best;
}

/**
 * Best score for one query word against full text (tokens + substring).
 */
function scoreQueryWordAgainstText(qw: string, text: string, tWords: string[]): number {
  let best = 0;
  for (const tw of tWords) {
    best = Math.max(best, scoreTokenPair(qw, tw));
  }
  // Substring / contains against whole title (e.g. "soap" in "care soap pack")
  const variants = [qw, ...(SYNONYMS[qw] ?? []).map(normalizeSearchText)];
  for (const v of variants) {
    if (!v || v.length < 2) continue;
    if (text.includes(v)) best = Math.max(best, clamp(78 + Math.min(8, v.length)));
  }
  return best;
}

/**
 * Score how well `text` matches `query` (0–100).
 * Exact and prefix beat fuzzy/typo matches.
 * Multi-word queries rank by how many words match ("most match words").
 */
export function scoreTextMatch(query: string, text: string): number {
  const q = normalizeSearchText(query);
  const t = normalizeSearchText(text);
  if (!q || !t) return 0;

  if (t === q) return 100;
  if (t.startsWith(q)) return clamp(94 + Math.min(5, (q.length / t.length) * 6));
  if (t.includes(q)) return clamp(82 + Math.min(10, (q.length / t.length) * 12));

  const qWords = q.split(" ").filter(Boolean);
  const tWords = t.split(" ").filter(Boolean);
  if (!qWords.length) return 0;

  // Per-query-word best hit — prefer titles that match MORE words
  const wordScores = qWords.map((qw) => scoreQueryWordAgainstText(qw, t, tWords));
  const matched = wordScores.filter((s) => s >= 50);
  const matchRatio = matched.length / qWords.length;
  const avgMatched =
    matched.length > 0
      ? matched.reduce((a, b) => a + b, 0) / matched.length
      : 0;

  if (matched.length > 0) {
    // All words hit → strong; partial → scales with how many matched
    const coverageBoost = matchRatio * 28;
    const multiWordBonus = matched.length > 1 ? matched.length * 4 : 0;
    return clamp(Math.round(avgMatched * 0.62 + coverageBoost + multiWordBonus));
  }

  // Whole-string edit distance (short queries vs short titles)
  const window = t.slice(0, Math.max(q.length + 4, Math.min(t.length, q.length * 2)));
  const dist = levenshtein(q, window);
  const ratio = dist / Math.max(q.length, window.length, 1);
  if (ratio <= 0.4 && q.length >= 3) return clamp(55 - ratio * 50);

  return 0;
}

/** Best score across multiple fields (name weighted higher via caller order). */
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
 * Exact/prefix first; typos still included when close enough.
 */
export function fuzzyFilterAndRank<T>(
  items: T[],
  query: string,
  getFields: (item: T) => Array<string | null | undefined>,
  options?: { minScore?: number; weights?: number[]; limit?: number },
): FuzzyRanked<T>[] {
  const q = normalizeSearchText(query);
  if (!q) {
    return items.map((item) => ({ item, score: 100 }));
  }

  const minScore = options?.minScore ?? FUZZY_MIN_SCORE;
  const ranked: FuzzyRanked<T>[] = [];

  for (const item of items) {
    const score = scoreFieldsMatch(q, getFields(item), options?.weights);
    if (score >= minScore) ranked.push({ item, score });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Prefer shorter titles when scores tie (closer "most match" feel)
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

/** "Did you mean" style suggestions from synonym map + light phonetics. */
export function suggestSearchCorrections(query: string, limit = 4): string[] {
  const q = normalizeSearchText(query);
  if (q.length < 2) return [];
  const out: string[] = [];
  const push = (s: string) => {
    const n = normalizeSearchText(s);
    if (!n || n === q || out.includes(n)) return;
    out.push(n);
  };

  for (const word of q.split(" ")) {
    (SYNONYMS[word] ?? []).forEach(push);
    // Closest synonym keys by edit distance
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
