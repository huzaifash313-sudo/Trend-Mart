/* -------------------------------------------------------------------------- */
/*  POST /api/orders/[id]/whatsapp — store message + mark WhatsApp sent        */
/* -------------------------------------------------------------------------- */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadOrderForCustomer } from "@/lib/orderOwnership";
import { isValidUUID } from "@/lib/sanitization";

export const runtime = "nodejs";

const MAX_MESSAGE_LEN = 4000;

function sanitizeMessage(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .slice(0, MAX_MESSAGE_LEN);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await context.params;
  if (!isValidUUID(orderId)) {
    return NextResponse.json({ success: false, error: "Invalid order id." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Sign in required." }, { status: 401 });
  }

  let body: { message?: unknown; sent?: unknown };
  try {
    body = (await request.json()) as { message?: unknown; sent?: unknown };
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const message = body.message !== undefined ? sanitizeMessage(body.message) : undefined;
  const markSent = body.sent === true;

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "Service temporarily unavailable." },
      { status: 503 },
    );
  }

  const order = await loadOrderForCustomer(admin, orderId, user.id);
  if (!order) {
    return NextResponse.json({ success: false, error: "Order not found." }, { status: 404 });
  }
  if (order.status === "Cancelled") {
    return NextResponse.json({ success: false, error: "This order was cancelled." }, { status: 409 });
  }

  const patch: Record<string, unknown> = {};
  if (message !== undefined && message.length > 0) {
    patch.whatsapp_message = message;
  }
  if (markSent) {
    patch.whatsapp_sent_at = new Date().toISOString();
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ success: false, error: "Nothing to update." }, { status: 400 });
  }

  const { data: updatedRaw, error: updateErr } = await admin
    .from("orders")
    .update(patch as never)
    .eq("id", orderId)
    .select("id, whatsapp_sent_at, whatsapp_message")
    .maybeSingle();

  if (updateErr || !updatedRaw) {
    return NextResponse.json(
      { success: false, error: "Could not update WhatsApp status." },
      { status: 500 },
    );
  }

  const updated = updatedRaw as {
    id: string;
    whatsapp_sent_at: string | null;
    whatsapp_message: string | null;
  };

  return NextResponse.json({
    success: true,
    whatsappSentAt: updated.whatsapp_sent_at,
    whatsappMessage: updated.whatsapp_message,
  });
}
