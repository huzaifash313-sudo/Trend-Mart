"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { detectUserRole } from "@/services/authService";
import { useToast } from "@/components/Toast";
import { useLocation } from "@/context/LocationContext";
import LocationPicker from "@/components/LocationPicker";
import {
  formatPkPhoneInput,
  isValidPkMobile,
  PK_PHONE_PLACEHOLDER,
} from "@/lib/phoneFormat";
import type { UserLocation } from "@/types";

/* -------------------------------------------------------------------------- */
/*  Customer onboarding — complete delivery profile                            */
/*                                                                             */
/*  New customers land here right after signup so checkout can auto-fill       */
/*  their full name, phone and precise location. Merchants are redirected      */
/*  away (they complete store setup at /account/become-merchant instead).      */
/* -------------------------------------------------------------------------- */

export default function CompleteProfilePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { addToast } = useToast();
  const { location, seedLocation } = useLocation();

  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        window.location.replace("/login?redirect=/account/complete-profile");
        return;
      }

      try {
        const role = await detectUserRole(user);
        if (cancelled) return;
        if (role === "admin") {
          router.replace("/admin/dashboard");
          return;
        }
        if (role === "merchant") {
          router.replace("/dashboard");
          return;
        }
      } catch {
        // Role detection failed — still let customers finish their profile
        // instead of leaving the page stuck on the loading spinner.
      }

      setUserId(user.id);
      setEmail(user.email ?? null);
      const metaName =
        typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : "";
      const metaPhone =
        typeof user.user_metadata?.phone === "string"
          ? user.user_metadata.phone
          : "";
      if (metaName) setFullName(metaName);
      if (metaPhone) setPhone(formatPkPhoneInput(metaPhone));

      try {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("full_name, phone, address, latitude, longitude, city, location_label")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!cancelled && profile) {
          const nameOk =
            typeof profile.full_name === "string" && profile.full_name.trim().length >= 2;
          const phoneOk =
            typeof profile.phone === "string" && profile.phone.trim().length >= 7;
          const locationOk =
            typeof profile.latitude === "number" ||
            (typeof profile.address === "string" && profile.address.trim().length > 0);

          // Already onboarded — never show the form twice (refresh, sign-out,
          // re-login). The delivery profile is a one-time step.
          if (nameOk && phoneOk && locationOk) {
            router.replace("/account");
            return;
          }

          if (profile.full_name) setFullName(profile.full_name);
          if (profile.phone) setPhone(formatPkPhoneInput(profile.phone));
          if (profile.address) setAddress(profile.address);

          // Seed the location context from a previously saved profile location
          // so the picker (and city/GPS flows) reflect what the user already set.
          const lat = typeof profile.latitude === "number" ? profile.latitude : null;
          const lng = typeof profile.longitude === "number" ? profile.longitude : null;
          if (lat != null && lng != null && !location) {
            const saved: UserLocation = {
              coordinates: { latitude: lat, longitude: lng },
              city: typeof profile.city === "string" ? profile.city : null,
              deliveryZone: typeof profile.city === "string" ? profile.city : null,
              address:
                typeof profile.location_label === "string"
                  ? profile.location_label
                  : null,
              updatedAt: Date.now(),
              source: "cached",
            };
            seedLocation(saved);
          }
        }
      } catch {
        /* profile optional — form still works without it */
      }

      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router, seedLocation]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (fullName.trim().length < 2) {
      next.fullName = "Enter your full name (min 2 characters).";
    }
    if (!phone.trim()) {
      next.phone = "Phone number is required for delivery.";
    } else if (!isValidPkMobile(phone)) {
      next.phone = `Enter a valid Pakistani mobile (e.g. ${PK_PHONE_PLACEHOLDER}).`;
    }
    if (!location) {
      next.location = "Set your delivery location to continue.";
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
    if (!userId) return;

    setSaving(true);
    try {
      const name = fullName.trim();
      const phoneClean = phone.trim();
      const lat = location?.coordinates?.latitude ?? null;
      const lng = location?.coordinates?.longitude ?? null;

      await supabase.auth.updateUser({ data: { full_name: name, phone: phoneClean } });

      const { error } = await supabase.from("user_profiles").upsert(
        {
          user_id: userId,
          full_name: name,
          phone: phoneClean,
          address: address.trim() || null,
          latitude: typeof lat === "number" ? lat : null,
          longitude: typeof lng === "number" ? lng : null,
          city: location?.city ?? null,
          location_label: location?.address ?? location?.deliveryZone ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      if (error) {
        addToast(error.message, "error");
        setSaving(false);
        return;
      }

      addToast("Profile completed — checkout will auto-fill your details.", "success");
      router.replace("/account");
    } catch {
      addToast("Something went wrong. Please try again.", "error");
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  const locationLabel = location
    ? location.address ||
      [location.deliveryZone, location.city].filter(Boolean).join(", ") ||
      "Location set"
    : "Not set — choose your city or use GPS below.";

  const inputClass =
    "w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400">
              Welcome to TrendMart
            </p>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Complete your profile
            </h1>
            {email ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{email}</p>
            ) : null}
          </div>
          <Link
            href="/"
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            ← Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-5 px-4 py-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">
            One quick step — then checkout fills everything for you
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-zinc-600 dark:text-zinc-400">
            <li>Confirm your full name and phone number.</li>
            <li>Set your delivery location (GPS or pick a city).</li>
            <li>Optionally save a default delivery address.</li>
          </ol>
        </section>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Full name *
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              className={inputClass}
            />
            {errors.fullName ? (
              <p className="mt-1 text-xs text-red-500">{errors.fullName}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Phone number *
            </label>
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(formatPkPhoneInput(e.target.value))}
              placeholder={PK_PHONE_PLACEHOLDER}
              className={inputClass}
            />
            <p className="mt-1 text-[0.65rem] text-zinc-400">
              Format: {PK_PHONE_PLACEHOLDER}. Shown to merchants for order delivery.
            </p>
            {errors.phone ? (
              <p className="mt-1 text-xs text-red-500">{errors.phone}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Your delivery location *
            </label>
            <div className="flex items-center gap-2">
              <LocationPicker />
              <span className="min-w-0 flex-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                {locationLabel}
              </span>
            </div>
            <p className="mt-1.5 text-[0.65rem] text-zinc-400">
              Tap the location button to open the full map — search your area, move
              the pin, or choose a city. Shops deliver within this area.
            </p>
            {errors.location ? (
              <p className="mt-1 text-xs text-red-500">{errors.location}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Default delivery address{" "}
              <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="House / street, area, city"
              className={`${inputClass} resize-none`}
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save & continue"}
          </button>
        </form>

        <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
          <Link href="/account" className="font-medium text-emerald-600 underline dark:text-emerald-400">
            Skip for now →
          </Link>{" "}
          — you can finish this later from Account Settings.
        </p>
      </main>
    </div>
  );
}
