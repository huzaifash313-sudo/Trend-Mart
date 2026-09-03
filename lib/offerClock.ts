"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Shared offer/clock ticker                                      */
/*                                                                             */
/*  Dozens of shop cards each used to run their own setInterval for offer      */
/*  rotation and countdown timers (hundreds of live intervals on the homepage). */
/*  This module provides ONE global 1-second clock shared by every card via    */
/*  useSyncExternalStore, so there is exactly a single interval app-wide.       */
/*  Pauses while the tab is hidden so backgrounded phones don't burn CPU.      */
/* -------------------------------------------------------------------------- */

import { useSyncExternalStore } from "react";

let now = Date.now();
const subscribers = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let visibilityBound = false;

function tick() {
  now = Date.now();
  for (const sub of subscribers) sub();
}

function stopTimer() {
  if (timer == null) return;
  clearInterval(timer);
  timer = null;
}

function ensureTicking() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    stopTimer();
    return;
  }
  if (timer != null) return;
  timer = setInterval(tick, 1000);
}

function bindVisibility() {
  if (visibilityBound || typeof document === "undefined") return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      stopTimer();
      return;
    }
    if (subscribers.size > 0) {
      tick();
      ensureTicking();
    }
  });
}

function subscribe(callback: () => void): () => void {
  bindVisibility();
  subscribers.add(callback);
  ensureTicking();
  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0) stopTimer();
  };
}

function getSnapshot(): number {
  return now;
}

/** Returns the current time, re-rendering subscribers once per second. */
export function useOfferClock(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
