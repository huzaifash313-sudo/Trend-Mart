/* Client Web Push subscribe / notify helpers — synced with PushManager + server. */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const SUB_FLAG = "trendsmart_push_subscribed";
/** Permanent / daily cap for the one-shot “alerts ready” OS toast. */
const CONFIRM_FLAG = "trendsmart_push_confirm_v2";
const LAST_SYNC_AT = "trendsmart_push_last_sync_at";
/** Silent server re-sync at most every 12h (plus explicit Enable / Resync). */
const SYNC_MIN_INTERVAL_MS = 12 * 60 * 60 * 1000;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export type PushFailReason =
  | "unsupported"
  | "denied"
  | "failed"
  | "auth_required"
  | "insecure"
  | "ios_needs_pwa"
  | "no_vapid";

export type PushDeviceStatus =
  | { state: "unsupported"; reason: PushFailReason; detail?: string }
  | { state: "denied" }
  | { state: "off"; permission: NotificationPermission }
  | { state: "on"; endpoint: string }
  | { state: "checking" };

export type SubscribePushOptions = {
  /**
   * Show a one-time OS confirmation that alerts work.
   * Must stay false for background sync — otherwise every tab focus spams.
   */
  confirmOs?: boolean;
  /** Force server sync even if we synced recently (Enable / Resync buttons). */
  forceSync?: boolean;
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function isSecureContextForPush(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext === true;
}

/** iOS Safari only supports Web Push inside an installed Home Screen PWA (16.4+). */
export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/i.test(ua);
  const notOther = !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return iOS && webkit && notOther;
}

export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const iosStandalone = "standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(mq || iosStandalone);
}

export function isPushClientSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    isSecureContextForPush() &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!VAPID_PUBLIC_KEY
  );
}

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  if (!isSecureContextForPush()) return null;

  try {
    let registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
    } else {
      // Pick up latest push handlers after deploy
      void registration.update();
    }
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

function setSubFlag(on: boolean) {
  try {
    if (on) localStorage.setItem(SUB_FLAG, "true");
    else localStorage.removeItem(SUB_FLAG);
  } catch {
    /* ignore */
  }
}

/**
 * Enable-toast is at most once per calendar day (and never on silent sync).
 * Legacy v1 flag "1" still counts as already shown forever.
 */
function hasShownPushConfirmToday(): boolean {
  try {
    const v1 = localStorage.getItem("trendsmart_push_confirm_v1");
    if (v1 === "1") return true;
    const v = localStorage.getItem(CONFIRM_FLAG);
    if (v === "1") return true;
    return v === todayKey();
  } catch {
    return true;
  }
}

function markPushConfirmShown() {
  try {
    localStorage.setItem(CONFIRM_FLAG, todayKey());
    // Migrate: stop any old v1 re-prompts after first quiet sync.
    localStorage.setItem("trendsmart_push_confirm_v1", "1");
  } catch {
    /* ignore */
  }
}

/** Close leftover “alerts ready / on” toasts so they never stick across app opens. */
async function dismissEnableToasts(registration: ServiceWorkerRegistration) {
  try {
    const notes = await registration.getNotifications({ tag: "tm-push-enabled" });
    for (const n of notes) n.close();
  } catch {
    /* ignore */
  }
}

function getLastSyncAt(): number {
  try {
    return Number(localStorage.getItem(LAST_SYNC_AT) || 0) || 0;
  } catch {
    return 0;
  }
}

