/* Soft TrendBot voice — rare, muteable, never spammy */

const MUTE_KEY = "tm_trendbot_voice_mute_v1";
const LAST_VOICE_KEY = "tm_trendbot_voice_last_v1";
const ROUTE_VOICE_KEY = "tm_trendbot_voice_routes_v1";

const MIN_GAP_MS = 90_000;

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

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const prefer =
    voices.find((v) => /en(-|_)?(GB|US|IN|AU)/i.test(v.lang) && /female|woman|zira|samantha|google/i.test(v.name)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    voices.find((v) => /ur/i.test(v.lang)) ||
    voices[0];
  return prefer ?? null;
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
  options?: { routeKey?: string; force?: boolean },
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
    const utter = new SpeechSynthesisUtterance(text.slice(0, 140));
    utter.rate = 1.02;
    utter.pitch = 1.12;
    utter.volume = 0.85;
    const voice = pickVoice();
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang || "en-US";
    } else {
      utter.lang = "en-US";
    }
    window.speechSynthesis.speak(utter);
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
