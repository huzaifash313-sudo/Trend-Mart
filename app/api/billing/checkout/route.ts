import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createPaymentCheckout } from "@/lib/billing/paymentGateway";
import { MONTHLY_STORE_FEE_PKR, tokensForPack } from "@/lib/billing/plans";
import { buildSafeErrorResponse } from "@/lib/responseSanitizer";
import { checkRateLimit, RATE_LIMITS, buildRateLimitHeaders } from "@/lib/rateLimiter";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AdminLoose = {
  from: (table: string) => any;
};

/**
 * POST /api/billing/checkout
 * Create a payment_orders row + gateway checkout for tokens or monthly subscription.
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
      kind?: string;
      shopId?: string;
      packId?: string;
    };

    const shopId =
      typeof body.shopId === "string" && UUID_RE.test(body.shopId.trim()) ? body.shopId.trim() : "";
    const kind = body.kind === "subscription" ? "subscription" : body.kind === "tokens" ? "tokens" : "";
    if (!shopId || !kind) {
      return NextResponse.json(buildSafeErrorResponse(400, "Invalid checkout request."), { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(buildSafeErrorResponse(401, "Sign in required."), { status: 401 });
    }

    const { data: shop } = await supabase
      .from("shops")
      .select("id, owner_id, name, whatsapp_number")
      .eq("id", shopId)
      .maybeSingle();

    if (!shop || shop.owner_id !== user.id) {
      return NextResponse.json(buildSafeErrorResponse(403, "Not your shop."), { status: 403 });
    }

    const admin = getSupabaseAdminClient() as unknown as AdminLoose | null;
    if (!admin) {
      return NextResponse.json(
        buildSafeErrorResponse(503, "Billing is not configured (missing service role)."),
        { status: 503 },
      );
    }

    let amountPkr = 0;
    let tokensCredit = 0;
    let packId: string | null = null;
    let description = "TrendsMart payment";

    if (kind === "subscription") {
      amountPkr = MONTHLY_STORE_FEE_PKR;
      description = `TrendsMart Standard — ${shop.name || "store"} (1 month)`;
    } else {
      const packIdRaw =
        typeof body.packId === "string" && UUID_RE.test(body.packId.trim()) ? body.packId.trim() : "";
      if (!packIdRaw) {
        return NextResponse.json(buildSafeErrorResponse(400, "Pick a token pack."), { status: 400 });
      }
      const { data: pack } = await admin
        .from("token_packs")
        .select("*")
        .eq("id", packIdRaw)
        .eq("is_active", true)
        .maybeSingle();
      if (!pack) {
        return NextResponse.json(buildSafeErrorResponse(404, "Token pack not found."), { status: 404 });
      }
      packId = String(pack.id);
      amountPkr = Number(pack.price_pkr) || 0;
      tokensCredit = tokensForPack({
        tokens: Number(pack.tokens) || 0,
        bonus_tokens: Number(pack.bonus_tokens) || 0,
      });
      description = `Ad tokens — ${pack.name} (${tokensCredit} tokens)`;
    }

    const { data: order, error: orderErr } = await admin
      .from("payment_orders")
      .insert({
        shop_id: shopId,
        owner_user_id: user.id,
        kind,
        amount_pkr: amountPkr,
        tokens_credit: tokensCredit,
        pack_id: packId,
        status: "pending",
        provider: "manual",
        meta: { description },
      })
      .select("id")
      .single();

    if (orderErr || !order?.id) {
      console.error("[billing/checkout] insert", orderErr);
      return NextResponse.json(buildSafeErrorResponse(500, "Could not create payment order."), {
        status: 500,
      });
    }

    const checkout = await createPaymentCheckout({
      orderId: String(order.id),
      amountPkr,
      description,
      customerMobile: (shop.whatsapp_number as string) || undefined,
      returnPath: "/dashboard/billing?paid=1",
    });

    await admin
      .from("payment_orders")
      .update({
        provider: checkout.provider,
        provider_ref: checkout.providerRef,
        checkout_url: checkout.checkoutUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    return NextResponse.json({
      success: true,
      orderId: order.id,
      checkoutUrl: checkout.checkoutUrl,
      provider: checkout.provider,
      formFields: checkout.formFields ?? null,
      amountPkr,
      tokensCredit,
    });
  } catch (err) {
    console.error("[billing/checkout]", err);
    return NextResponse.json(buildSafeErrorResponse(500, "Checkout failed."), { status: 500 });
  }
}
