/* -------------------------------------------------------------------------- */
/*  Pakistani mobile display + input formatting                                 */
/*  Canonical UI format: 0300-1234567 (4 digits + hyphen + 7 digits)          */
/*  Storage / WhatsApp still use normalizePkPhoneDigits → 923XXXXXXXXX        */
/* -------------------------------------------------------------------------- */

/** Generic placeholder — never a real personal number. */
export const PK_PHONE_PLACEHOLDER = "0300-1234567";

/**
 * Strip to local 11-digit mobile (03XXXXXXXXX) when possible.
 * Accepts: 03001234567, 0300-1234567, 0300 1234567, 923001234567, +92 300 1234567, 3001234567
 */
export function toLocalPkMobileDigits(input: string): string {
  if (!input || typeof input !== "string") return "";
  let digits = input.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("92") && digits.length >= 12) {
    digits = `0${digits.slice(2)}`;
  } else if (digits.length === 10 && digits.startsWith("3")) {
    digits = `0${digits}`;
  } else if (digits.startsWith("0") && digits.length > 11) {
    digits = digits.slice(0, 11);
  }

  return digits.slice(0, 11);
}

/** Format for display / inputs: 0300-1234567 */
export function formatPkPhoneDisplay(input: string): string {
  const local = toLocalPkMobileDigits(input);
  if (!local) return "";
  if (local.length <= 4) return local;
  return `${local.slice(0, 4)}-${local.slice(4)}`;
}

/**
 * Live input formatter: keep only digits, max 11 local, insert hyphen after 4th.
 * Returns the display string to put back into the controlled input.
 */
export function formatPkPhoneInput(raw: string): string {
  return formatPkPhoneDisplay(raw);
}

/** True when we have a complete PK mobile (11 local digits starting with 03). */
export function isValidPkMobile(input: string): boolean {
  const local = toLocalPkMobileDigits(input);
  return /^03\d{9}$/.test(local);
}

/** WhatsApp / storage digits from any accepted input → 923XXXXXXXXX */
export function toPkWhatsAppDigits(input: string): string {
  const local = toLocalPkMobileDigits(input);
  if (!/^03\d{9}$/.test(local)) {
    // Fall through: allow already-international 12-digit 92…
    const digits = input.replace(/\D/g, "");
    if (/^92\d{10}$/.test(digits)) return digits;
    return "";
  }
  return `92${local.slice(1)}`;
}
