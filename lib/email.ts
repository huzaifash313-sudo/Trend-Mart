/* -------------------------------------------------------------------------- */
/*  TrendsMart — Branded Transactional Email (Resend)                          */
/*                                                                             */
/*  SERVER-ONLY. Never import this from a "use client" component — it reads   */
/*  the RESEND_API_KEY secret and must only run inside API routes / server    */
/*  components.                                                              */
/*                                                                             */
/*  Setup:                                                                    */
/*   1. Create a Resend account (https://resend.com) and verify your sending  */
/*      domain (e.g. trendsmart.pk).                                          */
/*   2. Set RESEND_API_KEY and EMAIL_FROM in your environment variables.      */
/*   3. Until RESEND_API_KEY is configured, all sends are safely no-op'd and  */
/*      logged — the rest of the app continues to function normally.         */
/* -------------------------------------------------------------------------- */

import { Resend } from "resend";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  error?: string;
  id?: string;
}

let cachedClient: Resend | null = null;

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!cachedClient) cachedClient = new Resend(apiKey);
  return cachedClient;
}

function isConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/**
 * Send a branded transactional email via Resend.
 * Safe to call even when email isn't configured — returns a graceful
 * `success: false` result instead of throwing, so callers can treat email
 * delivery as a best-effort side effect.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const client = getResendClient();
  const fromAddress = process.env.EMAIL_FROM || "TrendsMart <notifications@trendsmart.pk>";

  if (!client) {
    console.warn(
      "[TrendsMart Email] RESEND_API_KEY is not configured — skipping email send. " +
        `Would have sent "${input.subject}" to ${Array.isArray(input.to) ? input.to.join(", ") : input.to}.`,
    );
    return { success: false, error: "Email is not configured on this deployment." };
  }

  try {
    const { data, error } = await client.emails.send({
      from: fromAddress,
      to: input.to,
      subject: input.subject,
      html: input.html,
      replyTo: input.replyTo,
    });

    if (error) return { success: false, error: error.message };
    return { success: true, id: data?.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown email error." };
  }
}

export { isConfigured as isEmailConfigured };

/* -------------------------------------------------------------------------- */
/*  Shared Branded Template Shell                                             */
/* -------------------------------------------------------------------------- */

export function emailShell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background-color:#059669;padding:24px 32px;">
                <span style="color:#ffffff;font-size:20px;font-weight:700;">TrendsMart</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:18px;color:#18181b;">${title}</h1>
                <div style="font-size:14px;line-height:1.6;color:#52525b;">${bodyHtml}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #f4f4f5;">
                <p style="margin:0;font-size:11px;color:#a1a1aa;">
                  &copy; ${new Date().getFullYear()} TrendsMart. Your neighborhood, delivered.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
