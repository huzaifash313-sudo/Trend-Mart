import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildSafeErrorResponse } from "@/lib/responseSanitizer";
import { logError } from "@/services/errorService";

interface SubscribeBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(buildSafeErrorResponse(401, "Sign in required."), {
        status: 401,
      });
    }

    const body = (await request.json()) as SubscribeBody;
    const endpoint = body.endpoint?.trim();
    const p256dh = body.keys?.p256dh?.trim();
    const auth = body.keys?.auth?.trim();
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(buildSafeErrorResponse(400, "Invalid subscription."), {
        status: 400,
      });
    }

    const row = {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: request.headers.get("user-agent")?.slice(0, 240) || null,
      updated_at: new Date().toISOString(),
    };

    // Prefer service-role upsert: survives missing table GRANTs and reassigns a
    // browser endpoint when a different account signs in on the same device.
    const admin = getSupabaseAdminClient();
    const db = admin ?? supabase;

    const { error } = await db.from("push_subscriptions").upsert(row, {
      onConflict: "endpoint",
    });

    if (error) {
      logError(error, {
        module: "push.subscribe",
        userId: user.id,
        meta: { endpoint, usedAdmin: Boolean(admin) },
      });

      const hint =
        error.code === "42P01"
          ? "Push subscriptions table is missing — run supabase/PUSH_SUBSCRIPTIONS_SETUP.sql in Supabase."
          : "Could not save push subscription.";

      return NextResponse.json(buildSafeErrorResponse(500, hint), { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError(err, { module: "push.subscribe" });
    return NextResponse.json(buildSafeErrorResponse(500, "Subscribe failed."), {
      status: 500,
    });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(buildSafeErrorResponse(401, "Sign in required."), {
        status: 401,
      });
    }

    const body = (await request.json().catch(() => ({}))) as { endpoint?: string };
    const endpoint = body.endpoint?.trim();

    const admin = getSupabaseAdminClient();
    const db = admin ?? supabase;

    let query = db.from("push_subscriptions").delete().eq("user_id", user.id);
    if (endpoint) {
      query = query.eq("endpoint", endpoint);
    }

    const { error } = await query;
    if (error) {
      logError(error, {
        module: "push.unsubscribe",
        userId: user.id,
        meta: { endpoint, usedAdmin: Boolean(admin) },
      });
      return NextResponse.json(
        buildSafeErrorResponse(500, "Could not remove push subscription."),
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError(err, { module: "push.unsubscribe" });
    return NextResponse.json(buildSafeErrorResponse(500, "Unsubscribe failed."), {
      status: 500,
    });
  }
}
