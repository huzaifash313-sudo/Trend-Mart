/* -------------------------------------------------------------------------- */
/*  TrendMart — Web Push helpers                                              */
/*  Full VAPID send needs optional `web-push` package. Until installed,       */
/*  callers no-op safely; in-tab / permission notifications still work via    */
/*  NotificationListener (Notification API — free, no npm package).           */
/* -------------------------------------------------------------------------- */

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export function isWebPushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Best-effort VAPID push. Returns zeros when web-push / keys are unavailable. */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (!isWebPushConfigured()) return { sent: 0, failed: 0 };

  const admin = getSupabaseAdminClient();
  if (!admin) return { sent: 0, failed: 0 };

  let webpush: typeof import("web-push") | null = null;
  try {
    webpush = await import("web-push");
  } catch {
    console.warn(
      "[webPush] Install `web-push` to enable out-of-browser push. In-app notifications still work.",
    );
    return { sent: 0, failed: 0 };
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
  const privateKey = process.env.VAPID_PRIVATE_KEY!;
  const subject = process.env.VAPID_SUBJECT || "mailto:support@trendmart.local";
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const { data: rows } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!rows?.length) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/",
    tag: payload.tag || "trendmart",
  });

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush!.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          body,
        );
        sent += 1;
      } catch (err: unknown) {
        failed += 1;
        const status =
          err && typeof err === "object" && "statusCode" in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 0;
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", row.id);
        }
      }
    }),
  );

  return { sent, failed };
}
