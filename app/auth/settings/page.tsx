"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export default function AccountSettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { addToast } = useToast();

  const [email, setEmail] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [loading, setLoading] = useState(true);

  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!cancelled) {
        if (!data.user) { router.replace("/auth"); return; }
        setEmail(data.user.email ?? "");
        setCreatedAt(data.user.created_at ?? "");
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [supabase.auth, router]);

  const handleUpdateEmail = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setEmailSaving(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) { addToast(error.message, "error"); }
    else { addToast("Email updated! Check your inbox to confirm.", "success"); setNewEmail(""); }
    setEmailSaving(false);
  }, [newEmail, supabase.auth, addToast]);

  const handleUpdatePassword = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    if (newPassword.length < 6) { addToast("Password must be at least 6 characters.", "error"); return; }
    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { addToast(error.message, "error"); }
    else { addToast("Password changed successfully!", "success"); setCurrentPassword(""); setNewPassword(""); }
    setPasswordSaving(false);
  }, [currentPassword, newPassword, supabase.auth, addToast]);

  if (loading) {
    return (<div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950"><div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" /></div>);
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold tracking-tight text-emerald-600 dark:text-emerald-400">Account Settings</h1>
          <button type="button" onClick={() => router.back()} className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">← Back</button>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-8 px-4 py-6">
        {/* Account Info */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-base font-bold text-zinc-900 dark:text-zinc-100">Account Info</h2>
          <div className="space-y-2 text-sm">
            <p className="text-zinc-600 dark:text-zinc-400">Email: <span className="font-medium text-zinc-900 dark:text-zinc-100">{email}</span></p>
            <p className="text-zinc-600 dark:text-zinc-400">Member since: <span className="font-medium text-zinc-900 dark:text-zinc-100">{createdAt ? new Date(createdAt).toLocaleDateString() : "—"}</span></p>
          </div>
        </section>

        {/* Change Email */}
        <section>
          <h2 className="mb-3 text-base font-bold text-zinc-900 dark:text-zinc-100">Change Email</h2>
          <form onSubmit={handleUpdateEmail} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">New Email Address</label>
              <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="merchant@example.com" className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
            </div>
            <button type="submit" disabled={emailSaving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 dark:focus:ring-offset-zinc-900">{emailSaving ? "Updating…" : "Update Email"}</button>
          </form>
        </section>

        {/* Change Password */}
        <section>
          <h2 className="mb-3 text-base font-bold text-zinc-900 dark:text-zinc-100">Change Password</h2>
          <form onSubmit={handleUpdatePassword} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Current Password</label>
              <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">New Password (min 6 characters)</label>
              <input type="password" required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
            </div>
            <button type="submit" disabled={passwordSaving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 dark:focus:ring-offset-zinc-900">{passwordSaving ? "Updating…" : "Change Password"}</button>
          </form>
        </section>
      </main>
    </div>
  );
}