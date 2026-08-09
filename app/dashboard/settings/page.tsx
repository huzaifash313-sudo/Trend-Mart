"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { updateShop } from "@/services/shopService";
import ImageUpload from "@/components/ImageUpload";
import { useToast } from "@/components/Toast";
import ToggleSwitch from "@/components/ToggleSwitch";
import ShopLocationRadiusPicker from "@/components/ShopLocationRadiusPicker";
import ShopQrCode from "@/components/ShopQrCode";
import type { Shop, ShopFormData } from "@/types";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                      */
/* -------------------------------------------------------------------------- */

function ChevronLeftIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l1.12-5.6A1 1 0 0 1 5.1 3h13.8a1 1 0 0 1 .98.8L21 9" /><path d="M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9" /><path d="M9 21V9h6v12" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function QrCodeIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
      <path d="M14 14h3v3h-3zM20 14v3M14 20h3M17 20h3v.01" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Validation                                                                 */
/* -------------------------------------------------------------------------- */

interface ValidationErrors {
  name?: string;
  whatsapp_number?: string;
  business_hours?: string;
}

function validateSettings(form: ShopSettingsForm): ValidationErrors {
  const errors: ValidationErrors = {};
  
  if (!form.name.trim()) {
    errors.name = "Store name is required.";
  } else if (form.name.trim().length < 2) {
    errors.name = "Store name must be at least 2 characters.";
  }

  const phone = form.whatsapp_number.replace(/\D/g, "");
  if (phone && phone.length < 10) {
    errors.whatsapp_number = "Enter a valid phone number (min 10 digits).";
  }

  if (form.business_hours.trim() && form.business_hours.trim().length < 5) {
    errors.business_hours = "Please enter valid business hours (e.g., 'Mon-Sat: 9 AM - 10 PM').";
  }

  return errors;
}

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ShopSettingsForm {
  name: string;
  category: string;
  location: string;
  whatsapp_number: string;
  secondary_phone: string;
  logo_url: string;
  banner_url: string;
  business_hours: string;
  operating_status: string;
  instagram_handle: string;
  facebook_url: string;
  accent_color: string;
  store_bio: string;
  announcement: string;
  is_live: boolean;
  service_area: string;
  hourly_rate: string;
  call_out_charge: string;
  emergency_available: boolean;
  shop_type: string;
  latitude: number | null;
  longitude: number | null;
  service_radius_km: number;
  delivery_zones: string[];
  address_display: string;
  min_order_amount: string;
  free_delivery_threshold: string;
  delivery_fee_flat: string;
  delivery_fee_per_km: string;
}

