"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import type { Shop, ShopFormData } from "@/types";
import { PRODUCT_CATEGORIES } from "@/types";
import { updateShopProfile, sensitiveInfoLockedUntil } from "@/services/shopService";
import { verifyPassword } from "@/services/authService";
import { normalizePkPhoneDigits } from "@/lib/sanitization";
import ImageUpload from "@/components/ImageUpload";
import ToggleSwitch from "@/components/ToggleSwitch";
import CustomSelect from "@/components/CustomSelect";
import ShopLocationRadiusPicker from "@/components/ShopLocationRadiusPicker";
import { useToast } from "@/components/Toast";

/* -------------------------------------------------------------------------- */
/*  ShopProfileEditorModal — edit the store profile right on the storefront.  */
/*                                                                             */
/*  Sensitive fields (name, whatsapp number, other number) are locked to one   */
/*  change per week AND require the account password. The password field only  */
/*  appears the moment those locked fields are edited once the weekly window   */
/*  has passed — every other field (category, location, hours, bio, logo,      */
/*  banner) is always free with no password prompt.                            */
/* -------------------------------------------------------------------------- */

interface ShopProfileEditorModalProps {
  shop: Shop;
  onClose: () => void;
  onSaved: () => void;
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/** Build a full ShopFormData from a Shop, preserving every non-edited field. */
function shopToFormData(source: Shop): ShopFormData {
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
    accent_color: source.accent_color ?? "#10b981",
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
    free_delivery_areas: source.free_delivery_areas ?? [],
    accepts_delivery: source.accepts_delivery ?? true,
    accepts_pickup: source.accepts_pickup ?? true,
  };
}

