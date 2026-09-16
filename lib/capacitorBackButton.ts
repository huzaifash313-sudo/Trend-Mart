"use client";

/* -------------------------------------------------------------------------- */
/*  Android hardware back button — navigate web history instead of exiting.    */
/*  No-op on the website (Capacitor.isNativePlatform() is false there).        */
/* -------------------------------------------------------------------------- */

let wired = false;

export async function wireCapacitorBackButton(): Promise<void> {
  if (wired || typeof window === "undefined") return;
  wired = true;

  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    const { App } = await import("@capacitor/app");
    App.addListener("backButton", () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        void App.exitApp();
      }
    });
  } catch {
    // Capacitor not available (web build) — nothing to wire.
  }
}
