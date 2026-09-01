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
import { isTurnstileScriptReady, loadTurnstileScript, onTurnstileScriptReady } from "@/lib/turnstileLoader";

/* -------------------------------------------------------------------------- */
/*  Cloudflare Turnstile — visible Managed widget (checkbox / tick)             */
/* -------------------------------------------------------------------------- */

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: Record<string, unknown>,
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
  reset: () => void;
  getToken: () => string | null;
  waitForToken: (timeoutMs?: number) => Promise<string | null>;
  isLoadFailed: () => boolean;
  isVerified: () => boolean;
}

interface TurnstileFieldProps {
  /** Passed to Turnstile for analytics (e.g. sign-in, sign-up). */
  action?: string;
  onTokenChange?: (token: string | null) => void;
  onLoadFailed?: () => void;
  className?: string;
  disabled?: boolean;
}

const TurnstileField = forwardRef<TurnstileFieldHandle, TurnstileFieldProps>(
  function TurnstileField(
    { action = "auth", onTokenChange, onLoadFailed, className, disabled = false },
    ref,
  ) {
    const siteKey = getTurnstileSiteKey();
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const tokenRef = useRef<string | null>(null);
    const onTokenChangeRef = useRef(onTokenChange);
    const onLoadFailedRef = useRef(onLoadFailed);
    const [scriptReady, setScriptReady] = useState(false);
    const [verified, setVerified] = useState(false);
    const [failed, setFailed] = useState(false);
    const [renderKey, setRenderKey] = useState(0);

    useEffect(() => {
      onTokenChangeRef.current = onTokenChange;
    }, [onTokenChange]);

    useEffect(() => {
      onLoadFailedRef.current = onLoadFailed;
    }, [onLoadFailed]);

    const setToken = useCallback((token: string | null) => {
      tokenRef.current = token;
      setVerified(Boolean(token));
      onTokenChangeRef.current?.(token);
    }, []);

    const markFailed = useCallback(() => {
      setFailed(true);
      setVerified(false);
      setToken(null);
      onLoadFailedRef.current?.();
    }, [setToken]);

    const reset = useCallback(() => {
      setFailed(false);
      setVerified(false);
      setToken(null);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.reset(widgetIdRef.current);
        } catch {
          setRenderKey((k) => k + 1);
        }
      } else {
        setRenderKey((k) => k + 1);
      }
    }, [setToken]);

    useImperativeHandle(
      ref,
      () => ({
        reset,
        getToken: () => tokenRef.current,
        isLoadFailed: () => failed,
        isVerified: () => verified,
        waitForToken: (timeoutMs = 20_000) =>
          new Promise((resolve) => {
            if (tokenRef.current) {
              resolve(tokenRef.current);
              return;
            }
            if (failed) {
              resolve(null);
              return;
            }
            const started = Date.now();
            const id = window.setInterval(() => {
              if (tokenRef.current) {
                window.clearInterval(id);
                resolve(tokenRef.current);
                return;
              }
              if (failed || Date.now() - started >= timeoutMs) {
                window.clearInterval(id);
                resolve(null);
              }
            }, 150);
          }),
      }),
      [reset, failed, verified],
    );

    useEffect(() => {
      if (!siteKey) return;
      let cancelled = false;

      if (isTurnstileScriptReady()) {
        setScriptReady(true);
      } else {
        void loadTurnstileScript()
          .then(() => {
            if (!cancelled) setScriptReady(true);
          })
          .catch(() => {
            if (!cancelled) markFailed();
          });
      }

      const off = onTurnstileScriptReady(() => {
        if (!cancelled) setScriptReady(true);
      });

      return () => {
        cancelled = true;
        off();
      };
    }, [siteKey, markFailed]);

    useEffect(() => {
      if (!scriptReady || !siteKey || disabled || !containerRef.current || !window.turnstile) {
        return;
      }

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

      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          theme: prefersDark ? "dark" : "auto",
          // Always show Cloudflare's checkbox / tick — most reliable on mobile.
          appearance: "always",
          size: "normal",
          retry: "auto",
          "refresh-expired": "auto",
          callback: (token: string) => {
            setFailed(false);
            setToken(token);
          },
          "error-callback": () => {
            markFailed();
          },
          "expired-callback": () => {
            setVerified(false);
            setToken(null);
          },
          "timeout-callback": () => {
            markFailed();
          },
        });
      } catch {
        markFailed();
      }

      return () => {
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            /* ignore */
          }
          widgetIdRef.current = null;
        }
      };
    }, [scriptReady, siteKey, disabled, renderKey, action, setToken, markFailed]);

    if (!siteKey || disabled) return null;

    return (
      <div className={className}>
        <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {verified
            ? "✓ Security verified — you can continue"
            : "Complete the Cloudflare check below"}
        </p>
        <div
          ref={containerRef}
          className="flex min-h-[65px] w-full items-center justify-center overflow-visible rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-2 dark:border-zinc-700/60 dark:bg-zinc-900/40"
        />
        {failed && (
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
            Security check failed. Turn off ad-blocker, use{" "}
            <strong>trendsmart.pk</strong>, then{" "}
            <button
              type="button"
              onClick={() => {
                setFailed(false);
                setRenderKey((k) => k + 1);
              }}
              className="font-semibold underline underline-offset-2"
            >
              retry
            </button>
            .
          </p>
        )}
        {!failed && !verified && !scriptReady && (
          <p className="mt-1 text-[11px] text-zinc-400">Loading security check…</p>
        )}
      </div>
    );
  },
);

export default TurnstileField;
