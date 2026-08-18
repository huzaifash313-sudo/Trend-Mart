/* -------------------------------------------------------------------------- */
/*  lib/otp — email verification code core (generation / hashing / expiry)     */
/* -------------------------------------------------------------------------- */

import {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  generateOtpCode,
  isValidOtpFormat,
  hashOtp,
  timingSafeEqualHex,
  verifyOtpHash,
  otpExpiryIso,
  isOtpExpired,
  resendCooldownRemainingMs,
} from "@/lib/otp";

const SECRET = "test-service-role-secret";
const EMAIL = "Buyer@Example.com";

describe("generateOtpCode", () => {
  it("returns a zero-padded 6-digit numeric string", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateOtpCode();
      expect(code).toHaveLength(OTP_LENGTH);
      expect(isValidOtpFormat(code)).toBe(true);
    }
  });

  it("produces varied codes (not a constant)", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateOtpCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("isValidOtpFormat", () => {
  it("accepts exactly 6 digits, including all-zeros", () => {
    expect(isValidOtpFormat("000000")).toBe(true);
    expect(isValidOtpFormat("123456")).toBe(true);
  });
  it("rejects wrong length / non-digits", () => {
    expect(isValidOtpFormat("12345")).toBe(false);
    expect(isValidOtpFormat("1234567")).toBe(false);
    expect(isValidOtpFormat("12a456")).toBe(false);
    expect(isValidOtpFormat("")).toBe(false);
    expect(isValidOtpFormat(" 123456")).toBe(false);
  });
});

describe("hashOtp", () => {
  it("is deterministic for the same code+email+secret", () => {
    expect(hashOtp("123456", EMAIL, SECRET)).toBe(hashOtp("123456", EMAIL, SECRET));
  });
  it("is case-insensitive on the email (bound to normalized email)", () => {
    expect(hashOtp("123456", "buyer@example.com", SECRET)).toBe(
      hashOtp("123456", "BUYER@EXAMPLE.COM", SECRET),
    );
  });
  it("differs for a different code, email, or secret", () => {
    const base = hashOtp("123456", EMAIL, SECRET);
    expect(hashOtp("654321", EMAIL, SECRET)).not.toBe(base);
    expect(hashOtp("123456", "other@example.com", SECRET)).not.toBe(base);
    expect(hashOtp("123456", EMAIL, "different-secret")).not.toBe(base);
  });
  it("returns 64 hex chars (SHA-256)", () => {
    expect(hashOtp("123456", EMAIL, SECRET)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("timingSafeEqualHex", () => {
  it("true for identical hex strings", () => {
    const h = hashOtp("111111", EMAIL, SECRET);
    expect(timingSafeEqualHex(h, h)).toBe(true);
  });
  it("false for different values, lengths, or non-hex input", () => {
    const a = hashOtp("111111", EMAIL, SECRET);
    const b = hashOtp("222222", EMAIL, SECRET);
    expect(timingSafeEqualHex(a, b)).toBe(false);
    expect(timingSafeEqualHex(a, a.slice(0, -2))).toBe(false);
    expect(timingSafeEqualHex("", "")).toBe(false);
    expect(timingSafeEqualHex("zz", "zz")).toBe(false);
  });
});

describe("verifyOtpHash", () => {
  it("accepts the correct code and rejects everything else", () => {
    const stored = hashOtp("246810", EMAIL, SECRET);
    expect(verifyOtpHash("246810", EMAIL, stored, SECRET)).toBe(true);
    // Correct code but email is normalized the same way → still valid.
    expect(verifyOtpHash("246810", "buyer@example.com", stored, SECRET)).toBe(true);

    expect(verifyOtpHash("999999", EMAIL, stored, SECRET)).toBe(false);
    expect(verifyOtpHash("246810", "attacker@example.com", stored, SECRET)).toBe(false);
    expect(verifyOtpHash("246810", EMAIL, stored, "wrong-secret")).toBe(false);
    expect(verifyOtpHash("24681", EMAIL, stored, SECRET)).toBe(false); // bad format
  });
});

describe("expiry + cooldown helpers", () => {
  it("otpExpiryIso is TTL in the future and not yet expired", () => {
    const now = 1_000_000_000_000;
    const iso = otpExpiryIso(now);
    expect(new Date(iso).getTime()).toBe(now + OTP_TTL_MS);
    expect(isOtpExpired(iso, now)).toBe(false);
    expect(isOtpExpired(iso, now + OTP_TTL_MS - 1)).toBe(false);
  });

  it("isOtpExpired is true at/after expiry and for garbage", () => {
    const now = 1_000_000_000_000;
    const iso = otpExpiryIso(now);
    expect(isOtpExpired(iso, now + OTP_TTL_MS)).toBe(true);
    expect(isOtpExpired(iso, now + OTP_TTL_MS + 5000)).toBe(true);
    expect(isOtpExpired("not-a-date", now)).toBe(true);
  });

  it("resendCooldownRemainingMs counts down then reaches zero", () => {
    const now = 1_000_000_000_000;
    const lastSent = new Date(now).toISOString();
    expect(resendCooldownRemainingMs(lastSent, now)).toBe(OTP_RESEND_COOLDOWN_MS);
    expect(resendCooldownRemainingMs(lastSent, now + OTP_RESEND_COOLDOWN_MS / 2)).toBe(
      OTP_RESEND_COOLDOWN_MS / 2,
    );
    expect(resendCooldownRemainingMs(lastSent, now + OTP_RESEND_COOLDOWN_MS)).toBe(0);
    expect(resendCooldownRemainingMs(lastSent, now + OTP_RESEND_COOLDOWN_MS + 5000)).toBe(0);
  });

  it("exposes sane constants", () => {
    expect(OTP_LENGTH).toBe(6);
    expect(OTP_MAX_ATTEMPTS).toBeGreaterThan(0);
    expect(OTP_TTL_MS).toBeGreaterThan(0);
    expect(OTP_RESEND_COOLDOWN_MS).toBeGreaterThan(0);
  });
});
