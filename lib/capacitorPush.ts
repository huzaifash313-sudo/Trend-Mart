"use client";

/* -------------------------------------------------------------------------- */
/*  Native (FCM) push registration for the Android app.                        */
/*  No-op on the website — Web Push (lib/pushClient.ts) handles that there.    */
/* -------------------------------------------------------------------------- */

let wired = false;

export async function registerCapacitorPush(): Promise<void> {
  if (wired || typeof window === "undefined") return;
  wired = true;

  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    const { PushNotifications } = await import("@capacitor/push-notifications");

    const permStatus = await PushNotifications.checkPermissions();
    let granted = permStatus.receive === "granted";
    if (!granted && permStatus.receive !== "denied") {
      const req = await PushNotifications.requestPermissions();
      granted = req.receive === "granted";
    }
    if (!granted) return;

    PushNotifications.addListener("registration", (token) => {
      void fetch("/api/push/device-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token: token.value, platform: "android" }),
      }).catch(() => undefined);
    });

    PushNotifications.addListener("registrationError", () => {
      /* best-effort — user can retry by reopening the app */
    });

    await PushNotifications.register();
  } catch {
    // Capacitor not available (web build) — nothing to wire.
  }
}
