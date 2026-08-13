/* -------------------------------------------------------------------------- */
/*  TrendMart — Support Ticket Submit + Email Notify                          */
/*  POST /api/support/notify                                                  */
/*                                                                             */
/*  Creates the support_tickets row (server-side) and sends confirmation /    */
/*  team alert emails. Server insert avoids guest RLS failure on              */
/*  INSERT … RETURNING that broke the Contact Support form.                   */
/* -------------------------------------------------------------------------- */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, emailShell } from "@/lib/email";
import { sanitizeLight, truncate } from "@/lib/sanitization";
import { formatPkPhoneDisplay } from "@/lib/phoneFormat";
import { buildSafeErrorResponse } from "@/lib/responseSanitizer";
import { checkRateLimit, RATE_LIMITS, buildRateLimitResponse } from "@/lib/rateLimiter";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CATEGORIES = new Set([
  "general",
  "order",
  "merchant",
  "technical",
  "billing",
  "other",
]);

interface NotifyPayload {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  category: string;
  /** When true (default), persist to support_tickets before emailing. */
  persist?: boolean;
}

type SupportTicketInsert = {
  user_id: string | null;
  name: string;
  email: string;
  phone: string;
  category: string;
  subject: string;
  message: string;
  status: string;
};

function publicDbMessage(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : "";
  const msg = raw.toLowerCase();
  if (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("could not find the table")
  ) {
    return "Support inbox is not set up yet. Please try again later.";
  }
  if (msg.includes("permission denied") || msg.includes("row-level security")) {
    return "Could not save your message due to a permissions issue. Please try again.";
  }
  return "We could not send your message right now. Please try again.";
}

async function persistTicket(row: SupportTicketInsert) {
  // Untyped Supabase clients infer insert as `never` — cast the payload only.
  const payload = row as unknown as never;

  const admin = getSupabaseAdminClient();
  if (admin) {
    const { error } = await admin.from("support_tickets").insert(payload);
    if (error) throw error;
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Supabase is not configured on the server.");
  }

  const client = createSupabaseClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // No .select() — guests cannot read rows under own_read RLS.
  const { error } = await client.from("support_tickets").insert(payload);
  if (error) throw error;
}

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, { ...RATE_LIMITS.SUPPORT, name: "support-notify" });
  if (!limited.allowed) {
    const res = buildRateLimitResponse(limited);
    return NextResponse.json(res.body, { status: res.status, headers: res.headers });
  }

  try {
    let body: Partial<NotifyPayload>;
    try {
      body = (await request.json()) as Partial<NotifyPayload>;
    } catch {
      return NextResponse.json(buildSafeErrorResponse(400, "Invalid ticket payload."), {
        status: 400,
      });
    }

    const name = truncate(sanitizeLight(body.name ?? ""), 120);
    const email = (body.email ?? "").trim().toLowerCase();
    const phone = body.phone?.trim()
      ? truncate(sanitizeLight(formatPkPhoneDisplay(body.phone)), 30)
      : truncate(sanitizeLight(body.phone ?? ""), 30);
    const subject = truncate(sanitizeLight(body.subject ?? ""), 200);
    const message = truncate(sanitizeLight(body.message ?? ""), 4000);
    const categoryRaw = truncate(sanitizeLight(body.category ?? "general"), 40);
    const category = CATEGORIES.has(categoryRaw) ? categoryRaw : "general";

    if (!name || !EMAIL_PATTERN.test(email) || !subject || !message) {
      return NextResponse.json(buildSafeErrorResponse(400, "Invalid ticket payload."), {
        status: 400,
      });
    }
    if (message.length < 10) {
      return NextResponse.json(
        buildSafeErrorResponse(400, "Please describe your issue in at least 10 characters."),
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    try {
      await persistTicket({
        user_id: user?.id ?? null,
        name,
        email,
        phone,
        category,
        subject,
        message,
        status: "open",
      });
    } catch (dbErr) {
      console.error("[support/notify] persist failed:", dbErr);
      return NextResponse.json(buildSafeErrorResponse(500, publicDbMessage(dbErr)), {
        status: 500,
      });
    }

    const confirmationResult = await sendEmail({
      to: email,
      subject: "We received your message — TrendMart Support",
      html: emailShell(
        "We've got your message!",
        `<p>Hi ${name},</p>
         <p>Thanks for reaching out to TrendMart Support. Here's a copy of what you sent us:</p>
         <blockquote style="margin:16px 0;padding:12px 16px;background:#f4f4f5;border-radius:8px;color:#3f3f46;">
           <strong>${subject}</strong><br/>${message}
         </blockquote>
         <p>Our team typically responds within 24–48 hours.</p>`,
      ),
    });

    let alertSent = false;
    const supportTeamEmail = (process.env.SUPPORT_TEAM_EMAIL || "").trim();
    if (!supportTeamEmail || !EMAIL_PATTERN.test(supportTeamEmail)) {
      console.warn(
        "[support/notify] SUPPORT_TEAM_EMAIL is missing — skipping team alert email.",
      );
    } else {
      const alertResult = await sendEmail({
        to: supportTeamEmail,
        subject: `[${category}] New support ticket: ${subject}`,
        replyTo: email,
        html: emailShell(
          "New Support Ticket",
          `<p><strong>From:</strong> ${name} (${email})</p>
           ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ""}
           <p><strong>Category:</strong> ${category}</p>
           <p><strong>Subject:</strong> ${subject}</p>
           <p><strong>Message:</strong><br/>${message}</p>
           <p style="margin-top:16px;color:#71717a;font-size:13px;">Also visible in Admin → Support Inbox.</p>`,
        ),
      });
      alertSent = alertResult.success;
    }

    return NextResponse.json({
      success: true,
      persisted: true,
      confirmationSent: confirmationResult.success,
      alertSent,
    });
  } catch (err) {
    console.error("[support/notify]", err);
    return NextResponse.json(buildSafeErrorResponse(500, publicDbMessage(err)), {
      status: 500,
    });
  }
}
