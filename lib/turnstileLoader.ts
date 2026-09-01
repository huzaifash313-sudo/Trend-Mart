/* -------------------------------------------------------------------------- */
/*  TrendsMart — single Turnstile script loader (client only)                   */
/* -------------------------------------------------------------------------- */

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const LOAD_EVENT = "trendsmart-turnstile-ready";

let loadPromise: Promise<void> | null = null;

export function isTurnstileScriptReady(): boolean {
  return typeof window !== "undefined" && typeof window.turnstile?.render === "function";
}

/** Load Cloudflare Turnstile once per page session. */
export function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (isTurnstileScriptReady()) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const done = () => {
      window.dispatchEvent(new Event(LOAD_EVENT));
      resolve();
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="challenges.cloudflare.com/turnstile"]',
    );
    if (existing) {
      if (isTurnstileScriptReady()) {
        done();
        return;
      }
      existing.addEventListener("load", () => done(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Turnstile script failed to load")),
        { once: true },
      );
      const waitId = window.setInterval(() => {
        if (isTurnstileScriptReady()) {
          window.clearInterval(waitId);
          done();
        }
      }, 100);
      window.setTimeout(() => window.clearInterval(waitId), 15_000);
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => done();
    script.onerror = () => reject(new Error("Turnstile script failed to load"));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function onTurnstileScriptReady(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (isTurnstileScriptReady()) {
    cb();
    return () => undefined;
  }
  const handler = () => cb();
  window.addEventListener(LOAD_EVENT, handler);
  return () => window.removeEventListener(LOAD_EVENT, handler);
}
