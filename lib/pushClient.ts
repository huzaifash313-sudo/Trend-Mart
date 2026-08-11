/* -------------------------------------------------------------------------- */
/*  Client-side Web Push subscribe helper                                     */
/*  Best-effort: no-ops when VAPID public key is missing or permission denied */
/* -------------------------------------------------------------------------- */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

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

export function isPushClientSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!VAPID_PUBLIC_KEY
  );
}

export async function getPushPermissionState(): Promise<NotificationPermission | "unsupported"> {
  if (!isPushClientSupported()) return "unsupported";
  return Notification.permission;
}

/**
 * Request permission, subscribe via service worker, and POST to /api/push/subscribe.
 */
export async function subscribeToPushNotifications(): Promise<
  | { ok: true }
  | { ok: false; reason: "unsupported" | "denied" | "failed" }
> {
  if (!isPushClientSupported()) return { ok: false, reason: "unsupported" };

  try {
    const permission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();

    if (permission !== "granted") return { ok: false, reason: "denied" };

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    const raw = subscription.toJSON();
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: raw.endpoint,
        keys: raw.keys,
      }),
    });

    if (!res.ok) return { ok: false, reason: "failed" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** Fire-and-forget order push notify (never throws). */
export async function notifyOrderPush(input: {
  orderId: string;
  shopId: string;
  status: string;
}): Promise<void> {
  try {
    await fetch("/api/push/notify-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    /* best-effort */
  }
}
