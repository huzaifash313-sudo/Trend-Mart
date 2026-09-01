"use client";

import { useState } from "react";
import LegalPageLayout from "@/components/LegalPageLayout";
import {
  CUSTOMER_FAQS,
  MERCHANT_FAQS,
  type FaqItem,
} from "@/lib/content/faq";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — FAQ & New Merchant Guide                                     */
/* -------------------------------------------------------------------------- */

function FaqAccordionItem({ item, isOpen, onToggle }: { item: FaqItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 bg-white px-4 py-3 text-left text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800/60"
      >
        <span>{item.q}</span>
        <span className={`shrink-0 text-zinc-400 transition-transform ${isOpen ? "rotate-45" : ""}`}>+</span>
      </button>
      {isOpen && (
        <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-3 text-sm leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
          {item.a}
        </div>
      )}
    </div>
  );
}

function FaqGroup({ title, items }: { title: string; items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-zinc-900 dark:text-zinc-100">{title}</h2>
      <div className="space-y-2">
        {items.map((item, i) => (
          <FaqAccordionItem
            key={item.q}
            item={item}
            isOpen={openIndex === i}
            onToggle={() => setOpenIndex((prev) => (prev === i ? null : i))}
          />
        ))}
      </div>
    </section>
  );
}

export default function FaqPage() {
  return (
    <LegalPageLayout title="FAQ & Merchant Guide" icon="❓" lastUpdated="August 13, 2026">
      <div className="space-y-8">
        <FaqGroup title="For Customers" items={CUSTOMER_FAQS} />
        <FaqGroup title="For Merchants — New Business Owner Guide" items={MERCHANT_FAQS} />
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
          Still stuck? Our team is happy to help — visit the{" "}
          <a href="/support" className="font-semibold underline">Support Desk</a> and we&apos;ll get back to you.
        </div>
      </div>
    </LegalPageLayout>
  );
}
