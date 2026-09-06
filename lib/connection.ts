"use client";

/**
 * TrendsMart connection state — single source of truth for "am I offline?"
 *
 * Sources (in priority order):
 *  1. Browser `online` / `offline` events (navigator.onLine).
 *  2. Service-worker broadcasts (`tm-conn`) when a page had to be served from
 *     cache because the network actually failed — navigator.onLine can stay
 *     `true` when the device has WiFi but no internet, so the SW's real
 *     fetch result is the more truthful signal.
 *
 * Exposes a `useConnection()` React hook plus a tiny subscribe API. State is
 * module-global so the splash, the home page and the status pill all agree.
 */

import { useSyncExternalStore } from "react";

export type ConnectionState = "online" | "offline";

let state: ConnectionState = "online";
let initialized = false;
const listeners = new Set<() => void>();

function detectFromNavigator(): ConnectionState {
  try {
    return typeof navigator !== "undefined" && navigator.onLine === false
      ? "offline"
      : "online";
  } catch {
    return "online";
  }
}

function emit(next: ConnectionState) {
  if (state === next) return;
  state = next;
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<{ state: ConnectionState }>("tm-conn-change", {
          detail: { state: next },
        }),
      );
    }
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

/** Imperative setter — e.g. the offline pill probes connectivity itself and
 *  flips back to "online" as soon as the network actually responds. */
export function setConnection(next: ConnectionState) {
  emit(next);
}

function ensureInit() {
  if (initialized) return;
  initialized = true;
  if (typeof window === "undefined") return;
  state = detectFromNavigator();

  const onWindowOnline = () => emit("online");
  const onWindowOffline = () => emit("offline");
  const onSwMessage = (ev: MessageEvent) => {
    const data = ev.data as { type?: string; state?: string } | null;
    if (data && data.type === "tm-conn") {
      emit(data.state === "offline" ? "offline" : "online");
    }
  };

  window.addEventListener("online", onWindowOnline);
  window.addEventListener("offline", onWindowOffline);
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", onSwMessage);
  }
}

/* Eagerly seed on the client so the very first render is correct (module
   evaluates before React hydrates). On the server this stays "online". */
if (typeof window !== "undefined") {
  state = detectFromNavigator();
}

export function getConnection(): ConnectionState {
  ensureInit();
  return state;
}

export function subscribeConnection(cb: () => void): () => void {
  ensureInit();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const SERVER_SNAPSHOT: ConnectionState = "online";

/** React hook — returns "online" | "offline", updates live. */
export function useConnection(): ConnectionState {
  return useSyncExternalStore(
    subscribeConnection,
    getConnection,
    () => SERVER_SNAPSHOT,
  );
}
