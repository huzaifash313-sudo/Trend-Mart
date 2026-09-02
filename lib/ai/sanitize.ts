/* TrendsMart — AI assistant input sanitization */

export function sanitizeChatString(input: unknown, maxLength = 200): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/on\w+\s*=\s*'[^']*'/gi, "")
    .replace(/on\w+\s*=[^\s>]*/gi, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[*_~`>|\\]/g, "")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeChatNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  if (Math.abs(n) > 99_999_999) return fallback;
  return n;
}

export function sanitizeUserMessage(input: unknown): string {
  if (typeof input !== "string") return "";
  return sanitizeChatString(input, 500);
}

export function isPromptInjection(message: string): boolean {
  const lower = message.toLowerCase();
  const blocked = [
    /ignore (all |previous )?instructions/i,
    /you are now (a |the )?(system|assistant|developer)/i,
    /forget (your |previous )?(context|instructions|rules)/i,
    /pretend (you are|to be)/i,
    /system:\s*/i,
    /<\|system\|>/i,
    /\[SYSTEM\]/i,
    /\[INST\]/i,
  ];
  return blocked.some((p) => p.test(lower));
}
