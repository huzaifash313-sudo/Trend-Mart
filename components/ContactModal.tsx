"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { logInquiry } from "@/services/inquiryService";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                     */
/* -------------------------------------------------------------------------- */

function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Props                                                                     */
/* -------------------------------------------------------------------------- */

interface ContactModalProps {
  shopName: string;
  whatsappNumber: string;
  /** Required: Shop ID used to persist the inquiry to Supabase for the merchant dashboard. */
  shopId: string;
  /** Optional: Product ID to link inquiry to a specific product. */
  productId?: string;
  onClose: () => void;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Reusable contact & inquiry widget.
 *
 * Allows customers to type a message and send it via WhatsApp, while
 * simultaneously persisting the inquiry to the database (fire-and-forget)
 * so it appears in the merchant's dashboard.
 */
export default function ContactModal({ shopName, whatsappNumber, shopId, productId, onClose }: ContactModalProps) {
  const [message, setMessage] = useState("");
  const [inquirySent, setInquirySent] = useState(false);
  const pendingInquiryRef = useRef(false);

  const phone = whatsappNumber?.replace(/\D/g, "") ?? "";

  // Persist inquiry to DB on unmount if it hasn't been sent yet
  useEffect(() => {
    return () => {
      if (!pendingInquiryRef.current && message.trim() && shopId) {
        pendingInquiryRef.current = true;
        logInquiry(shopId, "", message.trim(), productId);
      }
    };
  }, [message, shopId, productId]);

  const handleSend = useCallback(() => {
    if (!phone) return;

    // Fire-and-forget: save the inquiry to the database
    if (!inquirySent && shopId) {
      setInquirySent(true);
      pendingInquiryRef.current = true;
      logInquiry(
        shopId,
        "", // customer name — unknown at this point; merchant can ask in WhatsApp
        message.trim() || `Inquiry about products at ${shopName}`,
        productId,
      );
    }

    const text = message.trim() || `Hi ${shopName}! I'm interested in your products.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
    onClose();
  }, [phone, message, shopName, shopId, productId, inquirySent, onClose]);

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Contact {shopName}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Message input */}
        <textarea
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={`Hi ${shopName}, I'd like to inquire about...`}
          className="mb-4 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />

        {/* Send via WhatsApp */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!phone}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-zinc-900"
        >
          <WhatsAppIcon />
          Send via WhatsApp
        </button>

        <p className="mt-3 text-center text-xs text-zinc-400 dark:text-zinc-500">
          Your message will open in WhatsApp
        </p>
      </div>
    </div>
  );
}
