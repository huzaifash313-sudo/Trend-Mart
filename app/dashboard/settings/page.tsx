"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { updateShop } from "@/services/shopService";
import ImageUpload from "@/components/ImageUpload";
import { useToast } from "@/components/Toast";
import ToggleSwitch from "@/components/ToggleSwitch";
import ShopLocationRadiusPicker from "@/components/ShopLocationRadiusPicker";
import ShopQrCode from "@/components/ShopQrCode";
import QuickCouponPanel from "@/components/QuickCouponPanel";
import DealManager from "@/components/DealManager";
import {
  getPushPermissionState,
  isPushClientSupported,
  subscribeToPushNotifications,
} from "@/lib/pushClient";
import { useMerchantQuickAdd } from "@/context/MerchantQuickAddContext";
import { verifyPassword } from "@/services/authService";
import { PK_PHONE_PLACEHOLDER, formatPkPhoneInput } from "@/lib/phoneFormat";
import { getShopHoursSummary } from "@/lib/shopHours";
import { getShopPath } from "@/lib/shopSlug";
import type { Shop, ShopFormData } from "@/types";

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

function ClockIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
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

function MapPinIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
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

function TagIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function CalendarDealIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
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

interface ValidationErrors {
  name?: string;
  whatsapp_number?: string;
  business_hours?: string;
}

type SectionId =
  | "live"
  | "profile"
  | "hours"
  | "contact"
  | "delivery-area"
  | "fees"
  | "coupons"
  | "deals"
  | "alerts"
  | "share"
  | "more";

type PushStatus = "checking" | "unsupported" | "denied" | "enabled" | "not-enabled";

const THEME_ACCENT = "#10b981";

const SECTION_LINKS: Array<{ id: SectionId; label: string }> = [
  { id: "live", label: "Live" },
  { id: "profile", label: "Profile" },
  { id: "hours", label: "Hours" },
  { id: "contact", label: "Contact" },
  { id: "delivery-area", label: "Delivery area" },
  { id: "fees", label: "Fees" },
  { id: "coupons", label: "Coupons" },
  { id: "deals", label: "Deals" },
  { id: "alerts", label: "Alerts" },
  { id: "share", label: "Share" },
  { id: "more", label: "More" },
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
  };
}

