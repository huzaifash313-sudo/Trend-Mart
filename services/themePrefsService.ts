/* -------------------------------------------------------------------------- */
/*  Merchant storefront display preferences (announcement / WhatsApp float)    */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";

export interface StorefrontDisplayPrefs {
  showAnnouncementBanner: boolean;
  showWhatsappFloatingButton: boolean;
}

const DEFAULT_PREFS: StorefrontDisplayPrefs = {
  showAnnouncementBanner: true,
  showWhatsappFloatingButton: true,
};

function localKey(shopId: string): string {
  return `trendsmart_storefront_prefs_${shopId}`;
}

function readLocal(shopId: string): StorefrontDisplayPrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(localKey(shopId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StorefrontDisplayPrefs>;
    return {
      showAnnouncementBanner:
        typeof parsed.showAnnouncementBanner === "boolean"
          ? parsed.showAnnouncementBanner
          : DEFAULT_PREFS.showAnnouncementBanner,
      showWhatsappFloatingButton:
        typeof parsed.showWhatsappFloatingButton === "boolean"
          ? parsed.showWhatsappFloatingButton
          : DEFAULT_PREFS.showWhatsappFloatingButton,
    };
  } catch {
    return null;
  }
}

function writeLocal(shopId: string, prefs: StorefrontDisplayPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(localKey(shopId), JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

/** Load storefront display prefs (DB first, localStorage fallback). */
export async function fetchStorefrontDisplayPrefs(
  shopId: string,
): Promise<StorefrontDisplayPrefs> {
  const local = readLocal(shopId);
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("merchant_theme_preferences")
      .select("show_announcement_banner, show_whatsapp_floating_button")
      .eq("shop_id", shopId)
      .maybeSingle();

    if (!error && data) {
      const prefs: StorefrontDisplayPrefs = {
        showAnnouncementBanner: data.show_announcement_banner ?? true,
        showWhatsappFloatingButton: data.show_whatsapp_floating_button ?? true,
      };
      writeLocal(shopId, prefs);
      return prefs;
    }
  } catch {
    /* table / RLS may be unavailable */
  }
  return local ?? { ...DEFAULT_PREFS };
}

/** Persist storefront display prefs for the merchant's shop. */
export async function saveStorefrontDisplayPrefs(
  shopId: string,
  prefs: StorefrontDisplayPrefs,
): Promise<{ success: boolean; error?: string }> {
  writeLocal(shopId, prefs);
  try {
    const supabase = createClient();
    const { error } = await supabase.from("merchant_theme_preferences").upsert(
      {
        shop_id: shopId,
        show_announcement_banner: prefs.showAnnouncementBanner,
        show_whatsapp_floating_button: prefs.showWhatsappFloatingButton,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shop_id" },
    );
    if (error) {
      // Local save still succeeded — merchant UI works; public may need SQL policy.
      return { success: true, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return {
      success: true,
      error: err instanceof Error ? err.message : "Saved locally only.",
    };
  }
}
