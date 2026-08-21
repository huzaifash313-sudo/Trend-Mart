/* Client Web Push subscribe / notify helpers. */

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

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  const secure =
    window.location.protocol === "https:" || window.location.hostname === "localhost";
  if (!secure) return null;

  let registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    try {
      registration = await navigator.serviceWorker.register("/sw.js");
    } catch {
      return null;
    }
  }
  return navigator.serviceWorker.ready;
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

    const registration = await ensureServiceWorker();
    if (!registration) return { ok: false, reason: "failed" };

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

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      console.warn(
        `[TrendMart] push subscribe failed (${res.status}): ${bodyText}`,
      );
      return { ok: false, reason: "failed" };
    }
    try {
      localStorage.setItem("trendmart_push_subscribed", "true");
    } catch {
      /* ignore */
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

export async function unsubscribeFromPushNotifications(): Promise<
  | { ok: true }
  | { ok: false; reason: "unsupported" | "failed" }
> {
  if (!isPushClientSupported()) return { ok: false, reason: "unsupported" };

  try {
    const registration = await ensureServiceWorker();
    if (!registration) return { ok: false, reason: "failed" };

    const subscription = await registration.pushManager.getSubscription();
    const endpoint = subscription?.endpoint;
    if (subscription) {
      await subscription.unsubscribe();
    }
    if (endpoint) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      }).catch(() => undefined);
    }
    try {
      localStorage.removeItem("trendmart_push_subscribed");
    } catch {
      /* ignore */
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
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
      body: JSON.stringify(input),
    });
  } catch {
    /* best-effort */
  }
}
