import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sanitizeChatString } from "@/lib/ai/sanitize";
import { buildSafeErrorResponse } from "@/lib/responseSanitizer";

interface FeedbackBody {
  sessionId?: string;
  feedback?: "helpful" | "not_helpful";
  intent?: string;
  query?: string;
  shopId?: string;
}

/** Persist TrendBot thumbs feedback onto latest matching chat_logs row. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FeedbackBody;
    const feedback = body.feedback;
    if (feedback !== "helpful" && feedback !== "not_helpful") {
      return NextResponse.json(buildSafeErrorResponse(400, "Invalid feedback."), { status: 400 });
    }

    const sessionId = body.sessionId ? sanitizeChatString(body.sessionId, 50) : "";
    const shopId = body.shopId ? sanitizeChatString(body.shopId, 100) : null;
    if (!sessionId && !shopId) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const admin = getSupabaseAdminClient();
    const supabase = admin ?? (await createClient());

    let query = supabase
      .from("chat_logs")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1);

    if (sessionId) query = query.eq("session_id", sessionId);
    if (shopId) query = query.eq("shop_id", shopId);

    const { data: rows } = await query;
    const id = rows?.[0]?.id;
    if (!id) {
      // No prior log (e.g. guest global bot) — local learning still works; skip DB.
      return NextResponse.json({ success: true, updated: false });
    }

    const { error } = await supabase.from("chat_logs").update({ feedback }).eq("id", id);
    if (error) {
      return NextResponse.json(buildSafeErrorResponse(500, "Could not save feedback."), {
        status: 500,
      });
    }

    return NextResponse.json({ success: true, updated: true });
  } catch {
    return NextResponse.json(buildSafeErrorResponse(500, "Could not save feedback."), {
      status: 500,
    });
  }
}
