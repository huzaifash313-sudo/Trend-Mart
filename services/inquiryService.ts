/* -------------------------------------------------------------------------- */
/*  TrendsMart — Customer Inquiry / In-App Messaging Service                  */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import { sanitizeLight, truncate } from "@/lib/sanitization";

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

export interface CustomerInquiry {
  id: string;
  shop_id: string;
  customer_name: string;
  customer_phone: string;
  customer_user_id: string | null;
  message: string;
  product_id: string | null;
  is_read: boolean;
  merchant_reply: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at?: string;
  /** Joined shop name when fetched for the customer portal. */
  shop_name?: string;
}

export interface LogInquiryParams {
  shopId: string;
  customerName: string;
  customerPhone?: string;
  message: string;
  productId?: string;
}

/**
 * Send an in-app inquiry to a shop (customer → merchant).
 */
export async function sendInquiry(
  params: LogInquiryParams,
): Promise<ServiceResult<CustomerInquiry>> {
  const supabase = createClient();
  const message = truncate(sanitizeLight(params.message), 2000);
  const customerName = truncate(sanitizeLight(params.customerName), 100);
  const customerPhone = truncate(
    (params.customerPhone ?? "").replace(/[^\d+\s-]/g, ""),
    30,
  );

  if (!message.trim()) {
    return { success: false, error: "Please type a message." };
  }
  if (!customerName.trim()) {
    return { success: false, error: "Please enter your name." };
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("customer_inquiries")
      .insert({
        shop_id: params.shopId,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_user_id: user?.id ?? null,
        message: message.trim(),
        product_id: params.productId ?? null,
        is_read: false,
      })
      .select("*")
      .single();

    if (error) throw error;
    return { success: true, data: data as CustomerInquiry };
  } catch (err) {
    logError(err, { module: "inquiryService.sendInquiry", meta: { shopId: params.shopId } });
    return { success: false, error: toError(err) };
  }
}

/** @deprecated Use sendInquiry — kept for legacy callers. */
export async function logInquiry(
  shopId: string,
  customerName: string,
  message: string,
  productId?: string,
): Promise<void> {
  await sendInquiry({ shopId, customerName, message, productId });
}

export async function fetchInquiriesByShopId(
  shopId: string,
): Promise<ServiceResult<CustomerInquiry[]>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("customer_inquiries")
      .select("*")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    return { success: true, data: (data as CustomerInquiry[]) ?? [] };
  } catch (err) {
    logError(err, { module: "inquiryService.fetchInquiriesByShopId", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

/** Customer portal — inquiries sent by the signed-in user. */
export async function fetchMyInquiries(): Promise<ServiceResult<CustomerInquiry[]>> {
  const supabase = createClient();
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "Sign in to view your messages." };
    }

    const { data, error } = await supabase
      .from("customer_inquiries")
      .select("*, shops(name)")
      .eq("customer_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const rows = ((data as Record<string, unknown>[]) ?? []).map((row) => {
      const shops = row.shops as { name?: string } | null;
      const { shops: _s, ...rest } = row;
      return {
        ...(rest as unknown as CustomerInquiry),
        shop_name: shops?.name ?? undefined,
      };
    });

    return { success: true, data: rows };
  } catch (err) {
    logError(err, { module: "inquiryService.fetchMyInquiries" });
    return { success: false, error: toError(err) };
  }
}

export async function markInquiryRead(
  inquiryId: string,
): Promise<ServiceResult<null>> {
  const supabase = createClient();
  try {
    const { error } = await supabase
      .from("customer_inquiries")
      .update({ is_read: true, updated_at: new Date().toISOString() })
      .eq("id", inquiryId);

    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "inquiryService.markInquiryRead", meta: { inquiryId } });
    return { success: false, error: toError(err) };
  }
}

export async function replyToInquiry(
  inquiryId: string,
  reply: string,
): Promise<ServiceResult<CustomerInquiry>> {
  const supabase = createClient();
  const safeReply = truncate(sanitizeLight(reply), 2000);
  if (!safeReply.trim()) {
    return { success: false, error: "Reply cannot be empty." };
  }

  try {
    const { data, error } = await supabase
      .from("customer_inquiries")
      .update({
        merchant_reply: safeReply.trim(),
        replied_at: new Date().toISOString(),
        is_read: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", inquiryId)
      .select("*")
      .single();

    if (error) throw error;
    return { success: true, data: data as CustomerInquiry };
  } catch (err) {
    logError(err, { module: "inquiryService.replyToInquiry", meta: { inquiryId } });
    return { success: false, error: toError(err) };
  }
}

export async function deleteInquiry(
  inquiryId: string,
): Promise<ServiceResult<null>> {
  const supabase = createClient();
  try {
    const { error } = await supabase.from("customer_inquiries").delete().eq("id", inquiryId);
    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "inquiryService.deleteInquiry", meta: { inquiryId } });
    return { success: false, error: toError(err) };
  }
}
