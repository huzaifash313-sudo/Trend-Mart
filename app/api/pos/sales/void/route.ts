/* -------------------------------------------------------------------------- */
/*  Void a counter sale — POST /api/pos/sales/void                             */
/*                                                                              */
/*  Voiding runs server-side so the audit row is written with the service role  */
/*  in the same request. A client-side void could simply skip the audit write,  */
/*  which would make the trail untrustworthy for exactly the action that most   */
/*  needs it.                                                                   */
/* -------------------------------------------------------------------------- */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidUUID } from "@/lib/sanitization";
import { STAFF_COOKIE, verifyStaffSession } from "@/lib/pos/staffAuth";
import { logPosAudit } from "@/lib/pos/posAudit";

export const runtime = "nodejs";

interface VoidBody {
  shopId?: string | null;
  orderId?: string | null;
  reason?: string | null;
}

export async function POST(request: Request) {
  let body: VoidBody;
  try {
    body = (await request.json()) as VoidBody;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }

  const shopId = (body.shopId || "").trim();
  const orderId = (body.orderId || "").trim();
  if (!isValidUUID(shopId) || !isValidUUID(orderId)) {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
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
      { success: false, error: "Server is not configured." },
      { status: 500 },
    );
  }

  const { data: shop } = await admin
    .from("shops")
    .select("id, owner_id")
    .eq("id", shopId)
    .maybeSingle();
  if (!shop || (shop as { owner_id?: string }).owner_id !== user.id) {
    return NextResponse.json({ success: false, error: "Not your store." }, { status: 403 });
  }

  const staffSession = verifyStaffSession((await cookies()).get(STAFF_COOKIE)?.value);
  const activeStaff =
    staffSession && staffSession.shopId === shopId ? staffSession : null;

  const { data: existing } = await admin
    .from("orders")
    .select("id, shop_id, status, voided_at, total_amount, notes")
    .eq("id", orderId)
    .eq("shop_id", shopId)
    .maybeSingle();

  const order = existing as
    | { id: string; status?: string; voided_at?: string | null; total_amount?: number; notes?: string }
    | null;

  if (!order) {
    return NextResponse.json({ success: false, error: "Bill not found." }, { status: 404 });
  }
  if (order.voided_at || order.status === "Cancelled") {
    return NextResponse.json(
      { success: false, error: "Already voided / cancelled." },
      { status: 409 },
    );
  }

  const patch: Record<string, unknown> = {
    status: "Cancelled",
    voided_at: new Date().toISOString(),
    refunded_amount: Number(order.total_amount) || 0,
    notes: `${order.notes || ""} [VOID]`.trim(),
  };

  let { data: updated, error } = await admin
    .from("orders")
    .update(patch as never)
    .eq("id", orderId)
    .eq("shop_id", shopId)
    .select("*")
    .single();

  if (error) {
    // Older DBs may lack the void columns — still cancel the bill.
    delete patch.voided_at;
    delete patch.refunded_amount;
    ({ data: updated, error } = await admin
      .from("orders")
      .update(patch as never)
      .eq("id", orderId)
      .eq("shop_id", shopId)
      .select("*")
      .single());
  }

  if (error || !updated) {
    return NextResponse.json({ success: false, error: "Could not void the bill." }, { status: 500 });
  }

  await logPosAudit({
    shopId,
    staff: activeStaff ? { staffId: activeStaff.staffId, name: activeStaff.name } : null,
    eventType: "sale.void",
    severity: "critical",
    orderId,
    metadata: {
      refunded: Number(order.total_amount) || 0,
      reason: (body.reason || "").toString().slice(0, 200),
    },
  });

  return NextResponse.json({ success: true, order: updated });
}
