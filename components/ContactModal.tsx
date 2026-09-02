"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getOrCreateConversation } from "@/services/messagingService";
import { logLead } from "@/services/leadsService";
import { formatPkPhoneDisplay, formatPkPhoneInput, PK_PHONE_PLACEHOLDER } from "@/lib/phoneFormat";
import { useToast } from "@/components/Toast";
import Link from "next/link";

function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

interface ContactModalProps {
  shopName: string;
  whatsappNumber: string;
  shopId: string;
  productId?: string;
  onClose: () => void;
}

export default function ContactModal({
  shopName,
  whatsappNumber,
  shopId,
  productId,
  onClose,
}: ContactModalProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  const waDigits = whatsappNumber?.replace(/\D/g, "") ?? "";

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      setSignedIn(!!user);
      if (!user) return;
      const [{ data: profile }, { data: addr }] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("full_name, phone")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("customer_addresses")
          .select("full_name, phone_number")
          .eq("user_id", user.id)
          .order("is_default", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const nextName =
        addr?.full_name || profile?.full_name || user.user_metadata?.full_name || "";
      const nextPhoneRaw =
        addr?.phone_number || profile?.phone || user.user_metadata?.phone || "";
      if (nextName) setName(nextName);
      if (nextPhoneRaw) setPhone(formatPkPhoneDisplay(String(nextPhoneRaw)));
    });
  }, []);

  const handleSendInApp = useCallback(async () => {
    if (!signedIn) {
      addToast("Sign in to chat with the shop in-app.", "info");
      router.push(`/login?redirect=/shop/${shopId}`);
      return;
    }
    setSending(true);
    const result = await getOrCreateConversation({
      shopId,
      customerName: name.trim(),
      customerPhone: phone,
      initialMessage: message.trim(),
    });
    setSending(false);
    if (!result.success) {
      addToast(result.error, "error");
      return;
    }

    logLead({
      shopId,
      customerName: name.trim(),
      customerPhone: phone,
      productId,
      serviceContext: message.trim().slice(0, 200),
      source: "inquiry_form",
    });

    addToast("Message sent!", "success");
    onClose();
    router.push(`/account/inquiries?c=${result.data.id}`);
  }, [addToast, message, name, onClose, phone, productId, router, shopId, signedIn]);

  const handleOpenWhatsApp = useCallback(() => {
    if (!waDigits) return;
    const text = message.trim() || `Hi ${shopName}! I have a question about your products.`;
    window.open(`https://wa.me/${waDigits}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    logLead({
      shopId,
      customerName: name.trim() || "Customer",
      customerPhone: phone,
      productId,
      source: "whatsapp",
    });
  }, [message, name, phone, productId, shopId, shopName, waDigits]);

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Chat with {shopName}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              In-app messaging — chat back and forth like Daraz or Foodpanda
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {signedIn === false ? (
          <div className="space-y-4 py-2 text-center">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Sign in to use in-app chat with {shopName}.
            </p>
            <Link
              href={`/login?redirect=/shop/${shopId}`}
              className="inline-block w-full rounded-full bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Sign in to chat
            </Link>
            {waDigits ? (
              <button
                type="button"
                onClick={handleOpenWhatsApp}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
              >
                <WhatsAppIcon />
                Use WhatsApp instead
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name *"
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatPkPhoneInput(e.target.value))}
                placeholder={PK_PHONE_PLACEHOLDER}
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Ask ${shopName} about availability, price, delivery…`}
              className="mb-4 w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <button
              type="button"
              disabled={sending || !message.trim() || !name.trim() || signedIn === null}
              onClick={() => void handleSendInApp()}
              className="w-full rounded-full bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {sending ? "Starting chat…" : "Send message"}
            </button>
            {waDigits ? (
              <button
                type="button"
                onClick={handleOpenWhatsApp}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <WhatsAppIcon />
                Open WhatsApp instead
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
