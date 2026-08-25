"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import Link from "next/link";
import { updateShop } from "@/services/shopService";
import { useToast } from "@/components/Toast";
import ToggleSwitch from "@/components/ToggleSwitch";
import ShopQrCode from "@/components/ShopQrCode";
import {
  getPushPermissionState,
  isPushClientSupported,
  subscribeToPushNotifications,
} from "@/lib/pushClient";
import { useMyShop } from "@/lib/queries";
import type { Shop, ShopFormData } from "@/types";
import { PRODUCT_CATEGORIES } from "@/types";
import CustomSelect from "@/components/CustomSelect";
import ShopLocationRadiusPicker from "@/components/ShopLocationRadiusPicker";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                     */
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
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l1.12-5.6A1 1 0 0 1 5.1 3h13.8a1 1 0 0 1 .98.8L21 9" />
      <path d="M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9" />
      <path d="M9 21V9h6v12" />
    </svg>
  );
}

function AtIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
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

function BellIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function QrCodeIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <path d="M14 14h3v3h-3zM20 14v3M14 20h3M17 20h3v.01" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Constants and helpers                                                     */
/* -------------------------------------------------------------------------- */

type SectionId =
  | "live"
  | "social"
  | "fees"
  | "area"
  | "alerts"
  | "qr"
  | "audit-logs";

type PushStatus = "checking" | "unsupported" | "denied" | "enabled" | "not-enabled";

const THEME_ACCENT = "#10b981";

const SECTION_LINKS: Array<{ id: SectionId; label: string }> = [
  { id: "live", label: "Live" },
  { id: "social", label: "Social" },
  { id: "fees", label: "Fees" },
  { id: "area", label: "Area" },
  { id: "alerts", label: "Alerts" },
  { id: "qr", label: "QR" },
  { id: "audit-logs", label: "Audit logs" },
];

const INITIAL_FORM: ShopFormData = {
  name: "",
  category: "Others / Universal",
  location: "",
  whatsapp_number: "",
  logo_url: "",
  banner_url: "",
  is_live: false,
  instagram_handle: "",
  facebook_url: "",
  tiktok_handle: "",
  secondary_phone: "",
  business_hours: "",
  operating_status: "Open",
  accent_color: THEME_ACCENT,
  store_bio: "",
  announcement: "",
  announcement_expires_at: "",
  service_area: "",
  hourly_rate: "",
  call_out_charge: "",
  emergency_available: false,
  shop_type: "retail",
  latitude: null,
  longitude: null,
  service_radius_km: 10,
  delivery_zones: [],
  address_display: "",
  min_order_amount: "",
  free_delivery_threshold: "",
  delivery_fee_flat: "",
  delivery_fee_per_km: "",
  accepts_delivery: true,
  accepts_pickup: true,
};

function shopToForm(source: Shop): ShopFormData {
  return {
    name: source.name,
    category: source.category,
    location: source.location,
    whatsapp_number: source.whatsapp_number,
    logo_url: source.logo_url ?? "",
    banner_url: source.banner_url ?? "",
    is_live: source.is_live,
    instagram_handle: source.instagram_handle ?? "",
    facebook_url: source.facebook_url ?? "",
    tiktok_handle: source.tiktok_handle ?? "",
    secondary_phone: source.secondary_phone ?? "",
    business_hours: source.business_hours ?? "",
    operating_status: source.operating_status?.trim() || "Open",
    accent_color: THEME_ACCENT,
    store_bio: source.store_bio ?? "",
    announcement: source.announcement ?? "",
    announcement_expires_at: source.announcement_expires_at ?? "",
    service_area: source.service_area ?? "",
    hourly_rate: source.hourly_rate != null ? String(source.hourly_rate) : "",
    call_out_charge: source.call_out_charge != null ? String(source.call_out_charge) : "",
    emergency_available: source.emergency_available ?? false,
    shop_type: source.shop_type ?? "retail",
    latitude: source.latitude ?? null,
    longitude: source.longitude ?? null,
    service_radius_km: source.service_radius_km ?? 10,
    delivery_zones: source.delivery_zones ?? [],
    address_display: source.address_display ?? "",
    min_order_amount:
      source.min_order_amount != null && source.min_order_amount > 0
        ? String(source.min_order_amount)
        : "",
    free_delivery_threshold:
      source.free_delivery_threshold != null
        ? String(source.free_delivery_threshold)
        : "",
    delivery_fee_flat:
      source.delivery_fee_flat != null && source.delivery_fee_flat > 0
        ? String(source.delivery_fee_flat)
        : "",
    delivery_fee_per_km:
      source.delivery_fee_per_km != null && source.delivery_fee_per_km > 0
        ? String(source.delivery_fee_per_km)
        : "",
    accepts_delivery: source.accepts_delivery ?? true,
    accepts_pickup: source.accepts_pickup ?? true,
  };
}

