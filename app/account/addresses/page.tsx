"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Customer Profile & Delivery Address Book Management             */
/*                                                                             */
/*  Features:                                                                  */
/*   - Save multiple delivery addresses (Home, Office, Other)                  */
/*   - Edit existing addresses inline                                          */
/*   - Delete addresses with confirmation                                     */
/*   - Set a default address for one-tap checkout selection                   */
/*   - Addresses are stored in Supabase (public.customer_addresses)           */
/*   - Real-time sync across sessions when user is authenticated               */
/*   - Seamless integration with WhatsApp Checkout Modal                      */
/* -------------------------------------------------------------------------- */

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface CustomerAddress {
  id: string;
  user_id: string;
  label: string; // "Home", "Office", "Other" or custom label
  full_name: string;
  phone_number: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  postal_code?: string;
  delivery_notes?: string;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

type AddressLabel = "Home" | "Office" | "Other";

const ADDRESS_LABELS: AddressLabel[] = ["Home", "Office", "Other"];

const INITIAL_ADDRESS_FORM: Omit<CustomerAddress, "id" | "user_id" | "created_at" | "updated_at"> = {
  label: "Home",
  full_name: "",
  phone_number: "",
  address_line1: "",
  address_line2: "",
  city: "",
  postal_code: "",
  delivery_notes: "",
  is_default: false,
};

/* ─── Icons ────────────────────────────────────────────────────────────────── */

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function StarIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      className={`h-4 w-4 ${filled ? "text-amber-500 fill-amber-500" : "text-zinc-300 dark:text-zinc-600"}`}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function LabelIcon({ label }: { label: string }) {
  switch (label) {
    case "Home":
      return <HomeIcon />;
    case "Office":
      return <BriefcaseIcon />;
    default:
      return <MapPinIcon />;
  }
}

/* ─── Page Component ───────────────────────────────────────────────────────── */

export default function AddressesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { addToast } = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(INITIAL_ADDRESS_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Auth check
  useEffect(() => {
    let cancelled = false;
    async function checkSession() {
      const { data } = await supabase.auth.getUser();
      if (!cancelled) {
        if (!data.user) {
          router.replace("/auth");
        } else {
          setUserId(data.user.id);
        }
        setAuthLoading(false);
      }
    }
    checkSession();
    return () => { cancelled = true; };
  }, [supabase.auth, router]);

  // Load addresses
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function loadAddresses() {
      setAddressesLoading(true);
      const { data, error } = await supabase
        .from("customer_addresses")
        .select("*")
        .eq("user_id", userId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20);

      if (!cancelled && !error) {
        setAddresses((data ?? []) as CustomerAddress[]);
      }
      setAddressesLoading(false);
    }

    loadAddresses();
    return () => { cancelled = true; };
  }, [userId, supabase]);

  // ── Save address (create or update) ────────────────────────────────────────
  const handleSave = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!userId || !form.full_name.trim() || !form.address_line1.trim() || !form.city.trim() || !form.phone_number.trim()) {
      addToast("Please fill in all required fields.", "error");
      return;
    }
    setSaving(true);

    const payload = {
      user_id: userId,
      label: form.label,
      full_name: form.full_name.trim(),
      phone_number: form.phone_number.trim(),
      address_line1: form.address_line1.trim(),
      address_line2: form.address_line2?.trim() || null,
      city: form.city.trim(),
      postal_code: form.postal_code?.trim() || null,
      delivery_notes: form.delivery_notes?.trim() || null,
      is_default: form.is_default,
    };

    let result;

    if (editingId) {
      // Update existing
      result = await supabase
        .from("customer_addresses")
        .update(payload)
        .eq("id", editingId)
        .eq("user_id", userId)
        .select()
        .single();
    } else {
      // Create new
      result = await supabase
        .from("customer_addresses")
        .insert(payload)
        .select()
        .single();
    }

    if (result.error) {
      addToast("Failed to save address: " + result.error.message, "error");
    } else if (result.data) {
      // If setting as default, un-default other addresses
      if (form.is_default) {
        await supabase
          .from("customer_addresses")
          .update({ is_default: false })
          .eq("user_id", userId)
          .neq("id", (result.data as CustomerAddress).id);
      }

      setAddresses((prev) => {
        const existing = prev.filter((a) => a.id !== (result.data as CustomerAddress).id);
        const updated = [...existing, result.data as CustomerAddress]
          .sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));
        return updated;
      });

      addToast(editingId ? "Address updated!" : "Address saved!", "success");
      setForm(INITIAL_ADDRESS_FORM);
      setEditingId(null);
      setShowForm(false);
    }

    setSaving(false);
  }, [userId, form, editingId, supabase, addToast]);

  // ── Edit address ───────────────────────────────────────────────────────────
  const handleEdit = useCallback((address: CustomerAddress) => {
    setEditingId(address.id);
    setForm({
      label: address.label,
      full_name: address.full_name,
      phone_number: address.phone_number,
      address_line1: address.address_line1,
      address_line2: address.address_line2 || "",
      city: address.city,
      postal_code: address.postal_code || "",
      delivery_notes: address.delivery_notes || "",
      is_default: address.is_default,
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // ── Delete address ─────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (addressId: string) => {
    if (!confirm("Delete this address permanently?")) return;
    setDeletingId(addressId);
    const { error } = await supabase
      .from("customer_addresses")
      .delete()
      .eq("id", addressId)
      .eq("user_id", userId!);

    if (error) {
      addToast("Failed to delete: " + error.message, "error");
    } else {
      setAddresses((prev) => prev.filter((a) => a.id !== addressId));
      addToast("Address deleted.", "info");
    }
    setDeletingId(null);
  }, [supabase, userId, addToast]);

  // ── Set as default ─────────────────────────────────────────────────────────
  const handleSetDefault = useCallback(async (addressId: string) => {
    // Optimistic update
    setAddresses((prev) =>
      prev.map((a) => ({ ...a, is_default: a.id === addressId }))
    );

    // Batch update in DB
    await supabase
      .from("customer_addresses")
      .update({ is_default: false })
      .eq("user_id", userId!)
      .neq("id", addressId);

    const { error } = await supabase
      .from("customer_addresses")
      .update({ is_default: true })
      .eq("id", addressId)
      .eq("user_id", userId!);

    if (error) {
      addToast("Failed to set default: " + error.message, "error");
      // Revert optimistic update by reloading
      const { data } = await supabase
        .from("customer_addresses")
        .select("*")
        .eq("user_id", userId!)
        .order("is_default", { ascending: false });
      if (data) setAddresses(data as CustomerAddress[]);
    } else {
      addToast("Default address updated!", "success");
    }
  }, [supabase, userId, addToast]);

  // ── Cancel form ────────────────────────────────────────────────────────────
  const handleCancel = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setForm(INITIAL_ADDRESS_FORM);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              aria-label="Go back"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
              </svg>
            </button>
            <h1 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              📍 Delivery Addresses
            </h1>
          </div>
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
            >
              <PlusIcon /> Add New
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {/* ── Add / Edit Form ────────────────────────────────────────────── */}
        {showForm && (
          <section>
            <h2 className="mb-4 text-base font-bold text-zinc-900 dark:text-zinc-100">
              {editingId ? "Edit Address" : "New Address"}
            </h2>
            <form onSubmit={handleSave} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              {/* Address Label */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Address Label</label>
                <div className="flex gap-2">
                  {ADDRESS_LABELS.map((lbl) => (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, label: lbl }))}
                      className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                        form.label === lbl
                          ? "bg-emerald-600 text-white"
                          : "border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                      }`}
                    >
                      <LabelIcon label={lbl} />
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={form.full_name}
                    onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                    placeholder="Ahmed Khan"
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={form.phone_number}
                    onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))}
                    placeholder="+92 300 1234567"
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Address Line 1 *</label>
                <input
                  type="text"
                  required
                  value={form.address_line1}
                  onChange={(e) => setForm((f) => ({ ...f, address_line1: e.target.value }))}
                  placeholder="House 123, Street 4, Gulberg"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Address Line 2 <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.address_line2}
                  onChange={(e) => setForm((f) => ({ ...f, address_line2: e.target.value }))}
                  placeholder="Near Supermarket, Block B"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">City *</label>
                  <input
                    type="text"
                    required
                    value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    placeholder="Lahore"
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    Postal Code <span className="font-normal text-zinc-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={form.postal_code}
                    onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
                    placeholder="54000"
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Delivery Notes <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={form.delivery_notes}
                  onChange={(e) => setForm((f) => ({ ...f, delivery_notes: e.target.value }))}
                  placeholder="Ring the bell, leave at the gate..."
                  className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
                  className="h-4 w-4 shrink-0 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-600"
                />
                <span className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
                  <StarIcon filled /> Set as default address
                </span>
              </label>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving || !form.full_name.trim() || !form.address_line1.trim() || !form.city.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 dark:focus:ring-offset-zinc-900"
                >
                  <PlusIcon />
                  {saving ? "Saving…" : editingId ? "Update Address" : "Save Address"}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        {/* ── Saved Addresses List ──────────────────────────────────────── */}
        <section>
          <h2 className="mb-4 text-base font-bold text-zinc-900 dark:text-zinc-100">
            Saved Addresses ({addresses.length})
          </h2>

          {addressesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="h-16 rounded bg-zinc-200 dark:bg-zinc-800" />
                </div>
              ))}
            </div>
          ) : addresses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center dark:border-zinc-700 dark:bg-zinc-900">
              <div className="mb-3 flex justify-center">
                <MapPinIcon />
              </div>
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">No saved addresses yet</p>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                Add your first delivery address for faster checkout
              </p>
              {!showForm && (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
                >
                  <PlusIcon /> Add Address
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {addresses.map((address) => (
                <div
                  key={address.id}
                  className={`relative rounded-2xl border bg-white p-5 shadow-sm transition-all hover:shadow-md dark:bg-zinc-900 ${
                    address.is_default
                      ? "border-emerald-300 ring-2 ring-emerald-100 dark:border-emerald-700 dark:ring-emerald-900/30"
                      : "border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  {/* Default badge */}
                  {address.is_default && (
                    <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      <StarIcon filled /> Default
                    </span>
                  )}

                  {/* Label icon + name */}
                  <div className="mb-2 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      <LabelIcon label={address.label} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{address.label}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{address.full_name}</p>
                    </div>
                  </div>

                  {/* Address details */}
                  <div className="ml-[52px] space-y-1">
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">
                      {address.address_line1}
                      {address.address_line2 && <>, {address.address_line2}</>}
                    </p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {address.city}{address.postal_code ? ` — ${address.postal_code}` : ""}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-500">{address.phone_number}</p>
                    {address.delivery_notes && (
                      <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                        📝 {address.delivery_notes}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="ml-[52px] mt-3 flex flex-wrap items-center gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() => handleEdit(address)}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      Edit
                    </button>
                    {!address.is_default && (
                      <button
                        type="button"
                        onClick={() => handleSetDefault(address.id)}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
                      >
                        Set as Default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(address.id)}
                      disabled={deletingId === address.id}
                      className="ml-auto rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                      aria-label={`Delete ${address.label} address`}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}