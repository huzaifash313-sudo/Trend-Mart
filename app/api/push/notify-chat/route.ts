import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/webPush";
import { buildSafeErrorResponse } from "@/lib/responseSanitizer";
import { checkRateLimit, RATE_LIMITS, buildRateLimitHeaders } from "@/lib/rateLimiter";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/push/notify-chat
 * Sender notifies the other party of a new chat message (background OS push).
 * Skipped when recipient has no push subscription.
 */
export async function POST(request: NextRequest) {
  try {
    const rate = checkRateLimit(request, RATE_LIMITS.DEFAULT);
    if (!rate.allowed) {
      return NextResponse.json(buildSafeErrorResponse(429, rate.message || "Too many requests."), {
        status: 429,
        headers: buildRateLimitHeaders(rate),
      });
    }

    const body = (await request.json()) as {
      conversationId?: string;
      preview?: string;
    };

    const conversationId =
      typeof body.conversationId === "string" && UUID_RE.test(body.conversationId.trim())
        ? body.conversationId.trim()
        : "";
    if (!conversationId) {
      return NextResponse.json(buildSafeErrorResponse(400, "Missing conversation."), {
        status: 400,
      });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(buildSafeErrorResponse(401, "Sign in required."), { status: 401 });
    }

    const admin = getSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ success: true, sent: 0 });
    }

    const { data: conv } = await admin
      .from("conversations")
      .select("id, shop_id, customer_user_id, customer_name")
      .eq("id", conversationId)
      .maybeSingle();

    if (!conv) {
      return NextResponse.json(buildSafeErrorResponse(404, "Chat not found."), { status: 404 });
    }

    const { data: shop } = await admin
      .from("shops")
      .select("id, owner_id, name")
      .eq("id", conv.shop_id)
      .maybeSingle();

    if (!shop?.owner_id) {
      return NextResponse.json({ success: true, sent: 0 });
    }

    const isCustomer = conv.customer_user_id === user.id;
    const isMerchant = shop.owner_id === user.id;
    if (!isCustomer && !isMerchant) {
      return NextResponse.json(buildSafeErrorResponse(403, "Not a chat participant."), {
        status: 403,
      });
    }

    const preview =
      typeof body.preview === "string"
        ? body.preview.replace(/\s+/g, " ").trim().slice(0, 120)
        : "New message";

    let recipientId: string | null = null;
    let title = "New message";
    let url = "/";

    if (isCustomer) {
      recipientId = shop.owner_id;
      title = `Message from ${conv.customer_name?.trim() || "a customer"}`;
      url = `/dashboard/inquiries?c=${conversationId}`;
    } else {
      recipientId = conv.customer_user_id;
      title = `Reply from ${shop.name?.trim() || "shop"}`;
      url = `/account/inquiries?c=${conversationId}`;
    }

    if (!recipientId || recipientId === user.id) {
      return NextResponse.json({ success: true, sent: 0 });
    }

    const result = await sendPushToUser(recipientId, {
      title,
      body: preview || "New message",
      url,
      tag: `tm-chat-${conversationId}`,
      renotify: true,
      conversationId,
    });

    return NextResponse.json({ success: true, sent: result.sent });
  } catch (err) {
    console.error("[notify-chat]", err);
    return NextResponse.json(buildSafeErrorResponse(500, "Push failed."), { status: 500 });
  }
}