export default function ShopProfileEditorModal({
  shop,
  onClose,
  onSaved,
}: ShopProfileEditorModalProps) {
  const { addToast } = useToast();

  const [name, setName] = useState(shop.name ?? "");
  const [category, setCategory] = useState(shop.category ?? "");
  const [whatsapp, setWhatsapp] = useState(shop.whatsapp_number ?? "");
  const [secondaryPhone, setSecondaryPhone] = useState(shop.secondary_phone ?? "");
  const [location, setLocation] = useState(shop.location ?? "");
  const [businessHours, setBusinessHours] = useState(shop.business_hours ?? "");
  const [bio, setBio] = useState(shop.store_bio ?? "");
  const [logoUrl, setLogoUrl] = useState(shop.logo_url ?? "");
  const [bannerUrl, setBannerUrl] = useState(shop.banner_url ?? "");
  const [isOpen, setIsOpen] = useState(
    !(shop.operating_status ?? "Open").toLowerCase().includes("closed"),
  );
  const [acceptsDelivery, setAcceptsDelivery] = useState(shop.accepts_delivery ?? true);
  const [acceptsPickup, setAcceptsPickup] = useState(shop.accepts_pickup ?? true);
  const [latitude, setLatitude] = useState<number | null>(shop.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(shop.longitude ?? null);
  const [serviceRadiusKm, setServiceRadiusKm] = useState(shop.service_radius_km ?? 10);
  const [addressDisplay, setAddressDisplay] = useState(shop.address_display ?? "");
  const [deliveryZones, setDeliveryZones] = useState<string[]>(shop.delivery_zones ?? []);

  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Did any sensitive field change vs the stored shop?
  // Only name + phone numbers are weekly-locked. Everything else (category,
  // location, hours, bio, logo, banner) is free and never needs a password.
  const sensitiveChanged = useMemo(() => {
    return (
      name.trim() !== (shop.name ?? "").trim() ||
      whatsapp.trim() !== (shop.whatsapp_number ?? "").trim() ||
      secondaryPhone.trim() !== (shop.secondary_phone ?? "").trim()
    );
  }, [name, whatsapp, secondaryPhone, shop]);

  const lockedUntil = useMemo(
    () => sensitiveInfoLockedUntil(shop.sensitive_info_updated_at),
    [shop.sensitive_info_updated_at],
  );
  const sensitiveLocked = sensitiveChanged && lockedUntil != null;

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      if (!name.trim()) {
        setError("Store name is required.");
        return;
      }
      const phone = whatsapp.replace(/\D/g, "");
      if (phone && phone.length < 10) {
        setError("Enter a valid WhatsApp number (min 10 digits).");
        return;
      }

      const secondaryDigits = normalizePkPhoneDigits(secondaryPhone);
      if (secondaryPhone.trim() && !secondaryDigits) {
        setError("Enter a valid other number (e.g. 0300-1234567).");
        return;
      }

      // Case A: name/numbers edited while the weekly lock is still active —
      //         save every OTHER field but skip the locked name/numbers, and
      //         tell the user those specific changes were skipped.
      if (sensitiveChanged && sensitiveLocked) {
        setSaving(true);
        const form = shopToFormData(shop); // carries the ORIGINAL name/numbers
        form.category = category.trim();
        form.location = location.trim();
        form.business_hours = businessHours.trim();
        form.store_bio = bio.trim();
        form.operating_status = isOpen ? "Open" : "Closed";
        form.logo_url = logoUrl;
        form.banner_url = bannerUrl;
        form.accepts_delivery = acceptsDelivery;
        form.accepts_pickup = acceptsPickup;
        form.latitude = latitude;
        form.longitude = longitude;
        form.service_radius_km = serviceRadiusKm;
        form.address_display = addressDisplay;
        form.delivery_zones = deliveryZones;
        const result = await updateShopProfile(shop.id, form, false);
        setSaving(false);
        if (result.success) {
          addToast(
            `Saved. Name and numbers can only change once per week — available again after ${lockedUntil!.toLocaleDateString(
              "en-PK",
              { day: "numeric", month: "long", year: "numeric" },
            )}. Those changes were skipped.`,
            "info",
          );
          window.dispatchEvent(new Event("trendsmart:shops-updated"));
          onSaved();
        } else {
          setError(result.error);
        }
        return;
      }

      // Case B: name/numbers edited and the weekly window has passed —
      //         require the account password before saving.
      if (sensitiveChanged) {
        if (!password.trim()) {
          setError("Enter your account password to change the name or numbers.");
          return;
        }
        setSaving(true);
        const verified = await verifyPassword(password);
        if (!verified.success) {
          setError(verified.error ?? "Incorrect password.");
          setSaving(false);
          return;
        }
      } else {
        setSaving(true);
      }

      const form = shopToFormData(shop);
      form.category = category.trim();
      form.name = name.trim();
      form.whatsapp_number = whatsapp.trim();
      form.secondary_phone = secondaryPhone.trim();
      form.location = location.trim();
      form.business_hours = businessHours.trim();
      form.store_bio = bio.trim();
      form.operating_status = isOpen ? "Open" : "Closed";
      form.logo_url = logoUrl;
      form.banner_url = bannerUrl;
      form.accepts_delivery = acceptsDelivery;
      form.accepts_pickup = acceptsPickup;
      form.latitude = latitude;
      form.longitude = longitude;
      form.service_radius_km = serviceRadiusKm;
      form.address_display = addressDisplay;
      form.delivery_zones = deliveryZones;

      const result = await updateShopProfile(shop.id, form, sensitiveChanged);
      setSaving(false);

      if (result.success) {
        addToast("Store profile updated.", "success");
        window.dispatchEvent(new Event("trendsmart:shops-updated"));
        onSaved();
      } else {
        setError(result.error);
      }
    },
    [
      name,
      category,
      whatsapp,
      secondaryPhone,
      location,
      businessHours,
      bio,
      isOpen,
      logoUrl,
      bannerUrl,
      acceptsDelivery,
      acceptsPickup,
      latitude,
      longitude,
      serviceRadiusKm,
      addressDisplay,
      deliveryZones,
      password,
      sensitiveChanged,
      sensitiveLocked,
      lockedUntil,
      shop,
      addToast,
      onSaved,
    ],
  );

  const fieldCls =
    "w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100";

  return (
    <div
      className="fixed inset-0 z-[170] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Edit store profile"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Edit store profile</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          {/* Logo + banner (editable any time) */}
          <div className="space-y-2">
            <ImageUpload
              label="Store logo"
              currentUrl={logoUrl}
              onUploaded={setLogoUrl}
              folder="shops"
              fileId={`${shop.id}-logo`}
              fallbackType="shop"
            />
            <ImageUpload
              label="Store banner"
              currentUrl={bannerUrl}
              onUploaded={setBannerUrl}
              folder="shops"
              fileId={`${shop.id}-banner`}
              fallbackType="shop"
            />
          </div>

          {/* Category — freely editable, no password or weekly lock required */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Category
            </label>
            <CustomSelect
              value={category}
              onChange={setCategory}
              options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }))}
              ariaLabel="Store category"
            />
          </div>

          {/* Sensitive group — name + numbers, one change per week */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
            <p className="mb-2 flex items-center gap-1.5 text-[0.7rem] font-semibold text-amber-800 dark:text-amber-300">
              <LockIcon /> Name &amp; numbers — once per week
            </p>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Store name *
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  className={fieldCls}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    WhatsApp number
                  </label>
                  <input
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    inputMode="tel"
                    className={fieldCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    Other number
                  </label>
                  <input
                    value={secondaryPhone}
                    onChange={(e) => setSecondaryPhone(e.target.value)}
                    inputMode="tel"
                    className={fieldCls}
                  />
                </div>
              </div>

              {/* Shown the instant a locked field is edited and the weekly
                  window hasn't passed yet — explains why and keeps the rest
                  of the form saveable. */}
              {sensitiveChanged && sensitiveLocked ? (
                <div className="rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-[0.7rem] font-medium leading-relaxed text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                  Name aur numbers haftay mein sirf ek baar change ho sakte
                  hain. Agli change{" "}
                  {lockedUntil!.toLocaleDateString("en-PK", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}{" "}
                  ke baad hogi. Baaki fields (category, location, hours, bio…)
                  abhi bhi save ho sakti hain.
                </div>
              ) : null}

              {/* Password is ONLY requested when the user actually edits the
                  locked fields AND the weekly window has passed. */}
              {sensitiveChanged && !sensitiveLocked ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    Account password (to confirm)
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className={fieldCls}
                  />
                  <p className="mt-1 text-[0.7rem] text-amber-700 dark:text-amber-400">
                    Required to change the name or numbers.
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          {/* Free group — never asks for a password */}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Location
              </label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                maxLength={200}
                className={fieldCls}
              />
            </div>

            {/* Delivery area — pin + radius / city / nationwide, free to edit anytime */}
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
              <p className="mb-2 text-[0.7rem] font-semibold text-zinc-700 dark:text-zinc-300">
                Delivery area
              </p>
              <ShopLocationRadiusPicker
                compact
                value={{
                  latitude,
                  longitude,
                  service_radius_km: serviceRadiusKm,
                  address_display: addressDisplay,
                  location,
                  delivery_zones: deliveryZones,
                }}
                onChange={(patch) => {
                  if (patch.latitude !== undefined) setLatitude(patch.latitude);
                  if (patch.longitude !== undefined) setLongitude(patch.longitude);
                  if (patch.service_radius_km !== undefined) setServiceRadiusKm(patch.service_radius_km);
                  if (patch.address_display !== undefined) setAddressDisplay(patch.address_display);
                  if (patch.delivery_zones !== undefined) setDeliveryZones(patch.delivery_zones);
                  if (patch.location !== undefined) setLocation(patch.location);
                }}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Business hours
              </label>
              <input
                value={businessHours}
                onChange={(e) => setBusinessHours(e.target.value)}
                maxLength={150}
                placeholder="Opening hours"
                className={fieldCls}
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-800">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Store open
                </p>
                <p className="text-[0.7rem] text-zinc-500 dark:text-zinc-400">
                  {isOpen ? "Customers can order now" : "Store is closed for now"}
                </p>
              </div>
              <ToggleSwitch
                checked={isOpen}
                onChange={setIsOpen}
                label="Store open or closed"
              />
            </div>

            {/* Fulfillment channels — independent of dine-in tables */}
            <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3 dark:border-teal-900/40 dark:bg-teal-950/20">
              <p className="mb-1 text-[0.7rem] font-semibold text-teal-800 dark:text-teal-300">
                How customers receive orders
              </p>
              <p className="mb-2 text-[0.65rem] leading-relaxed text-teal-700/90 dark:text-teal-300/80">
                Pause any channel from the app. QR-table dine-in (restaurants) runs
                separately and is never blocked by these toggles.
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2.5 dark:bg-zinc-900">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Delivery 🚚
                    </p>
                    <p className="text-[0.65rem] text-zinc-500 dark:text-zinc-400">
                      {acceptsDelivery
                        ? "Customers can order home delivery"
                        : "Paused — delivery hidden at checkout"}
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={acceptsDelivery}
                    onChange={setAcceptsDelivery}
                    label="Accept delivery orders"
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2.5 dark:bg-zinc-900">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Self-pickup 🛍️
                    </p>
                    <p className="text-[0.65rem] text-zinc-500 dark:text-zinc-400">
                      {acceptsPickup
                        ? "Customers can order and pick up themselves"
                        : "Paused — pickup hidden at checkout"}
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={acceptsPickup}
                    onChange={setAcceptsPickup}
                    label="Accept pickup orders"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Store bio / about
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Store description"
                className={`${fieldCls} resize-none`}
              />
            </div>
          </div>

          {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
