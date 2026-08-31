/* -------------------------------------------------------------------------- */
/*  TrendsMart — Customer Lead Generation Service                               */
/*  Captures WhatsApp inquiry/booking clicks and manages follow-up logging.    */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import {
  sanitizeLight,
  sanitizeAndValidatePhone,
  truncate,
  isValidUUID,
  validateEnum,
} from "@/lib/sanitization";

// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

/** Lead row from the public.leads table. */
export interface Lead {
  id: string;
  shop_id: string;
  customer_phone: string;
  customer_name: string;
  product_id: string | null;
  service_context: string;
  source: "whatsapp" | "inquiry_form" | "booking_button";
  is_converted: boolean;
  followed_up_at: string | null;
  notes: string;
  created_at: string;
}

/** Payload for logging a new lead (fire-and-forget). */
export interface LeadPayload {
  shopId: string;
  customerPhone?: string;
  customerName?: string;
  productId?: string;
  serviceContext?: string;
  source?: Lead["source"];
}

// ─── Lead source allowed values ─────────────────────────────────────────────

const ALLOWED_SOURCES: readonly Lead["source"][] = [
  "whatsapp",
  "inquiry_form",
  "booking_button",
];

// ─── Field constraints ──────────────────────────────────────────────────────

const MAX_CUSTOMER_NAME = 100;
const MAX_SERVICE_CONTEXT = 300;
const MAX_NOTES = 1000;

// ─── Sanitization helpers ──────────────────────────────────────────────────

/**
 * Sanitize a LeadPayload before database insertion.
 * - Strips HTML/script tags from all text fields
 * - Validates UUIDs are well-formed (product_id, shop_id)
 * - Sanitizes phone numbers (digits only)
 * - Validates source against allowed enum values
 * - Truncates text fields to max lengths
 */
function sanitizeLeadPayload(payload: LeadPayload): {
  shop_id: string;
  customer_phone: string;
  customer_name: string;
  product_id: string | null;
  service_context: string;
  source: Lead["source"];
} {
  return {
    shop_id: truncate(sanitizeLight(payload.shopId), 50),
    customer_phone: sanitizeAndValidatePhone(payload.customerPhone ?? ""),
    customer_name: truncate(
      sanitizeLight(payload.customerName ?? ""),
      MAX_CUSTOMER_NAME,
    ),
    product_id:
      payload.productId && isValidUUID(payload.productId)
        ? payload.productId
        : null,
    service_context: truncate(
      sanitizeLight(payload.serviceContext ?? ""),
      MAX_SERVICE_CONTEXT,
    ),
    source: validateEnum(payload.source, ALLOWED_SOURCES, "whatsapp"),
  };
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Log a lead when a customer clicks a WhatsApp inquiry or booking button.
 * All user-supplied fields are sanitized before database insertion.
 * Runs fire-and-forget so it never blocks the user's experience.
 */
export function logLead(payload: LeadPayload): void {
  const sanitized = sanitizeLeadPayload(payload);
  const supabase = createClient();
  supabase
    .from("leads")
    .insert(sanitized)
    .then(({ error }) => {
      if (error) {
        logError(error, {
          module: "leadsService.logLead",
          meta: { shopId: sanitized.shop_id, source: sanitized.source },
        });
      }
    }, (err: unknown) => {
      logError(err, {
        module: "leadsService.logLead",
        meta: { shopId: sanitized.shop_id, source: sanitized.source },
      });
    });
}

/**
 * Fetch all leads for a given shop, newest first.
 */
export async function fetchLeadsByShopId(
  shopId: string,
  opts?: { page?: number; pageSize?: number; onlyUnconverted?: boolean },
): Promise<ServiceResult<{ leads: Lead[]; total: number }>> {
  const supabase = createClient();
  try {
    const page = opts?.page ?? 1;
    const pageSize = opts?.pageSize ?? 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Count query
    let countQuery = supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("shop_id", shopId);

    if (opts?.onlyUnconverted) {
      countQuery = countQuery.eq("is_converted", false);
    }

    const { count, error: countError } = await countQuery;
    if (countError) throw countError;

    // Data query
    let dataQuery = supabase
      .from("leads")
      .select("*")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (opts?.onlyUnconverted) {
      dataQuery = dataQuery.eq("is_converted", false);
    }

    const { data, error } = await dataQuery;
    if (error) throw error;

    return {
      success: true,
      data: { leads: (data as Lead[]) ?? [], total: count ?? 0 },
    };
  } catch (err) {
    logError(err, { module: "leadsService.fetchLeadsByShopId", meta: { shopId, opts } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Mark a lead as converted (followed up).
 * Sanitizes notes before storage.
 */
export async function markLeadConverted(
  leadId: string,
  notes?: string,
): Promise<ServiceResult<Lead>> {
  if (!leadId || typeof leadId !== "string") {
    return { success: false, error: "Invalid lead ID." };
  }
  const supabase = createClient();
  try {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      is_converted: true,
      followed_up_at: now,
    };
    if (notes !== undefined) {
      updates.notes = truncate(sanitizeLight(notes), MAX_NOTES);
    }

    const { data, error } = await supabase
      .from("leads")
      .update(updates)
      .eq("id", leadId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as Lead };
  } catch (err) {
    logError(err, { module: "leadsService.markLeadConverted", meta: { leadId } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Update lead notes (follow-up notes added by merchant).
 * Sanitizes notes before storage.
 */
export async function updateLeadNotes(
  leadId: string,
  notes: string,
): Promise<ServiceResult<Lead>> {
  if (!leadId || typeof leadId !== "string") {
    return { success: false, error: "Invalid lead ID." };
  }
  const sanitizedNotes = truncate(sanitizeLight(notes), MAX_NOTES);
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("leads")
      .update({ notes: sanitizedNotes })
      .eq("id", leadId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as Lead };
  } catch (err) {
    logError(err, { module: "leadsService.updateLeadNotes", meta: { leadId } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Delete a lead record.
 * Validates leadId before deletion.
 */
export async function deleteLead(leadId: string): Promise<ServiceResult<null>> {
  if (!leadId || typeof leadId !== "string") {
    return { success: false, error: "Invalid lead ID." };
  }
  const supabase = createClient();
  try {
    const { error } = await supabase.from("leads").delete().eq("id", leadId);
    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "leadsService.deleteLead", meta: { leadId } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Get lead statistics for a shop.
 * Validates shopId before querying.
 */
export async function fetchLeadStats(
  shopId: string,
): Promise<
  ServiceResult<{
    total: number;
    unconverted: number;
    converted: number;
    todayCount: number;
  }>
> {
  if (!shopId || typeof shopId !== "string") {
    return { success: true, data: { total: 0, unconverted: 0, converted: 0, todayCount: 0 } };
  }
  const supabase = createClient();
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Run the four independent COUNT queries in parallel instead of four
    // sequential round-trips to the database.
    const [totalRes, unconvertedRes, convertedRes, todayRes] = await Promise.all([
      supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("shop_id", shopId),
      supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("is_converted", false),
      supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("is_converted", true),
      supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .gte("created_at", todayStart.toISOString()),
    ]);

    return {
      success: true,
      data: {
        total: totalRes.count ?? 0,
        unconverted: unconvertedRes.count ?? 0,
        converted: convertedRes.count ?? 0,
        todayCount: todayRes.count ?? 0,
      },
    };
  } catch (err) {
    logError(err, { module: "leadsService.fetchLeadStats", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}
