"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import LegalPageLayout from "@/components/LegalPageLayout";
import MySupportRequests from "@/components/MySupportRequests";
import { useToast } from "@/components/Toast";
import CustomSelect from "@/components/CustomSelect";
import { useLocale } from "@/context/LocaleContext";
import { createSupportTicket } from "@/services/supportService";
import type { SupportTicketCategory, SupportTicketFormData } from "@/types";
import { formatPkPhoneInput, PK_PHONE_PLACEHOLDER } from "@/lib/phoneFormat";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Platform Support Desk                                        */
/* -------------------------------------------------------------------------- */

const CATEGORY_KEYS: { value: SupportTicketCategory; labelKey: string }[] = [
  { value: "general", labelKey: "support.cat.general" },
  { value: "order", labelKey: "support.cat.order" },
  { value: "merchant", labelKey: "support.cat.merchant" },
  { value: "technical", labelKey: "support.cat.technical" },
  { value: "billing", labelKey: "support.cat.billing" },
  { value: "other", labelKey: "support.cat.other" },
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
  const { t } = useLocale();
  const { addToast } = useToast();
  const [form, setForm] = useState<SupportTicketFormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const categoryOptions = useMemo(
    () => CATEGORY_KEYS.map((opt) => ({ value: opt.value, label: t(opt.labelKey) })),
    [t],
  );

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      const result = await createSupportTicket(form);
      if (result.success) {
        setSubmitted(true);
        setForm(INITIAL_FORM);
        addToast(t("support.toastSent"), "success");
      } else {
        addToast(result.error, "error");
      }
      setSubmitting(false);
    },
    [form, addToast, t],
  );

  return (
    <LegalPageLayout
      title={t("support.title")}
      icon="💬"
      lastUpdated={t("support.lastUpdated")}
      activeHref="/support"
    >
      <div className="mb-6">
        <MySupportRequests />
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          <p className="mb-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {t("support.intro")}
          </p>

          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                {t("support.howTitle")}
              </p>
              <p className="mt-2 text-sm text-zinc-800 dark:text-zinc-200">
                {t("support.howBody")}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {t("support.responseTitle")}
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {t("support.responseBody")}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {t("support.beforeTitle")}
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {t("support.beforeBody")}{" "}
                <a
                  href="/faq"
                  className="font-medium text-emerald-600 underline dark:text-emerald-400"
                >
                  {t("support.beforeFaq")}
                </a>
                {t("support.beforeSuffix")}
              </p>
            </div>
          </div>
        </div>

        <div>
          {submitted ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-800 dark:bg-emerald-900/20">
              <div className="mb-2 text-3xl">✅</div>
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                {t("support.sentTitle")}
              </p>
              <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-500">
                {t("support.sentBody")}
              </p>
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="mt-4 text-sm font-medium text-emerald-700 underline dark:text-emerald-400"
              >
                {t("support.sendAnother")}
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    {t("support.name")} *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    {t("support.email")} *
                  </label>
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
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    {t("support.phone")}
                  </label>
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
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    {t("support.category")}
                  </label>
                  <CustomSelect
                    value={form.category}
                    onChange={(val) =>
                      setForm((f) => ({ ...f, category: val as SupportTicketCategory }))
                    }
                    options={categoryOptions}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  {t("support.subject")} *
                </label>
                <input
                  type="text"
                  required
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder={t("support.subjectPlaceholder")}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  {t("support.message")} *
                </label>
                <textarea
                  required
                  rows={5}
                  minLength={10}
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                  placeholder={t("support.messagePlaceholder")}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 dark:focus:ring-offset-zinc-900"
              >
                {submitting ? t("support.sending") : t("support.send")}
              </button>
            </form>
          )}
        </div>
      </div>
    </LegalPageLayout>
  );
}
