/* -------------------------------------------------------------------------- */
/*  TrendMart — Merchant Verification/Suspension Email Notification            */
/*  POST /api/notifications/merchant-approval                                 */
/*                                                                             */
/*  Fired (fire-and-forget) from the Super-Admin dashboard when a merchant's   */
/*  store is verified & activated or suspended. Looks up the store owner's    */
/*  email via the service-role admin client and sends a branded update.       */
/* -------------------------------------------------------------------------- */

import { NextResponse } from "next/server";
import { sendEmail, emailShell } from "@/lib/email";
import { getUserEmailById } from "@/lib/supabase/admin";
import { sanitizeLight, truncate, isValidUUID } from "@/lib/sanitization";
import { buildSafeErrorResponse } from "@/lib/responseSanitizer";

interface NotifyPayload {
  ownerId: string;
  shopName: string;
  verified: boolean;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<NotifyPayload>;
    const ownerId = body.ownerId ?? "";
    const shopName = truncate(sanitizeLight(body.shopName ?? "Your store"), 120);
    const verified = !!body.verified;

    if (!isValidUUID(ownerId)) {
      return NextResponse.json(buildSafeErrorResponse(400, "Invalid owner ID."), { status: 400 });
    }

    const email = await getUserEmailById(ownerId);
    if (!email) {
      // Admin client not configured, or user has no email on file — non-fatal.
      return NextResponse.json({ success: false, reason: "no_email_on_file" });
    }

    const result = verified
      ? await sendEmail({
          to: email,
          subject: `${shopName} is now live on TrendMart 🎉`,
          html: emailShell(
            "Your store is live!",
            `<p>Great news — <strong>${shopName}</strong> has been verified and is now visible to
             customers on TrendMart.</p>
             <p>Head to your dashboard to add products, set your delivery radius, and start
             receiving orders.</p>`,
          ),
        })
      : await sendEmail({
          to: email,
          subject: `${shopName} has been suspended on TrendMart`,
          html: emailShell(
            "Your store has been suspended",
            `<p><strong>${shopName}</strong> is currently hidden from customers on TrendMart.</p>
             <p>If you believe this is a mistake, please contact our support team and we'll help
             resolve it as quickly as possible.</p>`,
          ),
        });

    return NextResponse.json({ success: result.success });
  } catch {
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
