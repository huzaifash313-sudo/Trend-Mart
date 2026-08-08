/* -------------------------------------------------------------------------- */
/*  TrendMart — Legal Acceptance Audit Trail Service                          */
/*  Records that a user explicitly agreed to required legal documents         */
/*  (Terms & Conditions, Privacy Policy, Merchant Security Guidelines) at     */
/*  registration time. Fire-and-forget — never blocks the signup/registration */
/*  flow it accompanies.                                                     */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";

export type LegalDocument = "terms" | "privacy" | "merchant_guidelines";

/**
 * Persist one or more legal acceptance records for a user.
 * Silently logs (but does not throw) on failure — a missing audit row must
 * never prevent a user from completing signup or store registration.
 */
export async function recordLegalAcceptance(
  userId: string,
  documents: LegalDocument[],
  version = "v1",
): Promise<void> {
  if (!userId || documents.length === 0) return;
  const supabase = createClient();
  try {
    await supabase.from("legal_acceptances").insert(
      documents.map((document) => ({
        user_id: userId,
        document,
        version,
      })),
    );
  } catch (err) {
    logError(err, { module: "legalService.recordLegalAcceptance", meta: { userId, documents } });
  }
}
