/* Client-side TrendBot learning — improves suggestions over time */

const STORAGE_KEY = "tm_trendbot_memory_v2";

export interface TrendBotMemory {
  sessions: number;
  /** query text → helpful count */
  helpfulQueries: Record<string, number>;
  /** intent/topic → score */
  topicScores: Record<string, number>;
  recentQueries: string[];
  lastCategory?: string;
}

function emptyMemory(): TrendBotMemory {
  return { sessions: 0, helpfulQueries: {}, topicScores: {}, recentQueries: [] };
}

function read(): TrendBotMemory {
  if (typeof window === "undefined") return emptyMemory();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyMemory();
    return { ...emptyMemory(), ...(JSON.parse(raw) as TrendBotMemory) };
  } catch {
    return emptyMemory();
  }
}

function write(mem: TrendBotMemory): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mem));
  } catch {
    /* quota */
  }
}

export function startTrendBotSession(category?: string): TrendBotMemory {
  const mem = read();
  mem.sessions += 1;
  if (category) mem.lastCategory = category;
  write(mem);
  return mem;
}

export function recordTrendBotQuery(query: string): void {
  const q = query.trim().slice(0, 120);
  if (!q) return;
  const mem = read();
  mem.recentQueries = [q, ...mem.recentQueries.filter((x) => x !== q)].slice(0, 12);
  write(mem);
}

export function recordTrendBotHelpful(query: string, intent?: string): void {
  const q = query.trim().slice(0, 120);
  if (!q) return;
  const mem = read();
  mem.helpfulQueries[q] = (mem.helpfulQueries[q] ?? 0) + 1;
  if (intent) mem.topicScores[intent] = (mem.topicScores[intent] ?? 0) + 2;
  write(mem);
}

export function recordTrendBotNotHelpful(query: string): void {
  const q = query.trim().slice(0, 120);
  if (!q) return;
  const mem = read();
  mem.helpfulQueries[q] = Math.max(0, (mem.helpfulQueries[q] ?? 0) - 1);
  write(mem);
}

/** Merge base prompts with learned preferences */
export function personalizePrompts(base: string[], limit = 5): string[] {
  const mem = read();
  const scored = new Map<string, number>();

  for (const p of base) scored.set(p, 1);

  for (const q of mem.recentQueries) {
    const boost = mem.helpfulQueries[q] ?? 0;
    if (boost > 0) scored.set(q, (scored.get(q) ?? 0) + boost + 1);
  }

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([text]) => text)
    .slice(0, limit);
}

export function getMemoryHint(): string[] {
  const mem = read();
  return mem.recentQueries.slice(0, 3);
}

export function getSessionLabel(sessions: number): string {
  if (sessions <= 1) return "Pehli baar mil kar khushi hui!";
  if (sessions < 5) return "Wapas aaye — shukriya!";
  if (sessions < 15) return "Regular user — main aapko pehchan raha hoon.";
  return "VIP — aapke sawalon se seekh chuka hoon.";
}
