"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { getTurnstileSiteKey } from "@/lib/turnstilePublic";

/* -------------------------------------------------------------------------- */
/*  Cloudflare Turnstile — interaction-only (usually invisible to real users)  */
/* -------------------------------------------------------------------------- */

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/api.js?render=explicit";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      theme?: "light" | "dark" | "auto";
      appearance?: "always" | "execute" | "interaction-only";
      size?: "normal" | "compact" | "flexible";
      callback?: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
      "timeout-callback"?: () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export interface TurnstileFieldHandle {
  /** Drop the current token and request a fresh one. */
  reset: () => void;
  /** Current token, or null if not ready. */
  getToken: () => string | null;
  /** Wait until a token is available (or timeout). */
  waitForToken: (timeoutMs?: number) => Promise<string | null>;
}

interface TurnstileFieldProps {
  onTokenChange?: (token: string | null) => void;
  className?: string;
  /** When true, widget is not required / not shown. */
  disabled?: boolean;
}

let scriptLoadPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src^="https://challenges.cloudflare.com/turnstile/api.js"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Turnstile script failed")), {
        once: true,
      });
      if (window.turnstile) resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile script failed"));
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

const TurnstileField = forwardRef<TurnstileFieldHandle, TurnstileFieldProps>(
  function TurnstileField({ onTokenChange, className, disabled = false }, ref) {
    const siteKey = getTurnstileSiteKey();
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const tokenRef = useRef<string | null>(null);
    const onTokenChangeRef = useRef(onTokenChange);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
      onTokenChangeRef.current = onTokenChange;
    }, [onTokenChange]);

    const setToken = useCallback((token: string | null) => {
      tokenRef.current = token;
      onTokenChangeRef.current?.(token);
    }, []);

    const reset = useCallback(() => {
      setToken(null);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.reset(widgetIdRef.current);
        } catch {
          /* ignore */
        }
      }
    }, [setToken]);

    useImperativeHandle(
      ref,
      () => ({
        reset,
        getToken: () => tokenRef.current,
        waitForToken: (timeoutMs = 12_000) =>
          new Promise((resolve) => {
            if (tokenRef.current) {
              resolve(tokenRef.current);
              return;
            }
            const started = Date.now();
            const id = window.setInterval(() => {
              if (tokenRef.current) {
                window.clearInterval(id);
                resolve(tokenRef.current);
                return;
              }
              if (Date.now() - started >= timeoutMs) {
                window.clearInterval(id);
                resolve(null);
              }
            }, 150);
          }),
      }),
      [reset],
    );

    useEffect(() => {
      if (!siteKey || disabled) return;
      let cancelled = false;

      (async () => {
        try {
          await loadTurnstileScript();
          if (cancelled || !containerRef.current || !window.turnstile) return;

          if (widgetIdRef.current) {
            try {
              window.turnstile.remove(widgetIdRef.current);
            } catch {
              /* ignore */
            }
            widgetIdRef.current = null;
          }

          const prefersDark =
            typeof document !== "undefined" &&
            document.documentElement.classList.contains("dark");

          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            theme: prefersDark ? "dark" : "auto",
            // Most humans never see a puzzle — only suspicious traffic does.
            appearance: "interaction-only",
            size: "flexible",
            callback: (token) => {
              setFailed(false);
              setToken(token);
              setReady(true);
            },
            "error-callback": () => {
              setToken(null);
              setFailed(true);
            },
            "expired-callback": () => {
              setToken(null);
            },
            "timeout-callback": () => {
              setToken(null);
              setFailed(true);
            },
          });
          setReady(true);
        } catch {
          if (!cancelled) setFailed(true);
        }
      })();

      return () => {
        cancelled = true;
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            /* ignore */
          }
          widgetIdRef.current = null;
        }
      };
    }, [siteKey, disabled, setToken]);

    if (!siteKey || disabled) return null;

    return (
      <div className={className}>
        <div ref={containerRef} className="min-h-[0] overflow-hidden" />
        {failed && (
          <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">
            Security check couldn&apos;t load.{" "}
            <button
              type="button"
              onClick={() => {
                setFailed(false);
                reset();
              }}
              className="font-semibold underline underline-offset-2"
            >
              Retry
            </button>
          </p>
        )}
        {!ready && !failed && (
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Checking security…</p>
        )}
      </div>
    );
  },
);

export default TurnstileField;
