import type { LegalDocument } from "@/services/legalService";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Legal Document Versioning                                      */
/*                                                                             */
/*  Bump the version for a document here whenever its page content changes    */
/*  materially. Logged-in users who accepted an older version will see the    */
/*  full-screen PolicyNotice once, asking them to re-accept the update.       */
/*  The version string must be lexically comparable (v1 < v2 < v3 …).         */
/* -------------------------------------------------------------------------- */

export const LEGAL_VERSIONS: Record<LegalDocument, string> = {
  terms: "v1",
  privacy: "v1",
  merchant_guidelines: "v1",
};

/** Human-readable label for each legal document (used in the notice). */
export const LEGAL_LABELS: Record<LegalDocument, string> = {
  terms: "Terms & Conditions",
  privacy: "Privacy Policy",
  merchant_guidelines: "Merchant Security Guidelines",
};

/** Read page for each legal document. */
export const LEGAL_HREFS: Record<LegalDocument, string> = {
  terms: "/legal/terms",
  privacy: "/legal/privacy",
  merchant_guidelines: "/legal/merchant-guidelines",
};

/** Documents that apply to every account type. */
export const UNIVERSAL_LEGAL_DOCUMENTS: LegalDocument[] = ["terms", "privacy"];

/**
 * Compare two version strings ("v1", "v2" …). Returns true when `candidate`
 * is older than `current` (i.e. the user needs to re-accept).
 */
export function isVersionBehind(candidate: string | null | undefined, current: string): boolean {
  if (!candidate) return true;
  const toNum = (v: string): number => {
    const match = /v?(\d+)/.exec(v);
    return match ? Number.parseInt(match[1], 10) : 0;
  };
  return toNum(candidate) < toNum(current);
}
