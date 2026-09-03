/* Soft cute TrendBot voice — muteable, never spammy */

const MUTE_KEY = "tm_trendbot_voice_mute_v1";
const LAST_VOICE_KEY = "tm_trendbot_voice_last_v1";
const ROUTE_VOICE_KEY = "tm_trendbot_voice_routes_v1";

const MIN_GAP_MS = 55_000;

let voicesReady = false;

function ensureVoicesLoaded(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  if (voicesReady || window.speechSynthesis.getVoices().length > 0) {
    voicesReady = true;
    return;
  }
  window.speechSynthesis.addEventListener(
    "voiceschanged",
    () => {
      voicesReady = true;
    },
    { once: true },
  );
}

if (typeof window !== "undefined") {
  ensureVoicesLoaded();
}

export function isTrendBotVoiceMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return true;
  }
}

export function setTrendBotVoiceMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (muted && typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function shouldSkipHeavy(): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  } catch {
    /* ignore */
  }
  try {
    const nav = navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    };
    const c = nav.connection;
    if (c?.saveData || c?.effectiveType === "slow-2g" || c?.effectiveType === "2g") {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Prefer soft / friendly English voices (works well for Roman Urdu tips too). */
function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  ensureVoicesLoaded();
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const score = (v: SpeechSynthesisVoice): number => {
    let s = 0;
    const name = v.name.toLowerCase();
    const lang = v.lang.toLowerCase();
    if (/en(-|_)?(gb|us|in|au|ie)/i.test(lang)) s += 8;
    else if (/^en/i.test(lang)) s += 5;
    else if (/ur|hi/i.test(lang)) s += 4;
    if (/female|woman|zira|samantha|karen|moira|google uk english female|neural|natural/i.test(name)) {
      s += 10;
    }
    if (/microsoft.*(aria|jenny|sara|neerja)|google.*female/i.test(name)) s += 6;
    if (/male|david|mark|ravi/i.test(name)) s -= 4;
    if (v.localService) s += 1;
    return s;
  };

  return [...voices].sort((a, b) => score(b) - score(a))[0] ?? null;
}

function routeAlreadySpoken(routeKey: string): boolean {
  try {
    const raw = sessionStorage.getItem(ROUTE_VOICE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    return Boolean(map[routeKey]);
  } catch {
    return false;
  }
}

function markRouteSpoken(routeKey: string): void {
  try {
    const raw = sessionStorage.getItem(ROUTE_VOICE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    map[routeKey] = Date.now();
    sessionStorage.setItem(ROUTE_VOICE_KEY, JSON.stringify(map));
    sessionStorage.setItem(LAST_VOICE_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function lastVoiceAt(): number {
  try {
    return Number(sessionStorage.getItem(LAST_VOICE_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

/**
 * Speak a short tip once per route / with cooldown.
 * Returns false if skipped (muted, busy, cooldown, unsupported).
 */
export function speakTrendBotLine(
  text: string,
  options?: { routeKey?: string; force?: boolean; cute?: boolean },
): boolean {
  if (typeof window === "undefined") return false;
  if (!("speechSynthesis" in window)) return false;
  if (isTrendBotVoiceMuted()) return false;
  if (shouldSkipHeavy()) return false;
  if (!text.trim()) return false;

  const now = Date.now();
  if (!options?.force && now - lastVoiceAt() < MIN_GAP_MS) return false;
  if (options?.routeKey && !options.force && routeAlreadySpoken(options.routeKey)) {
    return false;
  }

  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text.slice(0, 160).trim());
    // Soft, slightly playful voice
    utter.rate = options?.cute === false ? 1 : 1.05;
    utter.pitch = options?.cute === false ? 1 : 1.22;
    utter.volume = 0.88;
    const voice = pickVoice();
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang || "en-IN";
    } else {
      utter.lang = "en-IN";
    }
    // Chrome sometimes needs a tiny delay after cancel
    window.setTimeout(() => {
      try {
        window.speechSynthesis.speak(utter);
      } catch {
        /* ignore */
      }
    }, 40);
    if (options?.routeKey) markRouteSpoken(options.routeKey);
    else {
      try {
        sessionStorage.setItem(LAST_VOICE_KEY, String(now));
      } catch {
        /* ignore */
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** Strip markdown and speak a short spoken summary of a bot reply. */
export function speakTrendBotReply(
  markdown: string,
  options?: { productName?: string; productCount?: number },
): boolean {
  if (isTrendBotVoiceMuted()) return false;

  if (options?.productName) {
    const n = options.productCount ?? 1;
    const line =
      n > 1
        ? `I found ${n} options. Top pick is ${options.productName}.`
        : `Best match is ${options.productName}.`;
    return speakTrendBotLine(line, { force: true, cute: true });
  }

  const plain = markdown
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_#`~>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (plain.length < 12) return false;

  // First sentence-ish, keep short for TTS
  const cut = plain.match(/^.{12,120}?[.!?…](?:\s|$)/)?.[0] || plain.slice(0, 110);
  return speakTrendBotLine(cut.trim(), { force: true, cute: true });
}

export function cancelTrendBotVoice(): void {
  if (typeof window === "undefined") return;
  if ("speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}
