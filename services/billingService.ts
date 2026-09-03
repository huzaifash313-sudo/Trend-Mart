/* Client helpers for token wallet + billing checkout. */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import { tokensForPack } from "@/lib/billing/plans";

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

export type TokenPack = {
  id: string;
  name: string;
  tokens: number;
  price_pkr: number;
  bonus_tokens: number;
  is_active: boolean;
  sort_order: number;
};

export type TokenWallet = {
  shop_id: string;
  balance: number;
  updated_at?: string;
};

export async function fetchTokenBalance(shopId: string): Promise<ServiceResult<number>> {
  const supabase = createClient() as unknown as { from: (t: string) => any };
  try {
    const { data, error } = await supabase
      .from("shop_token_wallets")
      .select("balance")
      .eq("shop_id", shopId)
      .maybeSingle();
    if (error) throw error;
    return { success: true, data: Number(data?.balance ?? 0) };
  } catch (err) {
    logError(err, { module: "billingService.fetchTokenBalance", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

export async function fetchTokenPacks(): Promise<ServiceResult<TokenPack[]>> {
  const supabase = createClient() as unknown as { from: (t: string) => any };
  try {
    const { data, error } = await supabase
      .from("token_packs")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return { success: true, data: (data as TokenPack[]) ?? [] };
  } catch (err) {
    logError(err, { module: "billingService.fetchTokenPacks" });
    return { success: false, error: toError(err) };
  }
}

export async function startTokenCheckout(
  shopId: string,
  packId: string,
): Promise<ServiceResult<{ orderId: string; checkoutUrl: string | null; provider: string; formFields?: Record<string, string> }>> {
  try {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ kind: "tokens", shopId, packId }),
    });
    const json = (await res.json()) as {
      success?: boolean;
      error?: string;
      orderId?: string;
      checkoutUrl?: string | null;
      provider?: string;
      formFields?: Record<string, string>;
    };
    if (!res.ok || !json.success || !json.orderId) {
      return { success: false, error: json.error || "Checkout failed." };
    }
    return {
      success: true,
      data: {
        orderId: json.orderId,
        checkoutUrl: json.checkoutUrl ?? null,
        provider: json.provider || "manual",
        formFields: json.formFields,
      },
    };
  } catch (err) {
    return { success: false, error: toError(err) };
  }
}

export async function startSubscriptionCheckout(
  shopId: string,
): Promise<ServiceResult<{ orderId: string; checkoutUrl: string | null; provider: string; formFields?: Record<string, string> }>> {
  try {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ kind: "subscription", shopId }),
    });
    const json = (await res.json()) as {
      success?: boolean;
      error?: string;
      orderId?: string;
      checkoutUrl?: string | null;
      provider?: string;
      formFields?: Record<string, string>;
    };
    if (!res.ok || !json.success || !json.orderId) {
      return { success: false, error: json.error || "Checkout failed." };
    }
    return {
      success: true,
      data: {
        orderId: json.orderId,
        checkoutUrl: json.checkoutUrl ?? null,
        provider: json.provider || "manual",
        formFields: json.formFields,
      },
    };
  } catch (err) {
    return { success: false, error: toError(err) };
  }
}

/** Spend tokens → auto-approve ad (RPC). */
export async function publishAdWithTokens(adId: string): Promise<ServiceResult<{ id: string; status: string; tokens_spent: number }>> {
  const supabase = createClient() as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
  try {
    const { data, error } = await supabase.rpc("publish_ad_with_tokens", { p_ad_id: adId });
    if (error) {
      const msg = error.message || "";
      if (msg.includes("insufficient_tokens")) {
        return { success: false, error: "Not enough tokens. Buy a pack on Billing, then try again." };
      }
      if (msg.includes("missing_plan_price")) {
        return { success: false, error: "Pick a pricing plan before publishing with tokens." };
      }
      if (msg.includes("already_approved")) {
        return { success: false, error: "This ad is already live." };
      }
      throw error;
    }
    const row = data as { id: string; status: string; tokens_spent?: number };
    return {
      success: true,
      data: {
        id: row.id,
        status: row.status,
        tokens_spent: Number(row.tokens_spent ?? 0),
      },
    };
  } catch (err) {
    logError(err, { module: "billingService.publishAdWithTokens", meta: { adId } });
    return { success: false, error: toError(err) };
  }
}

export function packTotalTokens(pack: TokenPack): number {
  return tokensForPack(pack);
}

/** POST helper: open JazzCash as auto-submitting HTML form when formFields present. */
export function submitProviderForm(actionUrl: string, fields: Record<string, string>): void {
  if (typeof document === "undefined") return;
  const form = document.createElement("form");
  form.method = "POST";
  form.action = actionUrl;
  form.style.display = "none";
  for (const [key, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}
