import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildSafeErrorResponse } from "@/lib/responseSanitizer";
import { logError } from "@/services/errorService";

interface DeviceTokenBody {
  token?: string;
  platform?: string;
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

    const body = (await request.json()) as DeviceTokenBody;
    const token = body.token?.trim();
    const platform = body.platform === "ios" ? "ios" : "android";
    if (!token) {
      return NextResponse.json(buildSafeErrorResponse(400, "Invalid device token."), {
        status: 400,
      });
    }

    const row = {
      user_id: user.id,
      token,
      platform,
      updated_at: new Date().toISOString(),
    };

    const admin = getSupabaseAdminClient();
    const db = admin ?? supabase;

    const { error } = await db.from("device_push_tokens").upsert(row, {
      onConflict: "token",
    });

    if (error) {
      logError(error, {
        module: "push.deviceToken",
        userId: user.id,
        meta: { usedAdmin: Boolean(admin) },
      });
      return NextResponse.json(
        buildSafeErrorResponse(500, "Could not save device token."),
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError(err, { module: "push.deviceToken" });
    return NextResponse.json(buildSafeErrorResponse(500, "Register failed."), {
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

    const body = (await request.json().catch(() => ({}))) as { token?: string };
    const token = body.token?.trim();

    const admin = getSupabaseAdminClient();
    const db = admin ?? supabase;

    let query = db.from("device_push_tokens").delete().eq("user_id", user.id);
    if (token) {
      query = query.eq("token", token);
    }

    const { error } = await query;
    if (error) {
      logError(error, {
        module: "push.deviceToken.delete",
        userId: user.id,
        meta: { usedAdmin: Boolean(admin) },
      });
      return NextResponse.json(
        buildSafeErrorResponse(500, "Could not remove device token."),
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError(err, { module: "push.deviceToken.delete" });
    return NextResponse.json(buildSafeErrorResponse(500, "Unregister failed."), {
      status: 500,
    });
  }
}
