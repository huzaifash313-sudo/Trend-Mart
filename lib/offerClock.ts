"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Shared offer/clock ticker                                      */
/*                                                                             */
/*  Dozens of shop cards each used to run their own setInterval for offer      */
/*  rotation and countdown timers (hundreds of live intervals on the homepage). */
/*  This module provides ONE global 1-second clock shared by every card via    */
/*  useSyncExternalStore, so there is exactly a single interval app-wide.       */
/* -------------------------------------------------------------------------- */

import { useSyncExternalStore } from "react";

let now = Date.now();
const subscribers = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function ensureTicking() {
  if (timer != null) return;
  timer = setInterval(() => {
    now = Date.now();
    for (const sub of subscribers) sub();
  }, 1000);
}

function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  ensureTicking();
  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0 && timer != null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  return now;
}

/** Returns the current time, re-rendering subscribers once per second. */
export function useOfferClock(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
