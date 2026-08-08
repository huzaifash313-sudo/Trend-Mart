/* -------------------------------------------------------------------------- */
/*  TrendMart — Platform Support Desk Service                                 */
/*  Handles the platform-wide "Contact TrendMart Support" ticket system,      */
/*  distinct from per-shop customer inquiries (services/inquiryService.ts).   */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import { sanitizeLight, truncate } from "@/lib/sanitization";
import type { SupportTicket, SupportTicketFormData, SupportTicketStatus } from "@/types";

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Submit a new support ticket. Available to guests and authenticated users.
 * If the caller is logged in, `user_id` is attached automatically so the
 * ticket shows up in their own history.
 */
export async function createSupportTicket(
  form: SupportTicketFormData,
): Promise<ServiceResult<SupportTicket>> {
  const supabase = createClient();

  const name = truncate(sanitizeLight(form.name), 120);
  const email = form.email.trim().toLowerCase();
  const subject = truncate(sanitizeLight(form.subject), 200);
  const message = truncate(sanitizeLight(form.message), 4000);

  if (!name) return { success: false, error: "Please enter your name." };
  if (!EMAIL_PATTERN.test(email)) return { success: false, error: "Please enter a valid email address." };
  if (!subject) return { success: false, error: "Please enter a subject." };
  if (!message || message.length < 10) {
    return { success: false, error: "Please describe your issue in at least 10 characters." };
  }

  try {
    const { data: userData } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("support_tickets")
      .insert({
        user_id: userData.user?.id ?? null,
        name,
        email,
        phone: truncate(sanitizeLight(form.phone ?? ""), 30),
        category: form.category,
        subject,
        message,
        status: "open",
      })
      .select()
      .single();

    if (error) throw error;

    // Fire-and-forget branded email notification (confirmation + team alert).
    // Never blocks or fails ticket creation if email isn't configured.
    if (typeof fetch !== "undefined") {
      fetch("/api/support/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message, category: form.category }),
      }).catch(() => { /* best-effort only */ });
    }

    return { success: true, data: data as SupportTicket };
  } catch (err) {
    logError(err, { module: "supportService.createSupportTicket", meta: { email, subject } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Fetch all support tickets — admin only (enforced by RLS).
 */
export async function fetchSupportTickets(): Promise<ServiceResult<SupportTicket[]>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    return { success: true, data: (data as SupportTicket[]) ?? [] };
  } catch (err) {
    logError(err, { module: "supportService.fetchSupportTickets" });
    return { success: false, error: toError(err) };
  }
}

/**
 * Update a ticket's status and/or admin notes — admin only (enforced by RLS).
 */
export async function updateSupportTicket(
  ticketId: string,
  patch: { status?: SupportTicketStatus; admin_notes?: string },
): Promise<ServiceResult<SupportTicket>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("support_tickets")
      .update(patch)
      .eq("id", ticketId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as SupportTicket };
  } catch (err) {
    logError(err, { module: "supportService.updateSupportTicket", meta: { ticketId } });
    return { success: false, error: toError(err) };
  }
}
