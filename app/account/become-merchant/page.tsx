"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SHOP_CATEGORIES } from "@/types";
import type { ShopFormData } from "@/types";
import { claimSignupRole, detectUserRole } from "@/services/authService";
import { createShop, fetchMyShop } from "@/services/shopService";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import ShopLocationRadiusPicker from "@/components/ShopLocationRadiusPicker";
import CustomSelect from "@/components/CustomSelect";
import { useLocale } from "@/context/LocaleContext";
import {
  formatPkPhoneInput,
  isValidPkMobile,
  PK_PHONE_PLACEHOLDER,
} from "@/lib/phoneFormat";
import { defaultShopSchedule } from "@/lib/shopHours";

const CATEGORIES = SHOP_CATEGORIES.filter((c) => c !== "All");

function emptyShopForm(): ShopFormData {
  return {
    name: "",
    category: CATEGORIES[0] ?? "Others / Universal",
    location: "",
    whatsapp_number: "",
    logo_url: "",
    banner_url: "",
    is_live: true,
    instagram_handle: "",
    facebook_url: "",
    tiktok_handle: "",
    secondary_phone: "",
    business_hours: "",
    operating_status: "Open",
    shop_schedule: defaultShopSchedule(),
    accent_color: "",
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
    free_delivery_radius_km: "",
    delivery_fee_flat: "",
    delivery_fee_per_km: "",
    free_delivery_areas: [],
    accepts_delivery: true,
    accepts_pickup: true,
    accepts_dine_in: true,
  };
}


