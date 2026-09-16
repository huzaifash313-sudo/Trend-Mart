import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PushPayload } from "@/lib/webPush";

let cachedApp: import("firebase-admin/app").App | null | undefined;

export function isFcmConfigured(): boolean {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
}

async function getFcmApp(): Promise<import("firebase-admin/app").App | null> {
  if (cachedApp !== undefined) return cachedApp;

  if (!isFcmConfigured()) {
    cachedApp = null;
    return null;
  }

  try {
    const { initializeApp, getApps, cert } = await import("firebase-admin/app");
    const raw = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!, "base64").toString(
      "utf-8",
    );
    const serviceAccount = JSON.parse(raw);
    cachedApp =
      getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });
  } catch {
    cachedApp = null;
  }
  return cachedApp;
}

type DeviceTokenRow = { id: string; token: string };

/** Send a push to a user's registered native (Android) devices via FCM. No-ops if unconfigured. */
export async function sendFcmToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  const app = await getFcmApp();
  if (!app) return { sent: 0, failed: 0 };

  const admin = getSupabaseAdminClient();
  if (!admin) return { sent: 0, failed: 0 };

  const { data, error } = await admin
    .from("device_push_tokens")
    .select("id, token")
    .eq("user_id", userId);

  if (error || !data || data.length === 0) return { sent: 0, failed: 0 };

  const { getMessaging } = await import("firebase-admin/messaging");
  const messaging = getMessaging(app);
  const tokens = (data as DeviceTokenRow[]).map((r) => r.token);

  let sent = 0;
  let failed = 0;
  try {
    const result = await messaging.sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: {
        ...(payload.url ? { url: payload.url } : {}),
        ...(payload.tag ? { tag: payload.tag } : {}),
        ...(payload.kind ? { kind: payload.kind } : {}),
      },
      android: { priority: "high" },
    });
    sent = result.successCount;
    failed = result.failureCount;

    const staleIds: string[] = [];
    result.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code || "";
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          staleIds.push((data as DeviceTokenRow[])[i]!.id);
        }
      }
    });
    if (staleIds.length > 0) {
      await admin.from("device_push_tokens").delete().in("id", staleIds);
    }
  } catch {
    failed = tokens.length;
  }

  return { sent, failed };
}
