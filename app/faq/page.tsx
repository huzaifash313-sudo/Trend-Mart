"use client";

import { useState } from "react";
import LegalPageLayout from "@/components/LegalPageLayout";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — FAQ & New Merchant Guide                                     */
/*  Interactive accordion covering both customer questions and a step-by-step */
/*  onboarding guide for new business owners (per .cursorrules §8).           */
/* -------------------------------------------------------------------------- */

interface FaqItem {
  q: string;
  a: string;
}

const CUSTOMER_FAQS: FaqItem[] = [
  {
    q: "Do I need an account to browse shops?",
    a: "No — you can freely browse shops, categories, and products, and even build a cart, without signing up. To place an order you need an account with your full name, phone number, and a verified email. Phone SMS OTP is not required right now.",
  },
  {
    q: "How do I place an order?",
    a: "Create an account and verify your email, add items to your cart, tap Checkout, enter your delivery details, share your live location (required for the rider), and confirm. TrendsMart saves the order, then you tap Open WhatsApp to send it to the shop. The shop only sees the WhatsApp message after that tap. Each item includes a TrendsMart link so the shop can open the exact product.",
  },
  {
    q: "Why can't I see a shop that I know exists nearby?",
    a: "Merchants set a delivery/service radius. If you're outside that radius, or the shop's location hasn't been pinned yet, it won't appear in your nearby results. Try widening your search radius from the filter.",
  },
  {
    q: "How does delivery pricing work?",
    a: "Each merchant sets their own minimum order amount and delivery fee slabs — for example, free delivery above a spending threshold, or a small fee that increases with distance. These are shown clearly at checkout before you confirm.",
  },
  {
    q: "Can I cancel or return an order?",
    a: "Orders can usually be cancelled while still Pending. For returns, damaged items, or disputes, see our Refund & Order Policy — most issues are resolved directly with the merchant via WhatsApp.",
  },
  {
    q: "How do I track my order?",
    a: "Visit Orders → Track Order. Status stays Pending until the shop updates it in their dashboard (Processing → Dispatched → Delivered). This is not live GPS tracking, and we do not send automatic status notifications.",
  },
];

const MERCHANT_FAQS: FaqItem[] = [
  {
    q: "How do I register my store?",
    a: "Sign up, verify your email, then open Dashboard and fill in your store (name, category, phone, logo, banner). There is no approval queue — once your email is verified and the shop details are complete, the store can go live.",
  },
  {
    q: "How fast can I list a product?",
    a: "Use the 4-field Quick Add form on your dashboard: Name, Category, Price, and Image. That's it — your product is live. You can always add a description, discount price, or mark it unavailable later.",
  },
  {
    q: "How do I pause a product without deleting it?",
    a: "Each product has an In Stock / Out of Stock (or Not available) toggle. TrendsMart does not track unit counts — merchants sell both in-store and online, so quantity would be wrong. Toggle off to pause selling without deleting the item.",
  },
  {
    q: "How do I control which customers can order from me?",
    a: "Set your shop's pinned location and delivery radius once from Dashboard → Settings → Delivery area. That pin stays fixed (orders leave from the dukaan). Only change it there if the shop moves. Customers still use their own live GPS for nearby distance.",
  },
  {
    q: "How do I show a discount badge on a product?",
    a: "When adding or editing a product, expand \"optional details\" and set an Original Price higher than your selling Price. TrendsMart automatically calculates and displays a \"% OFF\" badge.",
  },
  {
    q: "How do I get a QR code for my shop?",
    a: "Your unique shop QR code is auto-generated in Dashboard → Settings. Download it and print it for your counter or storefront — scanning it takes customers straight to your store page.",
  },
  {
    q: "How will I receive orders?",
    a: "Saved orders appear in your Dashboard. The customer still has to tap Open WhatsApp to send you the compiled message — WhatsApp does not send itself. Keep an eye on Dashboard and WhatsApp.",
  },
  {
    q: "How do I mark my shop Closed for today?",
    a: "Use the Open / Closed switch on Dashboard or Store settings. That switch is what customers see. Business hours text is only a label (for example Mon–Sat 9 AM–10 PM) and does not open or close the shop by itself.",
  },
];

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
