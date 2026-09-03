import { NextRequest, NextResponse } from "next/server";
import { verifyJazzCashCallback } from "@/lib/billing/paymentGateway";
import { getPublicAppUrl } from "@/lib/appUrl";
import { settlePaidOrder } from "@/lib/billing/settlePayment";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * JazzCash / gateway return + IPN style callback.
 * Credits tokens or activates subscription when payment succeeds.
 */
export async function POST(request: NextRequest) {
  const admin = getSupabaseAdminClient() as unknown as {
    from: (t: string) => any;
  } | null;
  const appUrl = getPublicAppUrl().replace(/\/$/, "");

  try {
    const contentType = request.headers.get("content-type") || "";
    let fields: Record<string, string> = {};

    if (contentType.includes("application/json")) {
      fields = (await request.json()) as Record<string, string>;
    } else {
      const form = await request.formData();
      form.forEach((v, k) => {
        fields[k] = String(v);
      });
    }

    const orderId =
      fields.pp_BillReference ||
      fields.orderId ||
      fields.billReference ||
      "";

    if (!admin || !orderId) {
      return NextResponse.redirect(`${appUrl}/dashboard/billing?paid=0`);
    }

    if (fields.pp_SecureHash && !verifyJazzCashCallback(fields)) {
      return NextResponse.redirect(`${appUrl}/dashboard/billing?paid=0&err=hash`);
    }

    const responseCode = fields.pp_ResponseCode || fields.responseCode || "";
    const ok =
      !fields.pp_SecureHash ||
      responseCode === "000" ||
      responseCode === "00" ||
      fields.status === "paid";

    if (!ok) {
      await admin
        .from("payment_orders")
        .update({ status: "failed", updated_at: new Date().toISOString(), meta: fields })
        .eq("id", orderId)
        .eq("status", "pending");
      return NextResponse.redirect(`${appUrl}/dashboard/billing?paid=0`);
    }

    const settled = await settlePaidOrder(orderId, fields.pp_TxnRefNo || fields.provider_ref || null);
    return NextResponse.redirect(`${appUrl}/dashboard/billing?paid=${settled ? "1" : "0"}`);
  } catch (err) {
    console.error("[billing/callback]", err);
    return NextResponse.redirect(`${appUrl}/dashboard/billing?paid=0`);
  }
}

export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get("orderId") || "";
  const appUrl = getPublicAppUrl().replace(/\/$/, "");
  if (!orderId) {
    return NextResponse.redirect(`${appUrl}/dashboard/billing`);
  }
  const settled = await settlePaidOrder(orderId, null);
  return NextResponse.redirect(`${appUrl}/dashboard/billing?paid=${settled ? "1" : "0"}`);
}
