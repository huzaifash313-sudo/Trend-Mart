"use client";

import Script from "next/script";
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

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

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
    onTurnstileLoad?: () => void;
  }
}

export interface TurnstileFieldHandle {
  reset: () => void;
  getToken: () => string | null;
  waitForToken: (timeoutMs?: number) => Promise<string | null>;
  /** True when the Cloudflare script failed to load (ad-blocker, CORP, wrong domain). */
  isLoadFailed: () => boolean;
}

interface TurnstileFieldProps {
  onTokenChange?: (token: string | null) => void;
  onLoadFailed?: () => void;
  className?: string;
  disabled?: boolean;
}

const TurnstileField = forwardRef<TurnstileFieldHandle, TurnstileFieldProps>(
  function TurnstileField({ onTokenChange, onLoadFailed, className, disabled = false }, ref) {
    const siteKey = getTurnstileSiteKey();
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const tokenRef = useRef<string | null>(null);
    const onTokenChangeRef = useRef(onTokenChange);
    const onLoadFailedRef = useRef(onLoadFailed);
    const [scriptReady, setScriptReady] = useState(false);
    const [widgetReady, setWidgetReady] = useState(false);
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
      onTokenChangeRef.current?.(token);
    }, []);

    const markFailed = useCallback(() => {
      setFailed(true);
      setToken(null);
      onLoadFailedRef.current?.();
    }, [setToken]);

    const reset = useCallback(() => {
      setToken(null);
      setFailed(false);
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
        waitForToken: (timeoutMs = 12_000) =>
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
      [reset, failed],
    );

    const renderWidget = useCallback(() => {
      if (!siteKey || disabled || !containerRef.current || !window.turnstile) return;

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
          theme: prefersDark ? "dark" : "auto",
          appearance: "interaction-only",
          size: "flexible",
          callback: (token) => {
            setFailed(false);
            setToken(token);
            setWidgetReady(true);
          },
          "error-callback": () => {
            markFailed();
          },
          "expired-callback": () => {
            setToken(null);
          },
          "timeout-callback": () => {
            markFailed();
          },
        });
        setWidgetReady(true);
      } catch {
        markFailed();
      }
    }, [siteKey, disabled, setToken, markFailed]);

    useEffect(() => {
      if (!scriptReady || !siteKey || disabled) return;
      renderWidget();
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
    }, [scriptReady, siteKey, disabled, renderKey, renderWidget]);

    if (!siteKey || disabled) return null;

    return (
      <div className={className}>
        <Script
          id="cf-turnstile-script"
          src={SCRIPT_SRC}
          strategy="afterInteractive"
          onLoad={() => {
            setScriptReady(true);
            setFailed(false);
          }}
          onError={() => {
            markFailed();
          }}
        />
        <div ref={containerRef} className="min-h-[1px] overflow-hidden" />
        {failed && (
          <p className="mt-1.5 text-xs text-amber-800 dark:text-amber-200">
            Security check blocked. Disable ad-blocker, open{" "}
            <strong>trendsmart.pk</strong> (not preview URL), add{" "}
            <strong>www.trendsmart.pk</strong> in Cloudflare Turnstile hostnames, then{" "}
            <button
              type="button"
              onClick={() => {
                setFailed(false);
                setScriptReady(false);
                setWidgetReady(false);
                setRenderKey((k) => k + 1);
                reset();
              }}
              className="font-semibold underline underline-offset-2"
            >
              retry
            </button>
            .
          </p>
        )}
        {!failed && !widgetReady && scriptReady && (
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Checking security…</p>
        )}
        {!failed && !scriptReady && (
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Loading security…</p>
        )}
      </div>
    );
  },
);

export default TurnstileField;