export default function BecomeMerchantPage() {
  const router = useRouter();
  const { t } = useLocale();
  const { addToast } = useToast();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [form, setForm] = useState<ShopFormData>(emptyShopForm);
  const [agreed, setAgreed] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        window.location.replace("/login?redirect=/account/become-merchant");
        return;
      }
      const role = await detectUserRole(user);
      if (cancelled) return;
      if (role === "admin") {
        router.replace("/admin/dashboard");
        return;
      }
      // Only skip the form when a store already exists. A merchant who signed
      // up but hasn't created a shop stays here to finish onboarding — this
      // also breaks the old dashboard ↔ become-merchant redirect loop.
      const shopResult = await fetchMyShop();
      if (cancelled) return;
      if (shopResult.success && shopResult.data) {
        router.replace("/dashboard");
        return;
      }
      setEmail(user.email ?? null);
      setEmailVerified(!!user.email_confirmed_at);
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.name.trim() || form.name.trim().length < 2) {
      next.name = t("merchantOnboard.errName");
    }
    if (!form.category.trim()) next.category = t("merchantOnboard.errCategory");
    if (!form.location.trim() || form.location.trim().length < 2) {
      next.location = t("merchantOnboard.errLocation");
    }
    if (
      typeof form.latitude !== "number" ||
      typeof form.longitude !== "number" ||
      !Number.isFinite(form.latitude) ||
      !Number.isFinite(form.longitude)
    ) {
      next.pin = t("merchantOnboard.errPin");
    }
    if (!form.whatsapp_number.trim()) {
      next.whatsapp_number = t("merchantOnboard.errWhatsapp");
    } else if (!isValidPkMobile(form.whatsapp_number)) {
      next.whatsapp_number = t("merchantOnboard.errWhatsappInvalid", {
        example: PK_PHONE_PLACEHOLDER,
      });
    }
    if (!agreed) next.agreed = t("merchantOnboard.errAgreed");
    if (!confirmSwitch) {
      next.confirmSwitch = t("merchantOnboard.errConfirm");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!emailVerified) {
      addToast(t("merchantOnboard.toastVerifyEmail"), "error");
      return;
    }
    if (!validate()) {
      addToast(t("merchantOnboard.toastFixFields"), "error");
      return;
    }

    setSubmitting(true);
    try {
      // Create store first — DB trigger promotes to merchant. Avoid orphan merchant role on failure.
      const shopResult = await createShop({
        ...form,
        name: form.name.trim(),
        location: form.location.trim(),
        whatsapp_number: form.whatsapp_number.trim(),
        is_live: true,
      });

      if (!shopResult.success) {
        addToast(
          shopResult.error ||
            "Store setup failed. Please try again — your account was not switched to merchant yet.",
          "error",
        );
        setSubmitting(false);
        return;
      }

      // Safety net: ensure user_roles reflects merchant after successful shop create.
      const roleResult = await claimSignupRole("merchant");
      if (!roleResult.success) {
        // Shop exists; trigger may already have promoted. Continue to dashboard.
        console.warn("[become-merchant] claimSignupRole:", roleResult.error);
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("trendsmart:shops-updated"));
      }

      addToast(t("merchantOnboard.toastCreated"), "success");
      window.location.href = "/dashboard";
    } catch {
      addToast(t("merchantOnboard.toastError"), "error");
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 pb-safe-nav dark:bg-[color:var(--tm-surface)]">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400">
              {t("merchantOnboard.eyebrow")}
            </p>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              {t("merchantOnboard.title")}
            </h1>
            {email ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{email}</p>
            ) : null}
          </div>
          <Link
            href="/account"
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            {t("merchantOnboard.backAccount")}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-5 px-4 py-6">
        {!emailVerified ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900/40 dark:bg-amber-950/30">
            <p className="font-semibold text-amber-900 dark:text-amber-200">
              {t("merchantOnboard.verifyTitle")}
            </p>
            <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-300/90">
              {t("merchantOnboard.verifyBody")}
            </p>
            <Link
              href="/auth/verify-notice?redirect=/account/become-merchant"
              className="mt-2 inline-block text-xs font-semibold text-emerald-700 underline dark:text-emerald-400"
            >
              {t("merchantOnboard.verifyLink")}
            </Link>
          </section>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">
            {t("merchantOnboard.howTitle")}
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-zinc-600 dark:text-zinc-400">
            <li>{t("merchantOnboard.how1")}</li>
            <li>{t("merchantOnboard.how2")}</li>
            <li>{t("merchantOnboard.how3")}</li>
          </ol>
        </section>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              {t("merchantOnboard.storeName")} *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t("merchantOnboard.storeNamePh")}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            {errors.name ? <p className="mt-1 text-xs text-red-500">{errors.name}</p> : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              {t("merchantOnboard.category")} *
            </label>
            <CustomSelect
              value={form.category}
              onChange={(val) => setForm((f) => ({ ...f, category: val }))}
              options={CATEGORIES.map((c) => ({ value: c, label: c }))}
            />
            {errors.category ? <p className="mt-1 text-xs text-red-500">{errors.category}</p> : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              {t("merchantOnboard.cityArea")} *
            </label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder={t("merchantOnboard.cityAreaPh")}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            {errors.location ? <p className="mt-1 text-xs text-red-500">{errors.location}</p> : null}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              {t("merchantOnboard.pinArea")} *
            </label>
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
            {errors.pin ? <p className="mt-1 text-xs text-red-500">{errors.pin}</p> : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              {t("merchantOnboard.whatsapp")} *
            </label>
            <input
              type="tel"
              inputMode="numeric"
              value={form.whatsapp_number}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  whatsapp_number: formatPkPhoneInput(e.target.value),
                }))
              }
              placeholder={PK_PHONE_PLACEHOLDER}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            {errors.whatsapp_number ? (
              <p className="mt-1 text-xs text-red-500">{errors.whatsapp_number}</p>
            ) : (
              <p className="mt-1 text-[0.65rem] text-zinc-400">
                {t("merchantOnboard.whatsappHint", { example: PK_PHONE_PLACEHOLDER })}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              {t("merchantOnboard.bio")}{" "}
              <span className="font-normal text-zinc-400">({t("common.optional")})</span>
            </label>
            <textarea
              rows={2}
              value={form.store_bio}
              onChange={(e) => setForm((f) => ({ ...f, store_bio: e.target.value }))}
              placeholder={t("merchantOnboard.bioPh")}
              className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={confirmSwitch}
              onChange={(e) => setConfirmSwitch(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-zinc-300 text-emerald-600"
            />
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              {t("merchantOnboard.confirmSwitch")}
            </span>
          </label>
          {errors.confirmSwitch ? (
            <p className="-mt-2 text-xs text-red-500">{errors.confirmSwitch}</p>
          ) : null}

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-zinc-300 text-emerald-600"
            />
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              {t("merchantOnboard.agreePrefix")}{" "}
              <Link href="/legal/merchant-guidelines" target="_blank" className="font-medium text-emerald-600 underline">
                {t("footer.merchantGuidelines")}
              </Link>
              ,{" "}
              <Link href="/legal/terms" target="_blank" className="font-medium text-emerald-600 underline">
                {t("footer.terms")}
              </Link>
              , {t("merchantOnboard.agreeAnd")}{" "}
              <Link href="/legal/privacy" target="_blank" className="font-medium text-emerald-600 underline">
                {t("footer.privacy")}
              </Link>
              .
            </span>
          </label>
          {errors.agreed ? <p className="-mt-2 text-xs text-red-500">{errors.agreed}</p> : null}

          <button
            type="submit"
            disabled={submitting || !emailVerified}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting
              ? t("merchantOnboard.creating")
              : !emailVerified
                ? t("merchantOnboard.verifyToContinue")
                : t("merchantOnboard.submit")}
          </button>
        </form>
      </main>
    </div>
  );
}
