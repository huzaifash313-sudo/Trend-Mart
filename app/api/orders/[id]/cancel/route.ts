/* -------------------------------------------------------------------------- */
/*  POST /api/orders/[id]/cancel — customer cancels a Pending order            */
/* -------------------------------------------------------------------------- */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadOrderForCustomer } from "@/lib/orderOwnership";
import { isValidUUID } from "@/lib/sanitization";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
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
  if (order.status !== "Pending") {
    return NextResponse.json(
      {
        success: false,
        error: "Only pending orders can be cancelled. Contact the shop if it is already being prepared.",
      },
      { status: 409 },
    );
  }

  const { data: updatedRaw, error: updateErr } = await admin
    .from("orders")
    .update({ status: "Cancelled" } as never)
    .eq("id", orderId)
    .select("id, status, updated_at")
    .maybeSingle();

  if (updateErr || !updatedRaw) {
    return NextResponse.json(
      { success: false, error: "Could not cancel the order. Please try again." },
      { status: 500 },
    );
  }

  const updated = updatedRaw as { id: string; status: string; updated_at: string };

  return NextResponse.json({
    success: true,
    order: { id: updated.id, status: updated.status, updated_at: updated.updated_at },
  });
}