function validateSettings(form: ShopFormData): ValidationErrors {
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

function TextArea({
  error,
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string }) {
  return (
    <textarea
      className={`${inputClasses(!!error)} min-h-[92px] resize-none leading-relaxed ${className}`}
      {...props}
    />
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1.5 text-xs font-medium text-red-500">{message}</p> : null;
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
  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState<Shop | null>(null);
  const [form, setForm] = useState<ShopFormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [saving, setSaving] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushStatus>("checking");
  const [pushBusy, setPushBusy] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [locationUnlocked, setLocationUnlocked] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const { addToast } = useToast();
  const { openQuickAdd } = useMerchantQuickAdd();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (cancelled) {
          setLoading(false);
          return;
        }

        if (!user) {
          setShop(null);
          setLoading(false);
          return;
        }

        const { fetchMyShop } = await import("@/services/shopService");
        const result = await fetchMyShop();

        if (cancelled) return;

        if (result.success && result.data) {
          setShop(result.data);
          setForm(shopToForm(result.data));
        } else if (!result.success) {
          addToast(result.error || "Could not load your store settings.", "error");
        }
      } catch (err) {
        if (!cancelled) {
          addToast(
            err instanceof Error ? err.message : "Could not load store settings.",
            "error",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [addToast]);

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

  const hoursSummary = useMemo(
    () =>
      getShopHoursSummary({
        business_hours: form.business_hours,
        operating_status: form.operating_status,
      }),
    [form.business_hours, form.operating_status],
  );

  const shareUrl = useMemo(() => {
    if (!shop) return "";
    const shopPath = getShopPath({ id: shop.id, name: shop.name, slug: shop.slug });
    if (typeof window === "undefined") return shopPath;
    return `${window.location.origin}${shopPath}`;
  }, [shop]);

  const hasLocationPin = form.latitude != null && form.longitude != null;
  const locationLocked = hasLocationPin && !locationUnlocked;

  const handleUnlockLocation = useCallback(async () => {
    if (!unlockPassword.trim()) {
      setUnlockError("Enter your account password to unlock the location.");
      return;
    }
    setUnlocking(true);
    setUnlockError(null);
    const result = await verifyPassword(unlockPassword);
    if (result.success) {
      setLocationUnlocked(true);
      setUnlockPassword("");
      addToast("Location unlocked — you can now update the store pin.", "success");
    } else {
      setUnlockError(result.error || "Incorrect password. Please try again.");
    }
    setUnlocking(false);
  }, [unlockPassword, addToast]);

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
      };

      const result = await updateShop(shop.id, shopFormFields);
      if (result.success) {
        setShop(result.data);
        setForm(shopToForm(result.data));
        setLocationUnlocked(false);
        setUnlockPassword("");
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
  }, [shop, form, addToast]);

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
          ? "Push alerts are not supported or VAPID is not configured."
          : result.reason === "denied"
            ? "Notifications are blocked for this browser."
            : "Could not enable order alerts. Please try again.",
        "error",
      );
    }

    setPushBusy(false);
  }, [addToast]);

  const handleCopyShareLink = useCallback(async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShareLink(true);
      addToast("Shop link copied.", "success");
      window.setTimeout(() => setCopiedShareLink(false), 1800);
    } catch {
      addToast("Could not copy the shop link.", "error");
    }
  }, [shareUrl, addToast]);

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
        </SectionShell>

        <SectionShell
          id="profile"
          icon={<StoreIcon />}
          title="Profile"
          helper="The basic shop details customers see first on your storefront."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ImageUpload
              label="Store logo"
              currentUrl={form.logo_url}
              onUploaded={(url) => setForm((current) => ({ ...current, logo_url: url }))}
              folder="shops"
              fileId={shop.id}
              fallbackType="shop"
              showPreview
            />
            <ImageUpload
              label="Store banner"
              currentUrl={form.banner_url}
              onUploaded={(url) => setForm((current) => ({ ...current, banner_url: url }))}
              folder="shops"
              fileId={`${shop.id}-banner`}
              fallbackType="shop"
              showPreview
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel>Store name *</FieldLabel>
              <TextInput
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                placeholder="My Awesome Store"
                error={errors.name}
              />
              <FieldError message={errors.name} />
            </div>
            <div>
              <FieldLabel>Category</FieldLabel>
              <TextInput
                type="text"
                value={form.category}
                readOnly
                className="cursor-not-allowed bg-zinc-50 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
              />
              <p className="mt-1.5 text-[0.7rem] leading-relaxed text-zinc-400 dark:text-zinc-500">
                Category is kept fixed so customer filters stay accurate.
              </p>
            </div>
          </div>

          <div>
            <FieldLabel>Store bio</FieldLabel>
            <TextArea
              rows={3}
              value={form.store_bio}
              onChange={(e) => setForm((current) => ({ ...current, store_bio: e.target.value }))}
              placeholder="Tell customers what you sell, your specialties, and why they should order from you."
            />
            <p className="mt-1.5 text-[0.7rem] leading-relaxed text-zinc-400 dark:text-zinc-500">
              Shown clearly on your public store page under “About this store”.
            </p>
          </div>

          <div>
            <FieldLabel>City / area (shop card text)</FieldLabel>
            <TextInput
              type="text"
              value={form.location}
              onChange={(e) => setForm((current) => ({ ...current, location: e.target.value }))}
              placeholder="Bahaar Colony, Gujranwala"
            />
            <p className="mt-1.5 text-[0.7rem] leading-relaxed text-zinc-400 dark:text-zinc-500">
              Fixed shop address shown to customers. This is not the customer&apos;s live GPS — change only if the shop moves.
            </p>
          </div>
        </SectionShell>

        <SectionShell
          id="hours"
          icon={<ClockIcon />}
          title="Hours"
          helper="Set simple timing text and a clear open or closed status."
        >
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/25">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                  hoursSummary.state === "open"
                    ? "bg-emerald-600 text-white"
                    : hoursSummary.state === "closed"
                      ? "bg-red-600 text-white"
                      : "bg-zinc-700 text-white"
                }`}
              >
                {hoursSummary.label}
              </span>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Live preview for customers
              </p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
              {hoursSummary.hoursText}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel>Business hours text</FieldLabel>
              <TextInput
                type="text"
                value={form.business_hours}
                onChange={(e) => setForm((current) => ({ ...current, business_hours: e.target.value }))}
                placeholder="Mon-Sat: 9 AM - 10 PM"
                error={errors.business_hours}
              />
              <FieldError message={errors.business_hours} />
            </div>

            <div>
              <FieldLabel>Open / Closed</FieldLabel>
              <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-elevated)]">
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                  {form.operating_status.toLowerCase().includes("closed") ? "Closed" : "Open"}
                </p>
                <ToggleSwitch
                  checked={!form.operating_status.toLowerCase().includes("closed")}
                  onChange={(open) =>
                    setForm((current) => ({
                      ...current,
                      operating_status: open ? "Open" : "Closed",
                    }))
                  }
                  label="Shop open or closed"
                />
              </div>
              <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                This switch is what customers see. Hours text is display-only.
              </p>
            </div>
          </div>
        </SectionShell>

        <SectionShell
          id="contact"
          icon={<PhoneIcon />}
          title="Contact"
          helper="Keep customer contact channels clean and easy to tap."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel>WhatsApp *</FieldLabel>
              <TextInput
                type="tel"
                inputMode="tel"
                value={form.whatsapp_number}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    whatsapp_number: formatPkPhoneInput(e.target.value),
                  }))
                }
                placeholder={PK_PHONE_PLACEHOLDER}
                error={errors.whatsapp_number}
              />
              <FieldError message={errors.whatsapp_number} />
            </div>
            <div>
              <FieldLabel optional>Secondary phone</FieldLabel>
              <TextInput
                type="tel"
                inputMode="tel"
                value={form.secondary_phone}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    secondary_phone: formatPkPhoneInput(e.target.value),
                  }))
                }
                placeholder={PK_PHONE_PLACEHOLDER}
              />
            </div>
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
                placeholder="@yourstore or tiktok.com/@yourstore"
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
                placeholder="https://facebook.com/yourstore"
              />
            </div>
          </div>
        </SectionShell>

        <SectionShell
          id="delivery-area"
          icon={<MapPinIcon />}
          title="Delivery area"
          helper="Your shop’s fixed dispatch pin. Customers’ GPS stays dynamic for distance — yours only changes here when the dukaan moves."
        >
          <div className="mb-3 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2.5 text-[0.75rem] leading-relaxed text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            Set once carefully. Orders leave from this pin. Avoid changing it daily — update only if you relocate the store.
          </div>
          {locationLocked ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-700 dark:bg-zinc-900/60">
                <span className="mt-0.5 text-zinc-500 dark:text-zinc-400">
                  <LockIcon />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    Store location is locked
                  </p>
                  <p className="mt-0.5 text-[0.7rem] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {form.address_display?.trim() || form.location?.trim() || "No address set"}
                  </p>
                  {hasLocationPin && (
                    <p className="mt-1 text-[0.6rem] text-zinc-400 dark:text-zinc-500">
                      Lat {form.latitude?.toFixed(5)} · Lng {form.longitude?.toFixed(5)}
                    </p>
                  )}
                  <p className="mt-2 text-[0.7rem] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    Your pin stays fixed so every customer sees one consistent store location.
                    Enter your password below to change it.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-3.5 dark:border-amber-900/50 dark:bg-amber-950/20">
                <label
                  htmlFor="location-unlock-password"
                  className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300"
                >
                  Enter your password to unlock location
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="location-unlock-password"
                    type="password"
                    value={unlockPassword}
                    onChange={(e) => {
                      setUnlockPassword(e.target.value);
                      setUnlockError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleUnlockLocation();
                      }
                    }}
                    placeholder="Your account password"
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={handleUnlockLocation}
                    disabled={unlocking}
                    className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {unlocking ? "Verifying…" : "Unlock location"}
                  </button>
                </div>
                {unlockError ? (
                  <p className="mt-1.5 text-xs font-medium text-red-500">{unlockError}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <ShopLocationRadiusPicker
              value={{
                latitude: form.latitude,
                longitude: form.longitude,
                service_radius_km: form.service_radius_km,
                address_display: form.address_display,
                location: form.location,
                delivery_zones: form.delivery_zones,
              }}
              onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
            />
          )}
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
              placeholder="e.g. 500"
            />
            <MoneyInput
              label="Free delivery above (Rs.)"
              helper="Orders at or above this amount get delivery free."
              value={form.free_delivery_threshold}
              onChange={(value) => setForm((current) => ({ ...current, free_delivery_threshold: value }))}
              placeholder="e.g. 2000"
            />
            <MoneyInput
              label="Flat delivery fee (Rs.)"
              helper="Base delivery fee before any distance charge."
              value={form.delivery_fee_flat}
              onChange={(value) => setForm((current) => ({ ...current, delivery_fee_flat: value }))}
              placeholder="e.g. 100"
            />
            <MoneyInput
              label="Per-km delivery fee (Rs.)"
              helper="Extra fee added for each km of customer distance."
              value={form.delivery_fee_per_km}
              onChange={(value) => setForm((current) => ({ ...current, delivery_fee_per_km: value }))}
              placeholder="e.g. 10"
            />
          </div>
        </SectionShell>

        <SectionShell
          id="coupons"
          icon={<TagIcon />}
          title="Coupons"
          helper="Discount codes for checkout. Also available from the bottom + Quick add."
        >
          {shop ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() =>
                  openQuickAdd({ shopId: shop.id, shopCategory: shop.category, tab: "coupon" })
                }
                className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Open Quick add → Coupon
              </button>
              <QuickCouponPanel shopId={shop.id} />
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Load your shop first.</p>
          )}
        </SectionShell>

        <SectionShell
          id="deals"
          icon={<CalendarDealIcon />}
          title="Deals"
          helper="Weekly days, date ranges, or monthly dates — banners + Offer days filters."
        >
          {shop ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() =>
                  openQuickAdd({ shopId: shop.id, shopCategory: shop.category, tab: "deal" })
                }
                className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Open Quick add → Deal
              </button>
              <DealManager shopId={shop.id} />
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Load your shop first.</p>
          )}
        </SectionShell>

        <SectionShell
          id="alerts"
          icon={<BellIcon />}
          title="Alerts"
          helper="Get a ping when a new order arrives. Needs NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY."
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
          id="share"
          icon={<QrCodeIcon />}
          title="Share"
          helper="Print your QR or copy a link to send customers straight to your shop."
        >
          <ShopQrCode shopId={shop.id} shopName={shop.name} />

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/70">
            <FieldLabel>Shareable shop link</FieldLabel>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="min-h-11 flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-xs leading-relaxed text-zinc-600 break-all dark:border-zinc-700 dark:bg-[color:var(--tm-elevated)] dark:text-zinc-300">
                {shareUrl}
              </div>
              <button
                type="button"
                onClick={handleCopyShareLink}
                disabled={!shareUrl}
                className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-900 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
              >
                {copiedShareLink ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        </SectionShell>

        <SectionShell
          id="more"
          icon={<ChevronRightIcon />}
          title="More"
          helper="Extra tools that help you review store activity."
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