/** Platform accent — constant TrendMart emerald (no custom color picker). */
const THEME_ACCENT = "#10b981";

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function DashboardSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState<Shop | null>(null);
  const [form, setForm] = useState<ShopSettingsForm>({
    name: "", category: "Others / Universal", location: "", whatsapp_number: "",
    secondary_phone: "", logo_url: "", banner_url: "", business_hours: "",
    operating_status: "", instagram_handle: "", facebook_url: "",
    accent_color: "", store_bio: "", announcement: "", is_live: false,
    service_area: "", hourly_rate: "", call_out_charge: "",
    emergency_available: false, shop_type: "retail",
    latitude: null, longitude: null, service_radius_km: 10, delivery_zones: [], address_display: "",
    min_order_amount: "", free_delivery_threshold: "", delivery_fee_flat: "", delivery_fee_per_km: "",
  });
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  // ── Auth Check ───────────────────────────────────────────────────────────
  const [userId, setUserId] = useState<string | null>(null);

  // Load shop and theme preferences
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) { setLoading(false); return; }

        console.log("[TrendMart Dashboard Settings] Auth check result:", {
          hasUser: !!user,
          userId: user?.id?.slice(0, 8) ?? null,
        });

        if (!user) {
          // Don't redirect — middleware validated access.
          // Show the "sign in" UI instead.
          setUserId(null);
          setLoading(false);
          return;
        }

        setUserId(user.id);

        // Use fetchMyShop() for direct owner lookup (more reliable than
        // fetching all shops and filtering client-side)
        const { fetchMyShop } = await import("@/services/shopService");
        const result = await fetchMyShop();
        if (cancelled) return;
        if (result.success && result.data) {
          const myShop = result.data;
          setShop(myShop);
          setForm({
            name: myShop.name,
            category: myShop.category,
            location: myShop.location,
            whatsapp_number: myShop.whatsapp_number,
            secondary_phone: myShop.secondary_phone ?? "",
            logo_url: myShop.logo_url ?? "",
            banner_url: myShop.banner_url ?? "",
            business_hours: myShop.business_hours ?? "",
            operating_status: myShop.operating_status ?? "",
            instagram_handle: myShop.instagram_handle ?? "",
            facebook_url: myShop.facebook_url ?? "",
            accent_color: THEME_ACCENT,
            store_bio: myShop.store_bio ?? "",
            announcement: myShop.announcement ?? "",
            is_live: myShop.is_live,
            service_area: myShop.service_area ?? "",
            hourly_rate: myShop.hourly_rate != null ? String(myShop.hourly_rate) : "",
            call_out_charge: myShop.call_out_charge != null ? String(myShop.call_out_charge) : "",
            emergency_available: myShop.emergency_available ?? false,
            shop_type: myShop.shop_type ?? "retail",
            latitude: myShop.latitude ?? null,
            longitude: myShop.longitude ?? null,
            service_radius_km: myShop.service_radius_km ?? 10,
            delivery_zones: myShop.delivery_zones ?? [],
            address_display: myShop.address_display ?? "",
            min_order_amount: myShop.min_order_amount != null && myShop.min_order_amount > 0 ? String(myShop.min_order_amount) : "",
            free_delivery_threshold: myShop.free_delivery_threshold != null ? String(myShop.free_delivery_threshold) : "",
            delivery_fee_flat: myShop.delivery_fee_flat != null && myShop.delivery_fee_flat > 0 ? String(myShop.delivery_fee_flat) : "",
            delivery_fee_per_km: myShop.delivery_fee_per_km != null && myShop.delivery_fee_per_km > 0 ? String(myShop.delivery_fee_per_km) : "",
          });
        } else if (!result.success) {
          addToast(result.error || "Could not load your store settings.", "error");
        } else {
          // success + null data = no shop for this user
        }
      } catch (err) {
        if (!cancelled) {
          addToast(
            err instanceof Error ? err.message : "Could not load store settings.",
            "error",
          );
        }
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [addToast]);

  const handleSave = useCallback(async () => {
    if (!shop) return;

    const validationErrors = validateSettings(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      addToast("Please fix the validation errors before saving.", "error");
      return;
    }

    setSaving(true);
    try {
      const shopFormFields: ShopFormData = {
        name: form.name,
        category: form.category,
        location: form.location,
        whatsapp_number: form.whatsapp_number,
        logo_url: form.logo_url,
        banner_url: form.banner_url,
        is_live: form.is_live,
        instagram_handle: form.instagram_handle,
        facebook_url: form.facebook_url,
        secondary_phone: form.secondary_phone,
        business_hours: form.business_hours,
        operating_status: form.operating_status,
        accent_color: THEME_ACCENT,
        store_bio: form.store_bio,
        announcement: form.announcement,
        service_area: form.service_area,
        hourly_rate: form.hourly_rate,
        call_out_charge: form.call_out_charge,
        emergency_available: form.emergency_available,
        shop_type: form.shop_type,
        latitude: form.latitude,
        longitude: form.longitude,
        service_radius_km: form.service_radius_km,
        delivery_zones: form.delivery_zones,
        address_display: form.address_display,
        min_order_amount: form.min_order_amount,
        free_delivery_threshold: form.free_delivery_threshold,
        delivery_fee_flat: form.delivery_fee_flat,
        delivery_fee_per_km: form.delivery_fee_per_km,
      };

      const result = await updateShop(shop.id, shopFormFields);
      if (result.success) {
        const saved = result.data;
        setShop(saved);
        // Rehydrate form from what actually persisted (after server-side
        // sanitization) so a reload can't look like "everything vanished".
        setForm({
          name: saved.name,
          category: saved.category,
          location: saved.location,
          whatsapp_number: saved.whatsapp_number,
          secondary_phone: saved.secondary_phone ?? "",
          logo_url: saved.logo_url ?? "",
          banner_url: saved.banner_url ?? "",
          business_hours: saved.business_hours ?? "",
          operating_status: saved.operating_status ?? "",
          instagram_handle: saved.instagram_handle ?? "",
          facebook_url: saved.facebook_url ?? "",
          accent_color: THEME_ACCENT,
          store_bio: saved.store_bio ?? "",
          announcement: saved.announcement ?? "",
          is_live: saved.is_live,
          service_area: saved.service_area ?? "",
          hourly_rate: saved.hourly_rate != null ? String(saved.hourly_rate) : "",
          call_out_charge: saved.call_out_charge != null ? String(saved.call_out_charge) : "",
          emergency_available: saved.emergency_available ?? false,
          shop_type: saved.shop_type ?? "retail",
          latitude: saved.latitude ?? null,
          longitude: saved.longitude ?? null,
          service_radius_km: saved.service_radius_km ?? 10,
          delivery_zones: saved.delivery_zones ?? [],
          address_display: saved.address_display ?? "",
          min_order_amount: saved.min_order_amount != null && saved.min_order_amount > 0 ? String(saved.min_order_amount) : "",
          free_delivery_threshold: saved.free_delivery_threshold != null ? String(saved.free_delivery_threshold) : "",
          delivery_fee_flat: saved.delivery_fee_flat != null && saved.delivery_fee_flat > 0 ? String(saved.delivery_fee_flat) : "",
          delivery_fee_per_km: saved.delivery_fee_per_km != null && saved.delivery_fee_per_km > 0 ? String(saved.delivery_fee_per_km) : "",
        });

        addToast("Store settings saved successfully! ✅", "success");
      } else {
        addToast(result.error, "error");
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to save settings.", "error");
    }
    setSaving(false);
  }, [shop, form, addToast]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No shop found. Create a shop first.</p>
        <Link href="/dashboard" className="mt-3 text-sm font-medium text-emerald-600 hover:underline">Go to Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-emerald-900/40 dark:bg-black/90">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-3 py-2.5">
          <Link href="/dashboard" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800" aria-label="Back to dashboard">
            <ChevronLeftIcon />
          </Link>
          <div className="flex items-center gap-2">
            <StoreIcon />
            <h1 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Store Settings</h1>
          </div>
        </div>
      </header>

      <main className="page-stack mx-auto max-w-2xl px-3 py-4">
        {/* ── Store Branding ─────────────────────────────────────────── */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            <ImageIcon /> Store Branding
          </h2>
          <div className="trend-card space-y-3 p-3 sm:p-3.5">
            <ImageUpload
              label="Store Logo"
              currentUrl={form.logo_url}
              onUploaded={(url) => setForm((f) => ({ ...f, logo_url: url }))}
              folder="shops"
              fileId={shop.id}
              showPreview
            />
            <ImageUpload
              label="Store Banner"
              currentUrl={form.banner_url}
              onUploaded={(url) => setForm((f) => ({ ...f, banner_url: url }))}
              folder="shops"
              fileId={`${shop.id}-banner`}
              showPreview
            />
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Store Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="My Awesome Store"
                className={`w-full rounded-xl border bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 ${
                  errors.name ? "border-red-300 focus:border-red-500 focus:ring-red-500/20" : "border-zinc-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                } dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100`}
              />
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Store Bio / Description</label>
              <textarea
                rows={2}
                value={form.store_bio}
                onChange={(e) => setForm((f) => ({ ...f, store_bio: e.target.value }))}
                placeholder="Tell customers about your store..."
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 resize-none"
              />
            </div>
          </div>
        </section>

        {/* ── Business Hours & Contact ────────────────────────────────── */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            <ClockIcon /> Business Hours & Contact
          </h2>
          <div className="trend-card space-y-3 p-3 sm:p-3.5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Business Hours</label>
                <input
                  type="text"
                  value={form.business_hours}
                  onChange={(e) => setForm((f) => ({ ...f, business_hours: e.target.value }))}
                  placeholder="Mon-Sat: 9 AM - 10 PM"
                  className={`w-full rounded-xl border bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 ${
                    errors.business_hours ? "border-red-300 focus:border-red-500 focus:ring-red-500/20" : "border-zinc-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                  } dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100`}
                />
                {errors.business_hours && <p className="mt-1 text-xs text-red-500">{errors.business_hours}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Operating Status</label>
                <input
                  type="text"
                  value={form.operating_status}
                  onChange={(e) => setForm((f) => ({ ...f, operating_status: e.target.value }))}
                  placeholder="Open Today: 9 AM - 10 PM"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  <PhoneIcon /> Primary WhatsApp *
                </label>
                <input
                  type="text"
                  value={form.whatsapp_number}
                  onChange={(e) => setForm((f) => ({ ...f, whatsapp_number: e.target.value }))}
                  placeholder="923001234567"
                  className={`w-full rounded-xl border bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 ${
                    errors.whatsapp_number ? "border-red-300 focus:border-red-500 focus:ring-red-500/20" : "border-zinc-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                  } dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100`}
                />
                {errors.whatsapp_number && <p className="mt-1 text-xs text-red-500">{errors.whatsapp_number}</p>}
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  <PhoneIcon /> Secondary Phone <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.secondary_phone}
                  onChange={(e) => setForm((f) => ({ ...f, secondary_phone: e.target.value }))}
                  placeholder="923001234568"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Instagram Handle <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.instagram_handle}
                  onChange={(e) => setForm((f) => ({ ...f, instagram_handle: e.target.value }))}
                  placeholder="@yourstore"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Facebook URL <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <input
                  type="url"
                  value={form.facebook_url}
                  onChange={(e) => setForm((f) => ({ ...f, facebook_url: e.target.value }))}
                  placeholder="https://facebook.com/yourstore"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">City / Area</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Lahore, Pakistan"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>
        </section>

        {/* ── Delivery & Location ─────────────────────────────────────── */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            <MapPinIcon /> Delivery & Service Radius
          </h2>
          <div className="trend-card p-4">
            <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
              Pin your store, then choose custom radius, one city, or all over Pakistan.
              Pinning also fills City / Area with the detected address.
            </p>
            <ShopLocationRadiusPicker
              value={{
                latitude: form.latitude,
                longitude: form.longitude,
                service_radius_km: form.service_radius_km,
                address_display: form.address_display,
                location: form.location,
                delivery_zones: form.delivery_zones,
              }}
              onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
            />
          </div>
        </section>

        {/* ── Delivery Fees & Minimum Order ────────────────────────────── */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            <WalletIcon /> Delivery Fees & Minimum Order
          </h2>
          <div className="trend-card space-y-3 p-3 sm:p-3.5">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Control the smallest order you&apos;ll accept, when delivery becomes
              free, and how much extra to charge customers further away. Leave a
              field blank to disable that rule.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Minimum Order Amount (Rs.)
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.min_order_amount}
                  onChange={(e) => setForm((f) => ({ ...f, min_order_amount: e.target.value }))}
                  placeholder="e.g. 500"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <p className="mt-1 text-[0.65rem] text-zinc-400 dark:text-zinc-500">Orders below this amount can&apos;t be placed.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Free Delivery Above (Rs.)
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.free_delivery_threshold}
                  onChange={(e) => setForm((f) => ({ ...f, free_delivery_threshold: e.target.value }))}
                  placeholder="e.g. 2000"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <p className="mt-1 text-[0.65rem] text-zinc-400 dark:text-zinc-500">Orders at/above this waive all delivery charges.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Base Delivery Fee (Rs.)
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.delivery_fee_flat}
                  onChange={(e) => setForm((f) => ({ ...f, delivery_fee_flat: e.target.value }))}
                  placeholder="e.g. 100"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <p className="mt-1 text-[0.65rem] text-zinc-400 dark:text-zinc-500">Flat charge for orders under the free-delivery amount.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Extra Fee Per KM (Rs.)
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.delivery_fee_per_km}
                  onChange={(e) => setForm((f) => ({ ...f, delivery_fee_per_km: e.target.value }))}
                  placeholder="e.g. 10"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <p className="mt-1 text-[0.65rem] text-zinc-400 dark:text-zinc-500">Added on top of the base fee, per km of customer distance.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Shop QR Code ─────────────────────────────────────────────── */}
        {shop && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              <QrCodeIcon /> Shop QR Code
            </h2>
            <ShopQrCode shopId={shop.id} shopName={shop.name} />
          </section>
        )}

        {/* ── Live Toggle ─────────────────────────────────────────────── */}
        <section>
          <div className="trend-card flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Store Visibility</p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                {form.is_live ? "Your store is visible on the marketplace" : "Your store is hidden from customers"}
              </p>
            </div>
            <ToggleSwitch
              checked={form.is_live}
              onChange={() => setForm((f) => ({ ...f, is_live: !f.is_live }))}
              label="Toggle store visibility"
            />
          </div>
        </section>

        {/* ── Save Button ─────────────────────────────────────────────── */}
        <div className="pb-6">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-700 disabled:opacity-50"
          >
            <span className="flex items-center justify-center gap-2">
              <SaveIcon />
              {saving ? "Saving…" : "Save Store Settings"}
            </span>
          </button>
          <p className="mt-2 text-center text-xs text-zinc-400 dark:text-zinc-500">
            Changes are synced to the database and take effect immediately on your storefront.
          </p>
        </div>
      </main>
    </div>
  );
}