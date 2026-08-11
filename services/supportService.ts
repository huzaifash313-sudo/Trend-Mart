/* -------------------------------------------------------------------------- */
/*  TrendMart — Platform Support Desk Service                                 */
/*  Handles the platform-wide "Contact TrendMart Support" ticket system,      */
/*  distinct from per-shop customer inquiries (services/inquiryService.ts).   */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import { sanitizeLight, truncate } from "@/lib/sanitization";
import { formatPkPhoneDisplay } from "@/lib/phoneFormat";
import type { SupportTicket, SupportTicketFormData, SupportTicketStatus } from "@/types";

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const msg = String((err as { message: unknown }).message ?? "").trim();
    if (msg) return msg;
  }
  if (typeof err === "string" && err.trim()) return err;
  return "An unexpected error occurred.";
}

function friendlyDbError(err: unknown): string {
  const raw = toError(err).toLowerCase();
  if (
    raw.includes("does not exist") ||
    raw.includes("schema cache") ||
    raw.includes("could not find the table")
  ) {
    return "Support inbox is not set up yet. Please try again later.";
  }
  if (raw.includes("permission denied") || raw.includes("row-level security")) {
    return "Could not save your message due to a permissions issue. Please try again.";
  }
  if (raw.includes("check constraint") || raw.includes("violates")) {
    return "Some fields look invalid. Please check the form and try again.";
  }
  const msg = toError(err);
  if (msg && msg !== "An unexpected error occurred.") return msg;
  return "We could not send your message right now. Please try again.";
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Submit a new support ticket via /api/support/notify (server insert + email).
 * Falls back to a client insert without `.select()` if the API is down.
 *
 * Guest-safe: never uses INSERT … RETURNING — RLS only allows SELECT when
 * auth.uid() = user_id, which blocked Contact Support for guests.
 */
export async function createSupportTicket(
  form: SupportTicketFormData,
): Promise<ServiceResult<SupportTicket>> {
  const name = truncate(sanitizeLight(form.name), 120);
  const email = form.email.trim().toLowerCase();
  const subject = truncate(sanitizeLight(form.subject), 200);
  const message = truncate(sanitizeLight(form.message), 4000);

  if (!name) return { success: false, error: "Please enter your name." };
  if (!EMAIL_PATTERN.test(email)) {
    return { success: false, error: "Please enter a valid email address." };
  }
  if (!subject) return { success: false, error: "Please enter a subject." };
  if (!message || message.length < 10) {
    return {
      success: false,
      error: "Please describe your issue in at least 10 characters.",
    };
  }

  const phone = form.phone?.trim() ? formatPkPhoneDisplay(form.phone) : "";

  let userId: string | null = null;
  try {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    userId = userData.user?.id ?? null;
  } catch {
    userId = null;
  }

  const ticket: SupportTicket = {
    id: crypto.randomUUID(),
    user_id: userId,
    name,
    email,
    phone,
    category: form.category,
    subject,
    message,
    status: "open",
    created_at: new Date().toISOString(),
  };

  try {
    const res = await fetch("/api/support/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        phone,
        subject,
        message,
        category: form.category,
        persist: true,
        userId,
      }),
    });

    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      error?: string;
      message?: string;
    } | null;

    if (res.ok && json?.success) {
      return { success: true, data: ticket };
    }

    // Client validation / bad payload — don't double-submit.
    if (res.status >= 400 && res.status < 500) {
      return {
        success: false,
        error:
          json?.error ||
          json?.message ||
          "Please check the form and try again.",
      };
    }

    // API/server failed — try guest-safe client insert, then email-only notify.
    const fallback = await insertTicketClientSide(ticket);
    if (!fallback.success) {
      return {
        success: false,
        error:
          json?.error ||
          json?.message ||
          fallback.error ||
          "We could not send your message. Please try again.",
      };
    }

    fetch("/api/support/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        phone,
        subject,
        message,
        category: form.category,
        persist: false,
      }),
    }).catch(() => {
      /* best-effort */
    });

    return { success: true, data: ticket };
  } catch (err) {
    logError(err, {
      module: "supportService.createSupportTicket",
      meta: { email, subject },
    });

    const fallback = await insertTicketClientSide(ticket);
    if (fallback.success) {
      fetch("/api/support/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          subject,
          message,
          category: form.category,
          persist: false,
        }),
      }).catch(() => {
        /* best-effort */
      });
      return { success: true, data: ticket };
    }

    return { success: false, error: friendlyDbError(err) };
  }
}

async function insertTicketClientSide(
  ticket: SupportTicket,
): Promise<ServiceResult<true>> {
  try {
    const supabase = createClient();
    const { error } = await supabase.from("support_tickets").insert({
      user_id: ticket.user_id ?? null,
      name: ticket.name,
      email: ticket.email,
      phone: truncate(sanitizeLight(ticket.phone ?? ""), 30),
      category: ticket.category,
      subject: ticket.subject,
      message: ticket.message,
      status: "open",
    });
    if (error) throw error;
    return { success: true, data: true };
  } catch (err) {
    logError(err, { module: "supportService.insertTicketClientSide" });
    return { success: false, error: friendlyDbError(err) };
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
    logError(err, {
      module: "supportService.updateSupportTicket",
      meta: { ticketId },
    });
    return { success: false, error: toError(err) };
  }
}
