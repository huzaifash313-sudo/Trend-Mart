"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export default function AccountSettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { addToast } = useToast();

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [loading, setLoading] = useState(true);

  const [fullName, setFullName] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

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
      setEmail(data.user.email ?? "");
      setCreatedAt(data.user.created_at ?? "");
      const metaName = (data.user.user_metadata?.full_name as string | undefined) ?? "";
      setDisplayName(metaName);
      setFullName(metaName);

      try {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("full_name")
          .eq("user_id", data.user.id)
          .maybeSingle();
        if (!cancelled && profile?.full_name) {
          setDisplayName(profile.full_name);
          setFullName(profile.full_name);
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

      const { error: metaErr } = await supabase.auth.updateUser({
        data: { full_name: name },
      });
      if (metaErr) {
        addToast(metaErr.message, "error");
        setProfileSaving(false);
        return;
      }

      await supabase
        .from("user_profiles")
        .upsert(
          { user_id: user.id, full_name: name, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );

      setDisplayName(name);
      addToast("Profile updated.", "success");
      setProfileSaving(false);
    },
    [fullName, supabase, addToast],
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
      // Re-authenticate with current password before changing it
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
    await supabase.auth.signOut();
    window.location.href = "/";
  }, [supabase.auth]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  const inputClass =
    "w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
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

      <main className="mx-auto max-w-xl space-y-6 px-4 py-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-base font-bold text-zinc-900 dark:text-zinc-100">Account info</h2>
          <div className="space-y-2 text-sm">
            <p className="text-zinc-600 dark:text-zinc-400">
              Name:{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {displayName || "—"}
              </span>
            </p>
            <p className="text-zinc-600 dark:text-zinc-400">
              Email: <span className="font-medium text-zinc-900 dark:text-zinc-100">{email}</span>
            </p>
            <p className="text-zinc-600 dark:text-zinc-400">
              Member since:{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {createdAt ? new Date(createdAt).toLocaleDateString() : "—"}
              </span>
            </p>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-base font-bold text-zinc-900 dark:text-zinc-100">Profile name</h2>
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
                placeholder="you@example.com"
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
