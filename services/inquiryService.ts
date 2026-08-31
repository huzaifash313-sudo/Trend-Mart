/* -------------------------------------------------------------------------- */
/*  TrendsMart — Customer Inquiry / Chat History Service (Prompt 74)            */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";

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
  message: string;
  product_id: string | null;
  created_at: string;
}

/**
 * Log a customer inquiry (from ContactModal or WhatsApp click).
 * Runs fire-and-forget so it never blocks UX.
 */
export async function logInquiry(
  shopId: string,
  customerName: string,
  message: string,
  productId?: string,
): Promise<void> {
  const supabase = createClient();
  try {
    await supabase.from("customer_inquiries").insert({
      shop_id: shopId,
      customer_name: customerName,
      message: message || "WhatsApp inquiry",
      product_id: productId ?? null,
    });
  } catch (err) {
    // Silently fail — inquiries should never break UX
    logError(err, {
      module: "inquiryService.logInquiry",
      meta: { shopId, customerName, productId },
    });
  }
}

/**
 * Fetch all inquiries for a specific shop (merchant dashboard).
 */
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

/**
 * Delete a specific inquiry (merchant cleanup).
 */
export async function deleteInquiry(
  inquiryId: string,
): Promise<ServiceResult<null>> {
  const supabase = createClient();
  try {
    const { error } = await supabase
      .from("customer_inquiries")
      .delete()
      .eq("id", inquiryId);

    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "inquiryService.deleteInquiry", meta: { inquiryId } });
    return { success: false, error: toError(err) };
  }
}