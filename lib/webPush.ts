/* -------------------------------------------------------------------------- */
/*  TrendMart — Web Push helpers                                              */
/*  Out-of-browser VAPID send is optional. Without the `web-push` package we  */
/*  no-op safely; in-app / Notification API alerts still work via             */
/*  NotificationListener.                                                     */
/* -------------------------------------------------------------------------- */

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export function isWebPushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/**
 * Best-effort VAPID push.
 * Returns zeros until `web-push` is added as a dependency (intentionally not
 * required for deploy — avoids Turbopack/CI module-not-found failures).
 */
export async function sendPushToUser(
  _userId: string,
  _payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (!isWebPushConfigured()) return { sent: 0, failed: 0 };

  // Keys may be present, but the optional npm package is not installed.
  // Keep this a pure no-op so production builds stay green.
  console.warn(
    "[webPush] VAPID keys present but `web-push` package is not installed — skipping OS push. In-app notifications still work.",
  );
  return { sent: 0, failed: 0 };
}
