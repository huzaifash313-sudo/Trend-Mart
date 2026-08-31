/* -------------------------------------------------------------------------- */
/*  TrendsMart — Legal Acceptance Audit Trail Service                          */
/*  Records that a user explicitly agreed to required legal documents         */
/*  (Terms & Conditions, Privacy Policy, Merchant Security Guidelines) at     */
/*  registration time. Fire-and-forget — never blocks the signup/registration */
/*  flow it accompanies.                                                     */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";

export type LegalDocument = "terms" | "privacy" | "merchant_guidelines";

export type LegalAcceptanceRow = {
  document: LegalDocument;
  version: string;
};

/**
 * Fetch every legal document version the given user has accepted, most recent
 * first. Returns an empty array when nothing is on file yet.
 */
export async function getLegalAcceptances(
  userId: string,
): Promise<LegalAcceptanceRow[]> {
  if (!userId) return [];
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("legal_acceptances")
      .select("document, version")
      .eq("user_id", userId);
    if (error) throw error;
    return ((data as LegalAcceptanceRow[]) ?? []).sort((a, b) =>
      b.version.localeCompare(a.version),
    );
  } catch (err) {
    logError(err, { module: "legalService.getLegalAcceptances", meta: { userId } });
    return [];
  }
}

/**
 * Persist one or more legal acceptance records for a user.
 * Never throws — a missing audit row must not prevent signup/registration.
 * Returns whether the audit rows were written (callers may use this to
 * decide whether to keep a policy notice open).
 */
export async function recordLegalAcceptance(
  userId: string,
  documents: LegalDocument[],
  version = "v1",
): Promise<boolean> {
  if (!userId || documents.length === 0) return false;
  const supabase = createClient();
  try {
    const { error } = await supabase.from("legal_acceptances").insert(
      documents.map((document) => ({
        user_id: userId,
        document,
        version,
      })),
    );
    if (error) throw error;
    return true;
  } catch (err) {
    logError(err, { module: "legalService.recordLegalAcceptance", meta: { userId, documents } });
    return false;
  }
}
