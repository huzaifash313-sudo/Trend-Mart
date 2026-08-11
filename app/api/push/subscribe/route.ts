import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildSafeErrorResponse } from "@/lib/responseSanitizer";

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

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: request.headers.get("user-agent")?.slice(0, 240) || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );

    if (error) {
      return NextResponse.json(
        buildSafeErrorResponse(500, "Could not save push subscription."),
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch {
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

    let query = supabase.from("push_subscriptions").delete().eq("user_id", user.id);
    if (endpoint) {
      query = query.eq("endpoint", endpoint);
    }

    const { error } = await query;
    if (error) {
      return NextResponse.json(
        buildSafeErrorResponse(500, "Could not remove push subscription."),
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(buildSafeErrorResponse(500, "Unsubscribe failed."), {
      status: 500,
    });
  }
}
