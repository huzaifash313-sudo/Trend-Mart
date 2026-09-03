import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { settlePaidOrder } from "@/lib/billing/settlePayment";
import { buildSafeErrorResponse } from "@/lib/responseSanitizer";
import { requireAdminUser } from "@/lib/requireAdmin";

/**
 * POST /api/billing/mark-paid
 * Super-admin marks a manual payment order as paid (bank transfer / JazzCash number).
 */
export async function POST(request: NextRequest) {
  try {
    const adminCheck = await requireAdminUser();
    if (!adminCheck.ok) {
      return NextResponse.json(buildSafeErrorResponse(adminCheck.status, adminCheck.error), {
        status: adminCheck.status,
      });
    }

    const body = (await request.json()) as { orderId?: string };
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    if (!orderId) {
      return NextResponse.json(buildSafeErrorResponse(400, "Missing order."), { status: 400 });
    }

    const ok = await settlePaidOrder(orderId, `manual_admin_${Date.now()}`);
    return NextResponse.json({ success: ok });
  } catch (err) {
    console.error("[billing/mark-paid]", err);
    return NextResponse.json(buildSafeErrorResponse(500, "Failed."), { status: 500 });
  }
}

/** Merchant self-check: confirm their own order status. */
export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get("orderId") || "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(buildSafeErrorResponse(401, "Sign in required."), { status: 401 });
  }
  if (!orderId) {
    return NextResponse.json(buildSafeErrorResponse(400, "Missing order."), { status: 400 });
  }

  const admin = getSupabaseAdminClient() as unknown as { from: (t: string) => any } | null;
  const client = admin ?? (supabase as unknown as { from: (t: string) => any });
  const { data } = await client
    .from("payment_orders")
    .select("id, status, amount_pkr, tokens_credit, kind, paid_at")
    .eq("id", orderId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ success: true, order: data });
}
