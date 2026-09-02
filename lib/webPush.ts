import webPush from "web-push";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getVapidSubject } from "@/lib/appUrl";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  /** When true, OS re-alerts even if same tag (use for real order events). */
  renotify?: boolean;
  /** Chat conversation — SW can suppress if user is viewing that thread. */
  conversationId?: string;
}

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function isWebPushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

const PUSH_SEND_TIMEOUT_MS = 10_000;

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (!isWebPushConfigured()) return { sent: 0, failed: 0 };

  const admin = getSupabaseAdminClient();
  if (!admin) return { sent: 0, failed: 0 };

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
  const privateKey = process.env.VAPID_PRIVATE_KEY!;
  const subject = getVapidSubject();

  webPush.setVapidDetails(subject, publicKey, privateKey);

  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error || !data) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const body = JSON.stringify(payload);

  await Promise.all(
    ((data as PushSubscriptionRow[]) ?? []).map(async (subscription) => {
      try {
        // Per-send timeout so a hung push endpoint never stalls the whole batch.
        await Promise.race([
          webPush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            body,
          ),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("web-push send timeout")),
              PUSH_SEND_TIMEOUT_MS,
            ),
          ),
        ]);
        sent += 1;
      } catch (err) {
        failed += 1;
        const statusCode =
          typeof err === "object" && err !== null && "statusCode" in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("id", subscription.id);
        }
      }
    }),
  );

  return { sent, failed };
}
