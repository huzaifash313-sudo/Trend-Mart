/* -------------------------------------------------------------------------- */
/*  TrendsMart — Payment gateway adapters (JazzCash / EasyPaisa / sandbox)     */
/*  Fill env vars when ready; without keys, sandbox/manual checkout still works */
/* -------------------------------------------------------------------------- */

import { createHash } from "crypto";
import { getPublicAppUrl } from "@/lib/appUrl";

export type PaymentProvider = "manual" | "jazzcash" | "easypaisa" | "stripe" | "sandbox";

export type CheckoutIntent = {
  orderId: string;
  amountPkr: number;
  description: string;
  customerMobile?: string;
  returnPath?: string;
};

export type CheckoutResult = {
  provider: PaymentProvider;
  checkoutUrl: string | null;
  providerRef: string;
  /** When true, caller should credit wallet immediately (dev/sandbox). */
  autoSettle: boolean;
  formFields?: Record<string, string>;
};

function preferProvider(): PaymentProvider {
  if (process.env.PAYMENT_SANDBOX === "true" || process.env.PAYMENT_SANDBOX === "1") {
    return "sandbox";
  }
  if (process.env.JAZZCASH_MERCHANT_ID && process.env.JAZZCASH_PASSWORD && process.env.JAZZCASH_INTEGRITY_SALT) {
    return "jazzcash";
  }
  if (process.env.EASYPAISA_STORE_ID && process.env.EASYPAISA_HASH_KEY) {
    return "easypaisa";
  }
  if (process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    return "stripe";
  }
  return "manual";
}

function jazzCashSecureHash(fields: Record<string, string>, salt: string): string {
  const sortedKeys = Object.keys(fields)
    .filter((k) => k.startsWith("pp_") && fields[k] !== "")
    .sort();
  const payload = salt + "&" + sortedKeys.map((k) => fields[k]).join("&");
  return createHash("sha256").update(payload, "utf8").digest("hex").toUpperCase();
}

/**
 * Build a checkout session. Without gateway credentials this returns a
 * manual/sandbox URL the merchant can complete from Billing (or auto-settle).
 */
export async function createPaymentCheckout(intent: CheckoutIntent): Promise<CheckoutResult> {
  const provider = preferProvider();
  const appUrl = getPublicAppUrl().replace(/\/$/, "");
  const returnUrl = `${appUrl}${intent.returnPath || "/dashboard/billing?paid=1"}`;
  const callbackUrl = `${appUrl}/api/billing/callback`;

  if (provider === "sandbox") {
    return {
      provider,
      checkoutUrl: `${appUrl}/api/billing/sandbox-complete?orderId=${encodeURIComponent(intent.orderId)}`,
      providerRef: `sandbox_${intent.orderId}`,
      autoSettle: false,
    };
  }

  if (provider === "jazzcash") {
    const merchantId = process.env.JAZZCASH_MERCHANT_ID!;
    const password = process.env.JAZZCASH_PASSWORD!;
    const salt = process.env.JAZZCASH_INTEGRITY_SALT!;
    const txnRef = `TM${Date.now()}${intent.orderId.replace(/-/g, "").slice(0, 8)}`.slice(0, 20);
    const amount = String(Math.round(intent.amountPkr) * 100); // paisa
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const txnDateTime = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const expiry = new Date(now.getTime() + 60 * 60 * 1000);
    const expiryDateTime = `${expiry.getFullYear()}${pad(expiry.getMonth() + 1)}${pad(expiry.getDate())}${pad(expiry.getHours())}${pad(expiry.getMinutes())}${pad(expiry.getSeconds())}`;

    const fields: Record<string, string> = {
      pp_Version: "1.1",
      pp_TxnType: "MWALLET",
      pp_Language: "EN",
      pp_MerchantID: merchantId,
      pp_Password: password,
      pp_TxnRefNo: txnRef,
      pp_Amount: amount,
      pp_TxnCurrency: "PKR",
      pp_TxnDateTime: txnDateTime,
      pp_BillReference: intent.orderId.slice(0, 20),
      pp_Description: intent.description.slice(0, 100),
      pp_TxnExpiryDateTime: expiryDateTime,
      pp_ReturnURL: callbackUrl,
      pp_MobileNumber: (intent.customerMobile || "").replace(/\D/g, "").slice(-11),
    };
    fields.pp_SecureHash = jazzCashSecureHash(fields, salt);

    const endpoint =
      process.env.JAZZCASH_CHECKOUT_URL ||
      "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform";

    return {
      provider,
      checkoutUrl: endpoint,
      providerRef: txnRef,
      autoSettle: false,
      formFields: fields,
    };
  }

  if (provider === "easypaisa") {
    // Merchant fills EASYPAISA_* later; return a documented placeholder checkout.
    return {
      provider,
      checkoutUrl: `${appUrl}/dashboard/billing?provider=easypaisa&orderId=${encodeURIComponent(intent.orderId)}`,
      providerRef: `ep_${intent.orderId}`,
      autoSettle: false,
    };
  }

  if (provider === "stripe") {
    // Stripe Checkout requires a live secret — leave hook for later wiring.
    return {
      provider,
      checkoutUrl: `${appUrl}/dashboard/billing?provider=stripe&orderId=${encodeURIComponent(intent.orderId)}`,
      providerRef: `stripe_${intent.orderId}`,
      autoSettle: false,
    };
  }

  // Manual: merchant pays bank/JazzCash number offline; admin marks paid, or
  // they use sandbox. Still creates a trackable order.
  return {
    provider: "manual",
    checkoutUrl: `${appUrl}/dashboard/billing?orderId=${encodeURIComponent(intent.orderId)}&awaiting=1`,
    providerRef: `manual_${intent.orderId}`,
    autoSettle: false,
  };
}

export function verifyJazzCashCallback(fields: Record<string, string>): boolean {
  const salt = process.env.JAZZCASH_INTEGRITY_SALT;
  if (!salt) return false;
  const received = (fields.pp_SecureHash || "").toUpperCase();
  if (!received) return false;
  const copy = { ...fields };
  delete copy.pp_SecureHash;
  const expected = jazzCashSecureHash(copy, salt);
  return expected === received;
}
