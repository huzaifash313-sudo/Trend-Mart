/* -------------------------------------------------------------------------- */
/*  TrendMart — Service Booking & WhatsApp Inquiry Modal (Prompt 3)             */
/*                                                                             */
/*  Specialized booking flow for service providers. Features:                   */
/*   - Select service packages from the provider's offerings                   */
/*   - Pick preferred appointment date & time slot                            */
/*   - Input home address (auto-filled if available from address book)        */
/*   - Emergency/urgent booking flag                                          */
/*   - Auto-generate structured WhatsApp dispatch to the provider             */
/* -------------------------------------------------------------------------- */

"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { createOrder } from "@/services/orderService";
import type { Shop } from "@/types";
import { formatRupees } from "@/lib/formatters";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ServicePackageItem {
  id: string;
  shop_id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  estimated_duration: string;
}

interface BookingFormData {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  preferredDate: string;
  preferredTime: string;
  notes: string;
  isEmergency: boolean;
}

interface BookingErrors {
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  preferredDate?: string;
  preferredTime?: string;
}

interface ServiceBookingModalProps {
  shop: Shop;
  packages: ServicePackageItem[];
  onClose: () => void;
  onBookingPlaced: () => void;
  accentHex?: string;
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function CloseIcon() { return (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>); }
function WhatsAppIcon() { return (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" /></svg>); }
function PackageIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>); }
function ClockIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>); }
function MapPinIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>); }
function CalendarIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>); }
function ZapIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>); }
function CheckIcon() { return (<svg className="h-4 w-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>); }
function SpinnerIcon() { return (<svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>); }
function ChevronLeftIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>); }
function ShieldCheckIcon() { return (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></svg>); }

// ─── Time slots ─────────────────────────────────────────────────────────────

const TIME_SLOTS = [
  "08:00 AM", "09:00 AM", "10:00 AM", "11:00 AM",
  "12:00 PM", "01:00 PM", "02:00 PM", "03:00 PM",
  "04:00 PM", "05:00 PM", "06:00 PM", "07:00 PM", "08:00 PM",
];

// ─── Validation ─────────────────────────────────────────────────────────────

function validateBooking(data: BookingFormData): BookingErrors {
  const errors: BookingErrors = {};

  if (!data.customerName.trim()) {
    errors.customerName = "Full name is required.";
  } else if (data.customerName.trim().length < 2) {
    errors.customerName = "Name must be at least 2 characters.";
  }

  const phone = data.customerPhone.replace(/\D/g, "");
  if (!phone) {
    errors.customerPhone = "Phone number is required.";
  } else if (phone.length < 10) {
    errors.customerPhone = "Enter a valid phone number (min 10 digits).";
  }

  if (data.customerAddress.trim().length < 5) {
    errors.customerAddress = "Please provide your full address (min 5 characters).";
  }

  if (!data.preferredDate) {
    errors.preferredDate = "Please select a preferred date.";
  }

  if (!data.preferredTime) {
    errors.preferredTime = "Please select a preferred time slot.";
  }

  return errors;
}

// ─── Get today's date in YYYY-MM-DD format ──────────────────────────────────

