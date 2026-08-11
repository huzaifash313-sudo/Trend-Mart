import { NextResponse } from "next/server";
import { isWebPushConfigured } from "@/lib/webPush";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Non-secret health check for the push stack.
 * Used by Settings → Notifications to show what's missing.
 */
export async function GET() {
  const vapid = isWebPushConfigured();
  const admin = !!getSupabaseAdminClient();
  return NextResponse.json({
    ready: vapid && admin,
    vapidConfigured: vapid,
    adminConfigured: admin,
    subjectSet: !!process.env.VAPID_SUBJECT,
  });
}
