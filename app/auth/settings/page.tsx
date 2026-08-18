"use client";

import { useState, useEffect, useCallback, useRef, type FormEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/services/authService";
import { useToast } from "@/components/Toast";
import { uploadImage } from "@/services/storageService";
import { formatPkPhoneInput, PK_PHONE_PLACEHOLDER } from "@/lib/phoneFormat";
import { getSafeImageUrl } from "@/services/storageService";

export default function AccountSettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { addToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) {
        router.replace("/login?redirect=/auth/settings");
        return;
      }
      setUserId(data.user.id);
      setEmail(data.user.email ?? "");
      setCreatedAt(data.user.created_at ?? "");
      const metaName = (data.user.user_metadata?.full_name as string | undefined) ?? "";
      const metaPhone = (data.user.user_metadata?.phone as string | undefined) ?? "";
      setDisplayName(metaName);
      setFullName(metaName);
      setPhone(metaPhone ? formatPkPhoneInput(metaPhone) : "");

      try {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("full_name, phone, address, avatar_url")
          .eq("user_id", data.user.id)
          .maybeSingle();
        if (!cancelled && profile) {
          if (profile.full_name) {
            setDisplayName(profile.full_name);
            setFullName(profile.full_name);
          }
          if (profile.phone) setPhone(formatPkPhoneInput(profile.phone));
          if (profile.address) setAddress(profile.address);
          if (profile.avatar_url) setAvatarUrl(profile.avatar_url);
        }
      } catch {
        /* profile optional */
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  const handleUpdateProfile = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const name = fullName.trim();
      if (name.length < 2) {
        addToast("Name must be at least 2 characters.", "error");
        return;
      }
      setProfileSaving(true);
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) {
        addToast("Please sign in again.", "error");
        setProfileSaving(false);
        return;
      }

      const phoneClean = phone.trim();
      const addressClean = address.trim();

      const { error: metaErr } = await supabase.auth.updateUser({
        data: {
          full_name: name,
          phone: phoneClean || null,
        },
      });
      if (metaErr) {
        addToast(metaErr.message, "error");
        setProfileSaving(false);
        return;
      }

      const { error: profileErr } = await supabase.from("user_profiles").upsert(
        {
          user_id: user.id,
          full_name: name,
          phone: phoneClean || null,
          address: addressClean || null,
          avatar_url: avatarUrl || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      if (profileErr) {
        // Column may be missing until SQL is run — still keep name/phone if possible
        addToast(
          profileErr.message.includes("avatar_url")
            ? "Profile saved. Your photo may take a moment to appear."
            : profileErr.message,
          profileErr.message.includes("avatar_url") ? "info" : "error",
        );
        if (!profileErr.message.includes("avatar_url")) {
          setProfileSaving(false);
          return;
        }
      }

      setDisplayName(name);
      addToast("Profile updated. Checkout will use these details.", "success");
      setProfileSaving(false);
    },
    [fullName, phone, address, avatarUrl, supabase, addToast],
  );

  const handleAvatarPick = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !userId) return;
      setAvatarBusy(true);
      const result = await uploadImage(file, "avatars", userId);
      if (!result.success) {
        addToast(result.error, "error");
        setAvatarBusy(false);
        return;
      }
      setAvatarUrl(result.data);
      const { error } = await supabase.from("user_profiles").upsert(
        {
          user_id: userId,
          full_name: fullName.trim() || displayName || "Customer",
          phone: phone.trim() || null,
          address: address.trim() || null,
          avatar_url: result.data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) {
        addToast(
          error.message.includes("avatar_url")
            ? "Couldn't save your photo. Please try again."
            : error.message,
          "error",
        );
      } else {
        addToast("Profile photo saved.", "success");
      }
      setAvatarBusy(false);
    },
    [userId, fullName, displayName, phone, address, supabase, addToast],
  );

  const handleUpdateEmail = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const next = newEmail.trim().toLowerCase();
      if (!next || !next.includes("@")) {
        addToast("Enter a valid email address.", "error");
        return;
      }
      if (next === email.toLowerCase()) {
        addToast("That's already your current email.", "info");
        return;
      }
      setEmailSaving(true);
      const { error } = await supabase.auth.updateUser({ email: next });
      if (error) addToast(error.message, "error");
      else {
        addToast("Check your inbox to confirm the new email.", "success");
        setNewEmail("");
      }
      setEmailSaving(false);
    },
    [newEmail, email, supabase.auth, addToast],
  );

  const handleUpdatePassword = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!currentPassword || !newPassword || !confirmPassword) {
        addToast("Fill in all password fields.", "error");
        return;
      }
      if (newPassword.length < 6) {
        addToast("New password must be at least 6 characters.", "error");
        return;
      }
      if (newPassword !== confirmPassword) {
        addToast("New password and confirmation do not match.", "error");
        return;
      }
      if (currentPassword === newPassword) {
        addToast("New password must be different from the current one.", "error");
        return;
      }

      setPasswordSaving(true);
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (signInError) {
        addToast("Current password is incorrect.", "error");
        setPasswordSaving(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) addToast(error.message, "error");
      else {
        addToast("Password changed successfully.", "success");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
      setPasswordSaving(false);
    },
    [currentPassword, newPassword, confirmPassword, email, supabase.auth, addToast],
  );

  const handleSignOut = useCallback(async () => {
    await signOut();
    window.location.href = "/";
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  const inputClass =
    "w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100";

  const safeAvatar = avatarUrl ? getSafeImageUrl(avatarUrl) : null;
  const initial = (displayName || email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
            Account Settings
          </h1>
          <Link
            href="/account"
            className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            ← Account
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-6 px-4 py-6 pb-28">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={avatarBusy}
              className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-emerald-100 ring-2 ring-emerald-200 transition hover:ring-emerald-400 disabled:opacity-60 dark:bg-emerald-950 dark:ring-emerald-800"
              aria-label="Change profile photo"
            >
              {safeAvatar ? (
                <Image src={safeAvatar} alt="" fill className="object-cover" sizes="80px" unoptimized />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                  {initial}
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-black/50 py-0.5 text-center text-[0.55rem] font-semibold text-white">
                {avatarBusy ? "…" : "Edit"}
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleAvatarPick}
            />
            <div className="min-w-0">
              <p className="truncate text-base font-bold text-zinc-900 dark:text-zinc-100">
                {displayName || "Your profile"}
              </p>
              <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">{email}</p>
              <p className="mt-1 text-xs text-zinc-400">
                Member since {createdAt ? new Date(createdAt).toLocaleDateString() : "—"}
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-base font-bold text-zinc-900 dark:text-zinc-100">
            Delivery profile
          </h2>
          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
            Name, phone and address autofill at checkout. You can still edit them per order.
          </p>
          <form
            onSubmit={handleUpdateProfile}
            className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Full name
              </label>
              <input
                type="text"
                required
                minLength={2}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Mobile number
              </label>
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(formatPkPhoneInput(e.target.value))}
                placeholder={PK_PHONE_PLACEHOLDER}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Default delivery address
              </label>
              <textarea
                rows={3}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="House / street, area, city"
                className={inputClass}
              />
              <p className="mt-1.5 text-[0.7rem] text-zinc-400">
                Prefer multiple saved places?{" "}
                <Link href="/account/addresses" className="font-semibold text-emerald-600 underline">
                  Manage addresses
                </Link>
              </p>
            </div>
            <button
              type="submit"
              disabled={profileSaving}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {profileSaving ? "Saving…" : "Save profile"}
            </button>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-base font-bold text-zinc-900 dark:text-zinc-100">Change email</h2>
          <form
            onSubmit={handleUpdateEmail}
            className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                New email address
              </label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Enter your email"
                className={inputClass}
              />
            </div>
            <button
              type="submit"
              disabled={emailSaving}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {emailSaving ? "Updating…" : "Update email"}
            </button>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-base font-bold text-zinc-900 dark:text-zinc-100">Change password</h2>
          <form
            onSubmit={handleUpdatePassword}
            className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Current password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                New password (min 6 characters)
              </label>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Confirm new password
              </label>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            <button
              type="submit"
              disabled={passwordSaving}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {passwordSaving ? "Updating…" : "Change password"}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full rounded-xl border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            Sign out
          </button>
        </section>
      </main>
    </div>
  );
}