function getToday(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

function getTomorrow(): string {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  return now.toISOString().split("T")[0];
}

// ─── Build WhatsApp Message ─────────────────────────────────────────────────

function buildServiceWhatsAppMessage(
  shopName: string,
  shopLocation: string,
  packages: ServicePackageItem[],
  selectedPackageIds: Set<string>,
  booking: BookingFormData,
  subtotal: number,
  grandTotal: number,
  callOutCharge: number,
): string {
  const selected = packages.filter(p => selectedPackageIds.has(p.id));
  const lines: string[] = [
    `🔧 *Service Booking via TrendMart*`,
    ``,
    `🏪 *Provider:* ${shopName}`,
    `📍 *Location:* ${shopLocation}`,
    ``,
    `──────────────────────────`,
    `📋 *Service Requested*`,
    `──────────────────────────`,
  ];

  for (const pkg of selected) {
    lines.push(`• ${pkg.name}`);
    lines.push(`  ${formatRupees(pkg.price)}${pkg.estimated_duration ? ` — ${pkg.estimated_duration}` : ""}`);
    if (pkg.description) lines.push(`  _${pkg.description}_`);
  }

  lines.push(``);
  lines.push(`──────────────────────────`);
  lines.push(`💵 *Subtotal:* ${formatRupees(subtotal)}`);
  if (callOutCharge > 0) {
    lines.push(`🚗 *Call-Out Charge:* ${formatRupees(callOutCharge)}`);
  }
  lines.push(`✅ *Estimated Total:* ${formatRupees(grandTotal)}`);
  lines.push(`──────────────────────────`);
  lines.push(``);
  lines.push(`👤 *Customer Details*`);
  lines.push(`   Name: ${booking.customerName}`);
  lines.push(`   Phone: ${booking.customerPhone}`);

  if (booking.customerAddress.trim()) {
    lines.push(`   🏠 Address: ${booking.customerAddress.trim()}`);
  }

  lines.push(`   📅 Preferred Date: ${booking.preferredDate}`);
  lines.push(`   🕐 Preferred Time: ${booking.preferredTime}`);

  if (booking.isEmergency) {
    lines.push(`   ⚡ *URGENT / EMERGENCY REQUEST*`);
  }

  if (booking.notes.trim()) {
    lines.push(`   📝 Notes: ${booking.notes.trim()}`);
  }

  lines.push(``);
  lines.push(`──────────────────────────`);
  lines.push(`_Sent via TrendMart — Your Local Service Hub_`);
  lines.push(`_🕐 ${new Date().toLocaleString("en-PK", { dateStyle: "full", timeStyle: "short" })}_`);

  return lines.join("\n");
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ServiceBookingModal({
  shop,
  packages,
  onClose,
  onBookingPlaced,
  accentHex = "#10b981",
}: ServiceBookingModalProps) {
  const supabase = useMemo(() => createClient(), []);

  // Step: "select" | "details" | "confirm" | "success"
  const [step, setStep] = useState<"select" | "details" | "confirm" | "success">("select");
  const [selectedPackageIds, setSelectedPackageIds] = useState<Set<string>>(new Set());
  const [booking, setBooking] = useState<BookingFormData>({
    customerName: "",
    customerPhone: "",
    customerAddress: "",
    preferredDate: "",
    preferredTime: "",
    notes: "",
    isEmergency: false,
  });
  const [errors, setErrors] = useState<BookingErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const phone = shop.whatsapp_number?.replace(/\D/g, "") ?? "";

  // Computed pricing
  const subtotal = useMemo(() => {
    return packages
      .filter(p => selectedPackageIds.has(p.id))
      .reduce((sum, p) => sum + p.price, 0);
  }, [packages, selectedPackageIds]);

  const callOutCharge = shop.call_out_charge ?? 0;
  const grandTotal = subtotal + (subtotal > 0 ? callOutCharge : 0);

  // Toggle package selection
  const togglePackage = useCallback((pkgId: string) => {
    setSelectedPackageIds(prev => {
      const next = new Set(prev);
      if (next.has(pkgId)) {
        next.delete(pkgId);
      } else {
        next.add(pkgId);
      }
      return next;
    });
  }, []);

  // Move to details step
  const handleContinue = useCallback(() => {
    if (selectedPackageIds.size === 0) return;
    setStep("details");
  }, [selectedPackageIds]);

  // Move back
  const handleBack = useCallback(() => {
    if (step === "details") setStep("select");
    if (step === "confirm") setStep("details");
    setErrors({});
    setSubmitError(null);
  }, [step]);

  // Submit details → confirm
  const handleDetailsSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validateBooking(booking);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length === 0) {
      setStep("confirm");
    }
  }, [booking]);

  // Generate date options: today + next 14 days
  const dateOptions = useMemo(() => {
    const options: string[] = [];
    const start = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      options.push(d.toISOString().split("T")[0]);
    }
    return options;
  }, []);

  // Submit booking
  const handlePlaceBooking = useCallback(async () => {
    if (!phone) {
      setSubmitError("This provider does not have a valid WhatsApp number configured.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Create an order record for analytics
      const selected = packages.filter(p => selectedPackageIds.has(p.id));
      await createOrder({
        shopId: shop.id,
        customerName: booking.customerName.trim(),
        customerPhone: booking.customerPhone.replace(/\D/g, ""),
        items: selected.map(pkg => ({
          product_id: pkg.id,
          name: `[Service] ${pkg.name}`,
          price: pkg.price,
          variant: pkg.estimated_duration,
        })),
      });

      // Build WhatsApp message
      const whatsappText = buildServiceWhatsAppMessage(
        shop.name,
        shop.location,
        packages,
        selectedPackageIds,
        booking,
        subtotal,
        grandTotal,
        callOutCharge,
      );

      setStep("success");

      setTimeout(() => {
        window.open(
          `https://wa.me/${phone}?text=${encodeURIComponent(whatsappText)}`,
          "_blank",
        );
        onBookingPlaced();
      }, 1200);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to place booking.");
      setIsSubmitting(false);
    }
  }, [
    phone, shop, packages, selectedPackageIds, booking,
    subtotal, grandTotal, callOutCharge, onBookingPlaced,
  ]);

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                🔧
              </span>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                {step === "select" && "Book a Service"}
                {step === "details" && "Your Details"}
                {step === "confirm" && "Confirm Booking"}
                {step === "success" && "Booking Sent! 🎉"}
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {step === "select" && `Select services from ${shop.name}`}
              {step === "details" && "Enter your contact & schedule preferences"}
              {step === "confirm" && "Review everything before sending"}
              {step === "success" && "Opening WhatsApp for you..."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* ── Progress Steps ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-1 px-6 py-3">
          {(["select", "details", "confirm"] as const).map((s, idx) => {
            const steps = ["select", "details", "confirm"];
            const currentIdx = steps.indexOf(step);
            const done = currentIdx > idx || step === "success";
            const active = step === s;
            return (
              <div key={s} className="flex items-center gap-1">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    active
                      ? "bg-orange-600 text-white"
                      : done
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                  }`}
                >
                  {idx + 1}
                </div>
                {idx < 2 && <div className="h-px w-6 bg-zinc-200 dark:bg-zinc-700" />}
              </div>
            );
          })}
        </div>

        {/* ── Step: Select Packages ───────────────────────────────────────── */}
        {step === "select" && (
          <div>
            <div className="max-h-72 overflow-y-auto px-6 py-4 space-y-3">
              {packages.length === 0 ? (
                <p className="text-center text-sm text-zinc-400 py-6">
                  No service packages configured yet. Send a general inquiry below.
                </p>
              ) : (
                packages.map(pkg => {
                  const isSelected = selectedPackageIds.has(pkg.id);
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => togglePackage(pkg.id)}
                      className={`w-full text-left rounded-xl border p-4 transition-all ${
                        isSelected
                          ? "border-orange-300 bg-orange-50 ring-2 ring-orange-500/20 dark:border-orange-700 dark:bg-orange-900/20"
                          : "border-zinc-200 bg-white hover:border-orange-200 dark:border-zinc-800 dark:bg-zinc-800/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <PackageIcon />
                            <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{pkg.name}</h4>
                            {isSelected && <CheckIcon />}
                          </div>
                          {pkg.description && (
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">{pkg.description}</p>
                          )}
                          <div className="mt-2 flex items-center gap-3">
                            <span className="text-sm font-bold text-orange-600 dark:text-orange-400">
                              {formatRupees(pkg.price)}
                            </span>
                            {pkg.estimated_duration && (
                              <span className="inline-flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                                <ClockIcon /> {pkg.estimated_duration}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                          isSelected
                            ? "border-orange-600 bg-orange-600"
                            : "border-zinc-300 dark:border-zinc-600"
                        }`}>
                          {isSelected && (
                            <svg className="h-3 w-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Pricing summary & CTA */}
            <div className="border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
              {subtotal > 0 && (
                <div className="mb-4 space-y-1 rounded-xl bg-orange-50 p-3 dark:bg-orange-900/20">
                  <div className="flex justify-between text-sm">
                    <span className="text-orange-800 dark:text-orange-200">Service Subtotal</span>
                    <span className="font-semibold text-orange-700 dark:text-orange-300">{formatRupees(subtotal)}</span>
                  </div>
                  {callOutCharge > 0 && (
                    <div className="flex justify-between text-sm border-t border-orange-200/50 pt-1 dark:border-orange-700/50">
                      <span className="text-orange-700 dark:text-orange-300">Call-Out Charge</span>
                      <span className="font-semibold text-orange-700 dark:text-orange-300">{formatRupees(callOutCharge)}</span>
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={handleContinue}
                disabled={selectedPackageIds.size === 0}
                className="w-full rounded-full bg-orange-600 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-600/25 transition-all hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {selectedPackageIds.size === 0 ? "Select a Service to Continue" : `Continue → (${selectedPackageIds.size} selected)`}
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Booking Details ──────────────────────────────────────── */}
        {step === "details" && (
          <form onSubmit={handleDetailsSubmit}>
            <div className="max-h-72 overflow-y-auto space-y-4 px-6 py-5">
              {/* Name */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Full Name *</label>
                <input
                  type="text"
                  required
                  value={booking.customerName}
                  onChange={(e) => setBooking(b => ({ ...b, customerName: e.target.value }))}
                  placeholder="Ahmed Khan"
                  className={`w-full rounded-xl border bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 ${
                    errors.customerName ? "border-red-300 focus:ring-red-500/20" : "border-zinc-200 focus:border-orange-500 focus:ring-orange-500/20"
                  } dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100`}
                />
                {errors.customerName && <p className="mt-1 text-xs text-red-500">{errors.customerName}</p>}
              </div>

              {/* Phone */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Phone Number *</label>
                <input
                  type="tel"
                  required
                  value={booking.customerPhone}
                  onChange={(e) => setBooking(b => ({ ...b, customerPhone: e.target.value }))}
                  placeholder="+92 300 1234567"
                  className={`w-full rounded-xl border bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 ${
                    errors.customerPhone ? "border-red-300 focus:ring-red-500/20" : "border-zinc-200 focus:border-orange-500 focus:ring-orange-500/20"
                  } dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100`}
                />
                {errors.customerPhone && <p className="mt-1 text-xs text-red-500">{errors.customerPhone}</p>}
              </div>

              {/* Address */}
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  <MapPinIcon /> Home / Service Address *
                </label>
                <input
                  type="text"
                  required
                  value={booking.customerAddress}
                  onChange={(e) => setBooking(b => ({ ...b, customerAddress: e.target.value }))}
                  placeholder="House 123, Street 4, Gulberg, Lahore"
                  className={`w-full rounded-xl border bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 ${
                    errors.customerAddress ? "border-red-300 focus:ring-red-500/20" : "border-zinc-200 focus:border-orange-500 focus:ring-orange-500/20"
                  } dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100`}
                />
                {errors.customerAddress && <p className="mt-1 text-xs text-red-500">{errors.customerAddress}</p>}
              </div>

              {/* Date & Time row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    <CalendarIcon /> Preferred Date *
                  </label>
                  <select
                    value={booking.preferredDate}
                    onChange={(e) => setBooking(b => ({ ...b, preferredDate: e.target.value }))}
                    className={`w-full rounded-xl border bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 ${
                      errors.preferredDate ? "border-red-300 focus:ring-red-500/20" : "border-zinc-200 focus:border-orange-500 focus:ring-orange-500/20"
                    } dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100`}
                  >
                    <option value="">Select date</option>
                    {dateOptions.map(d => (
                      <option key={d} value={d}>
                        {d === getToday() ? `Today (${d})` : d === getTomorrow() ? `Tomorrow (${d})` : d}
                      </option>
                    ))}
                  </select>
                  {errors.preferredDate && <p className="mt-1 text-xs text-red-500">{errors.preferredDate}</p>}
                </div>

                <div>
                  <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    <ClockIcon /> Preferred Time *
                  </label>
                  <select
                    value={booking.preferredTime}
                    onChange={(e) => setBooking(b => ({ ...b, preferredTime: e.target.value }))}
                    className={`w-full rounded-xl border bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 ${
                      errors.preferredTime ? "border-red-300 focus:ring-red-500/20" : "border-zinc-200 focus:border-orange-500 focus:ring-orange-500/20"
                    } dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100`}
                  >
                    <option value="">Select time</option>
                    {TIME_SLOTS.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  {errors.preferredTime && <p className="mt-1 text-xs text-red-500">{errors.preferredTime}</p>}
                </div>
              </div>

              {/* Emergency Toggle */}
              <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
                <div className="flex items-center gap-2">
                  <ZapIcon />
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Emergency / Urgent</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Request urgent service</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={booking.isEmergency}
                  onClick={() => setBooking(b => ({ ...b, isEmergency: !b.isEmergency }))}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    booking.isEmergency ? "bg-red-500" : "bg-zinc-300 dark:bg-zinc-600"
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    booking.isEmergency ? "translate-x-5" : "translate-x-0"
                  }`} />
                </button>
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Additional Notes <span className="font-normal text-zinc-400">(optional)</span></label>
                <textarea
                  rows={2}
                  value={booking.notes}
                  onChange={(e) => setBooking(b => ({ ...b, notes: e.target.value }))}
                  placeholder="Describe your specific needs, any particular issue..."
                  className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
              <button
                type="button"
                onClick={handleBack}
                className="rounded-full px-6 py-3 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                ← Back
              </button>
              <button
                type="submit"
                className="flex-1 rounded-full bg-orange-600 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-600/25 transition-all hover:bg-orange-700"
              >
                Review Booking →
              </button>
            </div>
          </form>
        )}

        {/* ── Step: Confirm ───────────────────────────────────────────────── */}
        {step === "confirm" && (
          <div>
            <div className="max-h-72 overflow-y-auto px-6 py-5 space-y-4">
              {/* Selected Packages */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Services Selected</h4>
                {packages.filter(p => selectedPackageIds.has(p.id)).map(pkg => (
                  <div key={pkg.id} className="flex justify-between text-sm">
                    <span className="text-zinc-700 dark:text-zinc-300">
                      {pkg.name}
                      {pkg.estimated_duration && <span className="text-xs text-zinc-400 ml-1">({pkg.estimated_duration})</span>}
                    </span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{formatRupees(pkg.price)}</span>
                  </div>
                ))}
              </div>

              {/* Pricing */}
              <div className="rounded-xl bg-orange-50 p-3 dark:bg-orange-900/20 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-orange-800 dark:text-orange-200">Service Subtotal</span>
                  <span className="font-semibold">{formatRupees(subtotal)}</span>
                </div>
                {callOutCharge > 0 && (
                  <div className="flex justify-between text-sm border-t border-orange-200/50 pt-1 dark:border-orange-700/50">
                    <span className="text-orange-700 dark:text-orange-300">Call-Out Charge</span>
                    <span className="font-semibold">{formatRupees(callOutCharge)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold border-t border-orange-200/50 pt-1 dark:border-orange-700/50">
                  <span className="text-orange-800 dark:text-orange-200">Estimated Total</span>
                  <span className="text-orange-700 dark:text-orange-300">{formatRupees(grandTotal)}</span>
                </div>
              </div>

              {/* Customer Info */}
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50 space-y-1">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Appointment Details</h4>
                <p className="text-sm text-zinc-900 dark:text-zinc-100"><strong>{booking.customerName}</strong></p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{booking.customerPhone}</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">🏠 {booking.customerAddress}</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  📅 {booking.preferredDate} at {booking.preferredTime}
                </p>
                {booking.isEmergency && (
                  <p className="rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 dark:bg-red-900/20 dark:text-red-400">
                    ⚡ Emergency / Urgent Request
                  </p>
                )}
                {booking.notes && (
                  <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                    📝 {booking.notes}
                  </p>
                )}
              </div>

              {/* Provider Info */}
              <div className="rounded-xl border border-orange-100 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-900/20">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔧</span>
                  <div>
                    <p className="text-sm font-semibold text-orange-800 dark:text-orange-200">{shop.name}</p>
                    <p className="text-xs text-orange-600 dark:text-orange-400">📍 {shop.location}</p>
                  </div>
                </div>
              </div>

              {submitError && (
                <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                  {submitError}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
              <button
                type="button"
                onClick={handleBack}
                disabled={isSubmitting}
                className="rounded-full px-6 py-3 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                ← Edit
              </button>
              <button
                type="button"
                onClick={handlePlaceBooking}
                disabled={isSubmitting || !phone}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-orange-600 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-600/25 transition-all hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? (
                  <><SpinnerIcon /> Sending...</>
                ) : (
                  <><WhatsAppIcon /> Send via WhatsApp</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Success ───────────────────────────────────────────────── */}
        {step === "success" && (
          <div className="px-6 py-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <ShieldCheckIcon />
            </div>
            <h4 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Booking Request Sent!</h4>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              WhatsApp is opening with your service request.
            </p>
            <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
              {shop.name} will confirm your appointment shortly.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 rounded-full px-8 py-2.5 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