function markSyncedNow() {
  try {
    localStorage.setItem(LAST_SYNC_AT, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** True when a silent background sync should be skipped (already healthy + recent). */
function shouldSkipSilentSync(): boolean {
  try {
    if (localStorage.getItem(SUB_FLAG) !== "true") return false;
    return Date.now() - getLastSyncAt() < SYNC_MIN_INTERVAL_MS;
  } catch {
    return false;
  }
}

export async function getPushPermissionState(): Promise<NotificationPermission | "unsupported"> {
  if (!("Notification" in window)) return "unsupported";
  if (!isPushClientSupported() && !(isIosSafari() && !isStandalonePwa())) {
    if (!VAPID_PUBLIC_KEY) return "unsupported";
    if (!isSecureContextForPush()) return "unsupported";
  }
  if (!isPushClientSupported()) {
    if (isIosSafari() && !isStandalonePwa()) return "unsupported";
    return "unsupported";
  }
  return Notification.permission;
}

/** Truthful status from PushManager (not localStorage alone). */
export async function getPushDeviceStatus(): Promise<PushDeviceStatus> {
  if (typeof window === "undefined") return { state: "checking" };

  if (!isSecureContextForPush()) {
    return { state: "unsupported", reason: "insecure", detail: "HTTPS required (or localhost)." };
  }
  if (!VAPID_PUBLIC_KEY) {
    return { state: "unsupported", reason: "no_vapid", detail: "Push keys not configured." };
  }
  if (isIosSafari() && !isStandalonePwa()) {
    return {
      state: "unsupported",
      reason: "ios_needs_pwa",
      detail: "iPhone/iPad: Add to Home Screen, then open TrendsMart from the icon to enable alerts.",
    };
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { state: "unsupported", reason: "unsupported", detail: "This browser does not support Web Push." };
  }

  const permission = Notification.permission;
  if (permission === "denied") return { state: "denied" };

  try {
    const registration = await ensureServiceWorker();
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    if (permission === "granted" && subscription?.endpoint) {
      setSubFlag(true);
      return { state: "on", endpoint: subscription.endpoint };
    }
    setSubFlag(false);
    return { state: "off", permission };
  } catch {
    setSubFlag(false);
    return { state: "off", permission };
  }
}

export async function subscribeToPushNotifications(
  options: SubscribePushOptions = {},
): Promise<{ ok: true } | { ok: false; reason: PushFailReason; detail?: string }> {
  const confirmOs = options.confirmOs === true;
  const forceSync = options.forceSync === true || confirmOs;

  if (!forceSync && shouldSkipSilentSync() && Notification.permission === "granted") {
    return { ok: true };
  }

  if (!isSecureContextForPush()) {
    return { ok: false, reason: "insecure", detail: "Open TrendsMart on HTTPS, then try again." };
  }
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false, reason: "no_vapid", detail: "Push is not configured on the server." };
  }
  if (isIosSafari() && !isStandalonePwa()) {
    return {
      ok: false,
      reason: "ios_needs_pwa",
      detail: "Add TrendsMart to Home Screen, open from the icon, then Enable.",
    };
  }
  if (!isPushClientSupported()) {
    return { ok: false, reason: "unsupported", detail: "Push not available on this device/browser." };
  }

  try {
    const permission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();

    if (permission !== "granted") return { ok: false, reason: "denied" };

    const registration = await ensureServiceWorker();
    if (!registration) {
      return { ok: false, reason: "failed", detail: "Service worker failed to start. Refresh and retry." };
    }

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    const raw = subscription.toJSON();
    if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) {
      return { ok: false, reason: "failed", detail: "Browser returned an incomplete subscription." };
    }

    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        endpoint: raw.endpoint,
        keys: raw.keys,
      }),
    });

    if (res.status === 401) {
      return { ok: false, reason: "auth_required", detail: "Sign in first to save alerts on this device." };
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      console.warn(`[TrendsMart] push subscribe failed (${res.status}): ${bodyText}`);
      return {
        ok: false,
        reason: "failed",
        detail: "Could not save subscription. Check connection and try again.",
      };
    }

    setSubFlag(true);
    markSyncedNow();
    await dismissEnableToasts(registration);

    // One-time / once-a-day OS proof only when user explicitly enables — never on auto-sync.
    if (confirmOs && !hasShownPushConfirmToday()) {
      try {
        await registration.showNotification("TrendsMart alerts ready", {
          body: "Ab sirf zaroori order updates aayenge — app band ho to bhi.",
          icon: "/trendsmart-mark.png?v=13",
          badge: "/trendsmart-mark.png?v=13",
          tag: "tm-push-enabled",
          data: { url: "/settings/notifications" },
        } as NotificationOptions);
      } catch {
        /* some browsers block while tab focused — still subscribed */
      }
      markPushConfirmShown();
    } else {
      // Silent sync / already confirmed today — never re-show enable spam.
      markPushConfirmShown();
    }

    return { ok: true };
  } catch (err) {
    console.warn("[TrendsMart] push subscribe error", err);
    return { ok: false, reason: "failed", detail: "Enable failed. Refresh the page and try again." };
  }
}

export async function unsubscribeFromPushNotifications(): Promise<
  { ok: true } | { ok: false; reason: PushFailReason; detail?: string }
> {
  if (!isPushClientSupported() && !("serviceWorker" in navigator)) {
    return { ok: false, reason: "unsupported" };
  }

  try {
    const registration = await ensureServiceWorker();
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    const endpoint = subscription?.endpoint;
    if (subscription) {
      await subscription.unsubscribe();
    }
    if (endpoint) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ endpoint }),
      }).catch(() => undefined);
    }
    setSubFlag(false);
    return { ok: true };
  } catch {
    setSubFlag(false);
    return { ok: false, reason: "failed" };
  }
}

/** Re-sync browser subscription → server when permission already granted (silent). */
export async function syncPushSubscriptionIfGranted(force = false): Promise<boolean> {
  const status = await getPushDeviceStatus();
  if (status.state !== "on" && status.state !== "off") return false;
  if (Notification.permission !== "granted") return false;
  const result = await subscribeToPushNotifications({
    confirmOs: false,
    forceSync: force,
  });
  return result.ok;
}

export async function notifyOrderPush(input: {
  orderId: string;
  shopId: string;
  status: string;
  event?: "new" | "status";
}): Promise<void> {
  try {
    await fetch("/api/push/notify-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(input),
    });
  } catch {
    /* best-effort */
  }
}

export function pushFailMessage(reason: PushFailReason, detail?: string): string {
  if (detail) return detail;
  switch (reason) {
    case "denied":
      return "Permission blocked. Browser settings → Site settings → Notifications → Allow.";
    case "auth_required":
      return "Sign in required to enable push on this device.";
    case "ios_needs_pwa":
      return "iPhone: Share → Add to Home Screen, then open the app icon and Enable.";
    case "insecure":
      return "Open the HTTPS site (not a local IP) to enable notifications.";
    case "no_vapid":
      return "Push is not configured yet. Contact support.";
    case "unsupported":
      return "This browser does not support push notifications.";
    default:
      return "Could not enable push. Refresh and try again.";
  }
}
