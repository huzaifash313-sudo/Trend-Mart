import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { settlePaidOrder } from "@/lib/billing/settlePayment";
import { getPublicAppUrl } from "@/lib/appUrl";
import { buildSafeErrorResponse } from "@/lib/responseSanitizer";

/**
 * GET /api/billing/sandbox-complete?orderId=
 * Instantly settles a pending order when PAYMENT_SANDBOX=true (local / staging).
 */
export async function GET(request: NextRequest) {
  const sandbox =
    process.env.PAYMENT_SANDBOX === "true" || process.env.PAYMENT_SANDBOX === "1";
  const appUrl = getPublicAppUrl().replace(/\/$/, "");
  const orderId = request.nextUrl.searchParams.get("orderId") || "";

  if (!sandbox) {
    return NextResponse.json(
      buildSafeErrorResponse(403, "Sandbox payments are disabled."),
      { status: 403 },
    );
  }
  if (!orderId) {
    return NextResponse.redirect(`${appUrl}/dashboard/billing?paid=0`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${appUrl}/auth?next=/dashboard/billing`);
  }

  const { data: order } = await (supabase as unknown as { from: (t: string) => any })
    .from("payment_orders")
    .select("id, owner_user_id, status")
    .eq("id", orderId)
    .maybeSingle();

  if (!order || order.owner_user_id !== user.id) {
    return NextResponse.redirect(`${appUrl}/dashboard/billing?paid=0`);
  }

  const ok = await settlePaidOrder(orderId, `sandbox_${Date.now()}`);
  return NextResponse.redirect(`${appUrl}/dashboard/billing?paid=${ok ? "1" : "0"}`);
}
