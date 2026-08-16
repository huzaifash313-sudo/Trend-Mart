"use client";

import { useCallback, useState, type FormEvent } from "react";
import LegalPageLayout from "@/components/LegalPageLayout";
import { useToast } from "@/components/Toast";
import CustomSelect from "@/components/CustomSelect";
import { createSupportTicket } from "@/services/supportService";
import type { SupportTicketCategory, SupportTicketFormData } from "@/types";
import { formatPkPhoneInput, PK_PHONE_PLACEHOLDER } from "@/lib/phoneFormat";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Platform Support Desk                                        */
/*  Public contact/ticket form for customers & merchants to reach the        */
/*  TrendMart team directly (distinct from per-shop WhatsApp inquiries).      */
/* -------------------------------------------------------------------------- */

const CATEGORY_OPTIONS: { value: SupportTicketCategory; label: string }[] = [
  { value: "general", label: "General Question" },
  { value: "order", label: "Order Issue" },
  { value: "merchant", label: "Merchant / Store Support" },
  { value: "technical", label: "Technical Problem" },
  { value: "billing", label: "Billing / Subscription" },
  { value: "other", label: "Other" },
];

const INITIAL_FORM: SupportTicketFormData = {
  name: "",
  email: "",
  phone: "",
  category: "general",
  subject: "",
  message: "",
};

export default function SupportPage() {
  const { addToast } = useToast();
  const [form, setForm] = useState<SupportTicketFormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      const result = await createSupportTicket(form);
      if (result.success) {
        setSubmitted(true);
        setForm(INITIAL_FORM);
        addToast("Your message has been sent. Our team will get back to you soon.", "success");
      } else {
        addToast(result.error, "error");
      }
      setSubmitting(false);
    },
    [form, addToast],
  );

  return (
    <LegalPageLayout title="Contact Support" icon="💬" lastUpdated="August 8, 2026">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          <p className="mb-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Have a question about an order, your store, or the platform in general? Send us a
            message and our team will respond by email. For shop-specific questions (e.g. &quot;is
            this in stock?&quot;), message the merchant directly via their storefront&apos;s WhatsApp
            button instead — it&apos;s faster.
          </p>

          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                How it works
              </p>
              <p className="mt-2 text-sm text-zinc-800 dark:text-zinc-200">
                Submit the form — your ticket reaches the TrendMart team and Admin Support Inbox.
                We keep staff contacts private (no public email or phone on this page).
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Response time</p>
              <p className="mt-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">Usually within 24–48 hours</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Before you write in</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Check the <a href="/faq" className="font-medium text-emerald-600 underline dark:text-emerald-400">FAQ &amp; Merchant Guide</a> — most
                common questions are answered there instantly.
              </p>
            </div>
          </div>
        </div>

        <div>
          {submitted ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-800 dark:bg-emerald-900/20">
              <div className="mb-2 text-3xl">✅</div>
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">Message sent!</p>
              <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-500">
                We&apos;ll get back to you at the email you provided.
              </p>
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="mt-4 text-sm font-medium text-emerald-700 underline dark:text-emerald-400"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Name *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Email *</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Phone (optional)</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={form.phone}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, phone: formatPkPhoneInput(e.target.value) }))
                    }
                    placeholder={PK_PHONE_PLACEHOLDER}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Category</label>
                  <CustomSelect
                    value={form.category}
                    onChange={(val) => setForm((f) => ({ ...f, category: val as SupportTicketCategory }))}
                    options={CATEGORY_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Subject *</label>
                <input
                  type="text"
                  required
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder="Brief summary of your issue"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Message *</label>
                <textarea
                  required
                  rows={5}
                  minLength={10}
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                  placeholder="Describe your issue in detail…"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 dark:focus:ring-offset-zinc-900"
              >
                {submitting ? "Sending…" : "Send Message"}
              </button>
            </form>
          )}
        </div>
      </div>
    </LegalPageLayout>
  );
}