function sectionScroll(id: SectionId) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function inputClasses(hasError?: boolean) {
  return [
    "w-full rounded-2xl border bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition",
    "placeholder:text-zinc-300/50 focus:ring-2",
    "dark:bg-[color:var(--tm-elevated)] dark:text-zinc-100 dark:placeholder:text-zinc-500/40",
    hasError
      ? "border-red-300 focus:border-red-500 focus:ring-red-500/20 dark:border-red-800"
      : "border-zinc-200 focus:border-emerald-500 focus:ring-emerald-500/20 dark:border-[color:var(--tm-border)]",
  ].join(" ");
}

function FieldLabel({
  children,
  optional = false,
}: {
  children: ReactNode;
  optional?: boolean;
}) {
  return (
    <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
      {children}
      {optional ? (
        <span className="ml-1 font-normal text-zinc-400 dark:text-zinc-500">(optional)</span>
      ) : null}
    </label>
  );
}

function TextInput({
  error,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return <input className={`${inputClasses(!!error)} ${className}`} {...props} />;
}

function SectionShell({
  id,
  icon,
  title,
  helper,
  children,
}: {
  id: SectionId;
  icon: ReactNode;
  title: string;
  helper: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-36">
      <div className="mb-3 flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
          {icon}
        </div>
        <div>
          <h2 className="text-base font-bold text-zinc-950 dark:text-zinc-50">{title}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            {helper}
          </p>
        </div>
      </div>
      <div className="trend-card space-y-4 p-4 sm:p-5">{children}</div>
    </section>
  );
}

function MoneyInput({
  label,
  helper,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  helper: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <TextInput
        type="number"
        min={0}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <p className="mt-1.5 text-[0.7rem] leading-relaxed text-zinc-400 dark:text-zinc-500">
        {helper}
      </p>
    </div>
  );
}

function PushStatusBadge({ status }: { status: PushStatus }) {
  const labelByStatus: Record<PushStatus, string> = {
    checking: "Checking",
    unsupported: "Unsupported",
    denied: "Denied",
    enabled: "Enabled",
    "not-enabled": "Not enabled",
  };
  const tone =
    status === "enabled"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
      : status === "denied"
        ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
        : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>
      {labelByStatus[status]}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function DashboardSettingsPage() {
  // React Query keeps the previous shop cached (keepPreviousData) so the page
  // renders instantly on repeat visits — no blank flash while data reloads.
  const myShopQuery = useMyShop();
  const shop = myShopQuery.data ?? null;
  const loading = myShopQuery.isLoading && !shop;

  const [form, setForm] = useState<ShopFormData>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushStatus>("checking");
  const [pushBusy, setPushBusy] = useState(false);
  const { addToast } = useToast();

  // Live delivery-charge preview — mirrors what the customer sees at checkout.
  // Free-delivery offer applies above the threshold; otherwise flat + per-km.
  const feePreview = useMemo(() => {
    const flat = Number(form.delivery_fee_flat) || 0;
    const perKm = Number(form.delivery_fee_per_km) || 0;
    const freeThreshold = Number(form.free_delivery_threshold) || 0;
    const minOrder = Number(form.min_order_amount) || 0;
    const radius = form.service_radius_km ?? 10;
    const feeAt = (km: number) => {
      if (freeThreshold > 0) return { label: "FREE", hint: "above free-delivery offer" };
      const amount = Math.round((flat + perKm * km) * 100) / 100;
      return { label: amount > 0 ? `Rs. ${amount.toLocaleString()}` : "FREE", hint: amount > 0 ? "delivery charge" : "no charge set" };
    };
    const samples = [2, 5, radius === 2 || radius === 5 ? radius + 1 : radius]
      .filter((km, i, arr) => arr.indexOf(km) === i)
      .slice(0, 3);
    return { flat, perKm, freeThreshold, minOrder, radius, samples, feeAt };
  }, [form.delivery_fee_flat, form.delivery_fee_per_km, form.free_delivery_threshold, form.min_order_amount, form.service_radius_km]);

  // Seed the editable form from the shop once it's available (on first load or
  // when switching shops). We intentionally key on the id so an in-progress
  // edit isn't clobbered by a background refetch.
  useEffect(() => {
    if (shop) setForm(shopToForm(shop));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop?.id]);

  const refreshPushStatus = useCallback(async () => {
    if (typeof window === "undefined") return;

    if (!isPushClientSupported()) {
      setPushStatus("unsupported");
      return;
    }

    const permission = await getPushPermissionState();
    if (permission === "unsupported") {
      setPushStatus("unsupported");
      return;
    }
    if (permission === "denied") {
      setPushStatus("denied");
      return;
    }
    if (permission !== "granted") {
      setPushStatus("not-enabled");
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setPushStatus(subscription ? "enabled" : "not-enabled");
    } catch {
      setPushStatus("not-enabled");
    }
  }, []);

  useEffect(() => {
    refreshPushStatus();
  }, [refreshPushStatus]);

  const handleSave = useCallback(async () => {
    if (!shop) return;

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
        tiktok_handle: form.tiktok_handle,
        secondary_phone: form.secondary_phone,
        business_hours: form.business_hours,
        operating_status: form.operating_status,
        accent_color: THEME_ACCENT,
        store_bio: form.store_bio,
        announcement: form.announcement,
        announcement_expires_at: shop.announcement_expires_at ?? "",
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
        accepts_delivery: form.accepts_delivery,
        accepts_pickup: form.accepts_pickup,
      };

      const result = await updateShop(shop.id, shopFormFields);
      if (result.success) {
        setForm(shopToForm(result.data));
        // Invalidate the cached shop so the storefront reflects changes instantly.
        myShopQuery.refetch();
        addToast("Store settings saved successfully.", "success");
        // Invalidate the storefront cache so homepage/cards reflect changes.
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("trendmart:shops-updated"));
        }
      } else {
        addToast(result.error, "error");
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to save settings.", "error");
    } finally {
      setSaving(false);
    }
  }, [shop, form, addToast, myShopQuery]);

  const handleEnablePush = useCallback(async () => {
    setPushBusy(true);
    setPushStatus("checking");
    const result = await subscribeToPushNotifications();

    if (result.ok) {
      setPushStatus("enabled");
      addToast("Order alerts enabled on this device.", "success");
    } else {
      const nextStatus: PushStatus =
        result.reason === "unsupported"
          ? "unsupported"
          : result.reason === "denied"
            ? "denied"
            : "not-enabled";
      setPushStatus(nextStatus);
      addToast(
        result.reason === "unsupported"
          ? "Push alerts are not supported on this device."
          : result.reason === "denied"
            ? "Notifications are blocked for this browser."
            : "Could not enable order alerts. Please try again.",
        "error",
      );
    }

    setPushBusy(false);
  }, [addToast]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 text-center dark:bg-[color:var(--tm-surface)]">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No shop found. Create a shop first.</p>
        <Link href="/dashboard" className="mt-3 text-sm font-medium text-emerald-600 hover:underline">
          Go to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 pb-safe-nav dark:bg-[color:var(--tm-bg)]">
      <div className="sticky top-[var(--tm-navbar-sticky-offset)] z-40 border-b border-zinc-200 bg-white/95 shadow-sm backdrop-blur-xl dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)]/95">
        <header className="mx-auto flex max-w-4xl items-center gap-3 px-3 py-2.5 sm:px-4">
          <Link
            href="/dashboard"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            aria-label="Back to dashboard"
          >
            <ChevronLeftIcon />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
              TrendMart merchant
            </p>
            <h1 className="truncate text-base font-bold text-zinc-950 dark:text-zinc-50">
              Store settings
            </h1>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <SaveIcon />
            <span>{saving ? "Saving" : "Save"}</span>
          </button>
        </header>

        <nav className="mx-auto max-w-4xl overflow-x-auto px-3 pb-3 sm:px-4" aria-label="Settings sections">
          <div className="flex min-w-max gap-2">
            {SECTION_LINKS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => sectionScroll(section.id)}
                className="rounded-full border border-emerald-100 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:border-emerald-700"
              >
                {section.label}
              </button>
            ))}
          </div>
        </nav>
      </div>

      <main className="mx-auto max-w-4xl space-y-7 px-3 py-5 sm:px-4 sm:py-6">
        <SectionShell
          id="live"
          icon={<StoreIcon />}
          title="Live"
          helper="Decide whether customers can discover this store right now."
        >
          <div className="flex items-start justify-between gap-4 rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950/25">
            <div className="min-w-0">
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
                Store visibility
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                {form.is_live
                  ? "Your dukaan is live on TrendMart. Customers can browse and place orders."
                  : "Your dukaan is hidden from customers while you make changes."}
              </p>
            </div>
            <ToggleSwitch
              checked={form.is_live}
              onChange={(checked) => setForm((current) => ({ ...current, is_live: checked }))}
              label="Toggle store visibility"
            />
          </div>

          <div>
            <FieldLabel>Category</FieldLabel>
            <CustomSelect
              value={form.category}
              onChange={(value) => setForm((current) => ({ ...current, category: value }))}
              options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }))}
              ariaLabel="Store category"
            />
            <p className="mt-1.5 text-[0.7rem] leading-relaxed text-zinc-400 dark:text-zinc-500">
              Customers find your store under this category.
            </p>
          </div>
        </SectionShell>

        <SectionShell
          id="social"
          icon={<AtIcon />}
          title="Social"
          helper="Instagram, TikTok and Facebook links shown on your storefront."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel optional>Instagram</FieldLabel>
              <TextInput
                type="text"
                value={form.instagram_handle}
                onChange={(e) => setForm((current) => ({ ...current, instagram_handle: e.target.value }))}
                placeholder="@yourstore"
              />
            </div>
            <div>
              <FieldLabel optional>TikTok</FieldLabel>
              <TextInput
                type="text"
                value={form.tiktok_handle}
                onChange={(e) => setForm((current) => ({ ...current, tiktok_handle: e.target.value }))}
                placeholder="Username"
              />
              <p className="mt-1 text-[0.7rem] text-zinc-400 dark:text-zinc-500">
                Customers can open your TikTok profile from the store page.
              </p>
            </div>
            <div>
              <FieldLabel optional>Facebook</FieldLabel>
              <TextInput
                type="url"
                value={form.facebook_url}
                onChange={(e) => setForm((current) => ({ ...current, facebook_url: e.target.value }))}
                placeholder="Facebook link"
              />
            </div>
          </div>
        </SectionShell>

        <SectionShell
          id="fees"
          icon={<WalletIcon />}
          title="Fees"
          helper="Set order limits and delivery charges without touching product stock."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <MoneyInput
              label="Minimum order amount (Rs.)"
              helper="Orders below this amount cannot be placed."
              value={form.min_order_amount}
              onChange={(value) => setForm((current) => ({ ...current, min_order_amount: value }))}
              placeholder="Minimum order"
            />
            <MoneyInput
              label="Free delivery above (Rs.)"
              helper="Orders at or above this amount get delivery free."
              value={form.free_delivery_threshold}
              onChange={(value) => setForm((current) => ({ ...current, free_delivery_threshold: value }))}
              placeholder="Free delivery threshold"
            />
            <MoneyInput
              label="Flat delivery fee (Rs.)"
              helper="Base delivery fee before any distance charge."
              value={form.delivery_fee_flat}
              onChange={(value) => setForm((current) => ({ ...current, delivery_fee_flat: value }))}
              placeholder="Delivery fee"
            />
            <MoneyInput
              label="Per-km delivery fee (Rs.)"
              helper="Extra fee added for each km of customer distance."
              value={form.delivery_fee_per_km}
              onChange={(value) => setForm((current) => ({ ...current, delivery_fee_per_km: value }))}
              placeholder="Radius"
            />
          </div>

          {/* Live auto-calc preview of what customers will be charged */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <p className="mb-2 text-[0.7rem] font-semibold text-emerald-800 dark:text-emerald-300">
              Live delivery-charge preview
            </p>
            <div className="flex flex-wrap gap-1.5">
              {feePreview.samples.map((km) => {
                const sample = feePreview.feeAt(km);
                return (
                  <span
                    key={km}
                    className="inline-flex flex-col rounded-lg bg-white px-2.5 py-1.5 text-[0.7rem] font-semibold text-emerald-800 shadow-sm dark:bg-zinc-900 dark:text-emerald-300"
                  >
                    <span>{km} km</span>
                    <span className="font-bold">{sample.label}</span>
                    <span className="text-[0.6rem] font-normal text-zinc-500 dark:text-zinc-400">
                      {sample.hint}
                    </span>
                  </span>
                );
              })}
              {feePreview.freeThreshold > 0 && (
                <span className="inline-flex flex-col rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[0.7rem] font-semibold text-white shadow-sm">
                  <span>Offer</span>
                  <span className="font-bold">FREE</span>
                  <span className="text-[0.6rem] font-normal text-emerald-100">
                    above Rs. {feePreview.freeThreshold.toLocaleString()}
                  </span>
                </span>
              )}
            </div>
            <p className="mt-2 text-[0.65rem] leading-relaxed text-emerald-700/90 dark:text-emerald-300/80">
              {feePreview.perKm > 0
                ? `Auto-calculated: flat Rs. ${feePreview.flat.toLocaleString()} + Rs. ${feePreview.perKm} × customer distance${feePreview.freeThreshold > 0 ? ` — FREE above Rs. ${feePreview.freeThreshold.toLocaleString()}` : ""}.`
                : feePreview.flat > 0
                  ? `Flat delivery charge of Rs. ${feePreview.flat.toLocaleString()}${feePreview.freeThreshold > 0 ? `, FREE above Rs. ${feePreview.freeThreshold.toLocaleString()}` : ""}.`
                  : "No delivery fee set — delivery will show as FREE."}
              {feePreview.minOrder > 0
                ? ` Minimum order: Rs. ${feePreview.minOrder.toLocaleString()}.`
                : ""}
            </p>
          </div>

          {/* Fulfillment channels — pause any channel, dine-in stays live */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-800">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Delivery 🚚
                </p>
                <p className="text-[0.65rem] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {form.accepts_delivery
                    ? "On — customers can order delivery"
                    : "Off — delivery hidden at checkout (dine-in stays live)"}
                </p>
              </div>
              <ToggleSwitch
                checked={form.accepts_delivery}
                onChange={(v) => setForm((current) => ({ ...current, accepts_delivery: v }))}
                label="Accept delivery orders"
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-800">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Self-pickup 🛍️
                </p>
                <p className="text-[0.65rem] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {form.accepts_pickup
                    ? "On — customers can order and pick up"
                    : "Off — pickup hidden at checkout"}
                </p>
              </div>
              <ToggleSwitch
                checked={form.accepts_pickup}
                onChange={(v) => setForm((current) => ({ ...current, accepts_pickup: v }))}
                label="Accept pickup orders"
              />
            </div>
          </div>
        </SectionShell>

        <SectionShell
          id="area"
          icon={<StoreIcon />}
          title="Delivery area"
          helper="Where your dukaan delivers — pin your location, set a radius, or cover a whole city / nationwide. Save anytime."
        >
          <ShopLocationRadiusPicker
            value={{
              latitude: form.latitude,
              longitude: form.longitude,
              service_radius_km: form.service_radius_km ?? 10,
              address_display: form.address_display,
              location: form.location,
              delivery_zones: form.delivery_zones,
            }}
            onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
          />
        </SectionShell>

        <SectionShell
          id="alerts"
          icon={<BellIcon />}
          title="Alerts"
          helper="Get a ping when a new order arrives."
        >
          <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/70 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
                  Order push notifications
                </p>
                <PushStatusBadge status={pushStatus} />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                Enable alerts for this browser only. Other phones or laptops need their own setup.
              </p>
            </div>
            <button
              type="button"
              onClick={handleEnablePush}
              disabled={pushBusy || pushStatus === "unsupported" || pushStatus === "denied"}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {pushBusy ? "Enabling..." : "Enable order alerts on this device"}
            </button>
          </div>
        </SectionShell>

        <SectionShell
          id="qr"
          icon={<QrCodeIcon />}
          title="QR"
          helper="Print your QR so customers scan straight to your shop."
        >
          <ShopQrCode shopId={shop.id} shopName={shop.name} />
        </SectionShell>

        <SectionShell
          id="audit-logs"
          icon={<ChevronRightIcon />}
          title="Audit logs"
          helper="Review store activity history."
        >
          <Link
            href="/dashboard/settings/audit-logs"
            className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-emerald-300 hover:bg-emerald-50/60 dark:border-zinc-700 dark:bg-[color:var(--tm-elevated)] dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20"
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-zinc-950 dark:text-zinc-50">Audit logs</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                View product add history with search and pagination.
              </p>
            </div>
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              <ChevronRightIcon />
            </span>
          </Link>
        </SectionShell>

        <div className="mb-24 pb-8 md:mb-0">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <SaveIcon />
            {saving ? "Saving settings..." : "Save store settings"}
          </button>
          <p className="mt-2 text-center text-xs text-zinc-400 dark:text-zinc-500">
            Changes sync to TrendMart and take effect on your storefront after save.
          </p>
        </div>
      </main>
    </div>
  );
}
