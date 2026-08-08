"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SHOP_CATEGORIES } from "@/types";
import type { ShopFormData } from "@/types";
import { claimSignupRole, detectUserRole } from "@/services/authService";
import { createShop } from "@/services/shopService";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

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
    secondary_phone: "",
    business_hours: "",
    operating_status: "",
    accent_color: "",
    store_bio: "",
    announcement: "",
    service_area: "",
    hourly_rate: "",
    call_out_charge: "",
    emergency_available: false,
    shop_type: "retail",
    latitude: null,
    longitude: null,
    service_radius_km: 10,
    address_display: "",
    min_order_amount: "",
    free_delivery_threshold: "",
    delivery_fee_flat: "",
    delivery_fee_per_km: "",
  };
}

function isValidPkPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  // 03XXXXXXXXX (11) or 923XXXXXXXXX (12) or 3XXXXXXXXX (10)
  if (digits.length === 11 && digits.startsWith("03")) return true;
  if (digits.length === 12 && digits.startsWith("92")) return true;
  if (digits.length === 10 && digits.startsWith("3")) return true;
  return false;
}

export default function BecomeMerchantPage() {
  const router = useRouter();
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
      if (role === "merchant" || role === "admin") {
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
      next.name = "Store name is required (min 2 characters).";
    }
    if (!form.category.trim()) next.category = "Choose a category.";
    if (!form.location.trim() || form.location.trim().length < 2) {
      next.location = "City / area is required.";
    }
    if (!form.whatsapp_number.trim()) {
      next.whatsapp_number = "WhatsApp number is required for orders.";
    } else if (!isValidPkPhone(form.whatsapp_number)) {
      next.whatsapp_number = "Enter a valid Pakistani mobile (e.g. 03001234567).";
    }
    if (!agreed) next.agreed = "You must accept the merchant guidelines.";
    if (!confirmSwitch) {
      next.confirmSwitch = "Confirm that you want to open a merchant store.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      addToast("Please fix the highlighted fields.", "error");
      return;
    }
    if (!emailVerified) {
      addToast("Verify your email first — then you can register a store.", "info");
      router.push("/auth/verify-notice?redirect=/account/become-merchant");
      return;
    }

    setSubmitting(true);
    try {
      // 1) Promote role only after form validation
      const roleResult = await claimSignupRole("merchant");
      if (!roleResult.success) {
        addToast(roleResult.error ?? "Could not switch to merchant.", "error");
        setSubmitting(false);
        return;
      }

      // 2) Create the store with submitted details
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
            "Merchant role updated, but store setup failed. Finish it in the dashboard.",
          "error",
        );
        window.location.href = "/dashboard";
        return;
      }

      addToast("Store created — welcome to your merchant dashboard!", "success");
      window.location.href = "/dashboard";
    } catch {
      addToast("Something went wrong. Please try again.", "error");
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400">
              Merchant onboarding
            </p>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Register your store
            </h1>
            {email ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{email}</p>
            ) : null}
          </div>
          <Link
            href="/account"
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            ← Account
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-5 px-4 py-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">How this works</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-zinc-600 dark:text-zinc-400">
            <li>Fill in your store details (required fields marked *).</li>
            <li>Accept merchant guidelines.</li>
            <li>We create your store and open the merchant dashboard.</li>
          </ol>
          {!emailVerified && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              Email not verified yet. You can fill the form, but submit will ask you to verify first.{" "}
              <Link href="/auth/verify-notice?redirect=/account/become-merchant" className="font-semibold underline">
                Verify email →
              </Link>
            </p>
          )}
        </section>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Store name *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Gujranwala Fresh Mart"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            {errors.name ? <p className="mt-1 text-xs text-red-500">{errors.name}</p> : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Category *
            </label>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {errors.category ? <p className="mt-1 text-xs text-red-500">{errors.category}</p> : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              City / area *
            </label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="e.g. Gujranwala, G.T. Road"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            {errors.location ? <p className="mt-1 text-xs text-red-500">{errors.location}</p> : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              WhatsApp number *
            </label>
            <input
              type="tel"
              value={form.whatsapp_number}
              onChange={(e) => setForm((f) => ({ ...f, whatsapp_number: e.target.value }))}
              placeholder="03001234567"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            {errors.whatsapp_number ? (
              <p className="mt-1 text-xs text-red-500">{errors.whatsapp_number}</p>
            ) : (
              <p className="mt-1 text-[0.65rem] text-zinc-400">Customers&apos; orders go to this WhatsApp.</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Short bio <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={form.store_bio}
              onChange={(e) => setForm((f) => ({ ...f, store_bio: e.target.value }))}
              placeholder="What do you sell?"
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
              I want to open a merchant store on TrendMart (I can still shop as a customer from the homepage).
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
              I agree to TrendMart&apos;s{" "}
              <Link href="/legal/merchant-guidelines" target="_blank" className="font-medium text-emerald-600 underline">
                Merchant Security Guidelines
              </Link>{" "}
              and{" "}
              <Link href="/legal/terms" target="_blank" className="font-medium text-emerald-600 underline">
                Terms &amp; Conditions
              </Link>
              .
            </span>
          </label>
          {errors.agreed ? <p className="-mt-2 text-xs text-red-500">{errors.agreed}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? "Creating store…" : "Create store & open dashboard"}
          </button>
        </form>
      </main>
    </div>
  );
}
