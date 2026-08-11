/* -------------------------------------------------------------------------- */
/*  TrendMart — Support Ticket Email Notification Endpoint                    */
/*  POST /api/support/notify                                                  */
/*                                                                             */
/*  Fired (fire-and-forget) by services/supportService.ts right after a       */
/*  support ticket is inserted client-side. Sends a confirmation email to     */
/*  the submitter and an alert email to the TrendMart support team via        */
/*  Resend. Never blocks or fails the ticket submission itself.               */
/* -------------------------------------------------------------------------- */

import { NextResponse } from "next/server";
import { sendEmail, emailShell } from "@/lib/email";
import { sanitizeLight, truncate } from "@/lib/sanitization";
import { buildSafeErrorResponse } from "@/lib/responseSanitizer";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface NotifyPayload {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  category: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<NotifyPayload>;

    const name = truncate(sanitizeLight(body.name ?? ""), 120);
    const email = (body.email ?? "").trim().toLowerCase();
    const phone = truncate(sanitizeLight(body.phone ?? ""), 30);
    const subject = truncate(sanitizeLight(body.subject ?? ""), 200);
    const message = truncate(sanitizeLight(body.message ?? ""), 4000);
    const category = truncate(sanitizeLight(body.category ?? "general"), 40);

    if (!name || !EMAIL_PATTERN.test(email) || !subject || !message) {
      return NextResponse.json(buildSafeErrorResponse(400, "Invalid ticket payload."), { status: 400 });
    }

    const supportTeamEmail = (process.env.SUPPORT_TEAM_EMAIL || "").trim();
    if (!supportTeamEmail || !EMAIL_PATTERN.test(supportTeamEmail)) {
      // Still confirm to submitter; admin inbox remains the source of truth in DB.
      console.warn(
        "[support/notify] SUPPORT_TEAM_EMAIL is missing — skipping team alert email.",
      );
    }

    // Confirmation to the submitter — best-effort, doesn't fail the request.
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

    // Alert to the internal support team (email never exposed in the public UI).
    let alertSent = false;
    if (supportTeamEmail && EMAIL_PATTERN.test(supportTeamEmail)) {
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
      confirmationSent: confirmationResult.success,
      alertSent,
    });
  } catch {
    // Email notification is a non-critical side effect — never surface a hard error.
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
