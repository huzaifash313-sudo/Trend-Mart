/**
 * POS staff auth — PIN hashing and shift-session integrity.
 *
 * These guard the security boundary that makes counter actions attributable:
 * a wrong PIN must never pass, and a tampered/expired token must never resolve
 * to a staff identity.
 */

// Deterministic signing key so token tests don't depend on the environment.
process.env.POS_STAFF_SESSION_SECRET = "test-secret-for-pos-staff-sessions";

import {
  hashPin,
  verifyPin,
  isValidPinFormat,
  signStaffSession,
  verifyStaffSession,
  STAFF_SESSION_TTL_MS,
} from "@/lib/pos/staffAuth";

describe("PIN format rules", () => {
  it("accepts 4-8 digit PINs", () => {
    expect(isValidPinFormat("1234")).toBe(true);
    expect(isValidPinFormat("90210")).toBe(true);
    expect(isValidPinFormat("12345678")).toBe(true);
  });

  it("rejects non-digits, wrong lengths, and repeated-digit PINs", () => {
    expect(isValidPinFormat("123")).toBe(false);
    expect(isValidPinFormat("123456789")).toBe(false);
    expect(isValidPinFormat("12a4")).toBe(false);
    expect(isValidPinFormat("")).toBe(false);
    // Trivially guessable
    expect(isValidPinFormat("0000")).toBe(false);
    expect(isValidPinFormat("1111")).toBe(false);
  });
});

describe("PIN hashing", () => {
  it("round-trips the correct PIN", () => {
    const stored = hashPin("4821");
    expect(verifyPin("4821", stored)).toBe(true);
  });

  it("rejects a wrong PIN", () => {
    const stored = hashPin("4821");
    expect(verifyPin("4822", stored)).toBe(false);
    expect(verifyPin("", stored)).toBe(false);
  });

  it("never stores the PIN in plaintext", () => {
    const stored = hashPin("4821");
    expect(stored).not.toContain("4821");
    expect(stored.startsWith("scrypt$")).toBe(true);
  });

  it("salts each hash, so the same PIN stores differently every time", () => {
    const a = hashPin("4821");
    const b = hashPin("4821");
    expect(a).not.toEqual(b);
    // …but both still verify.
    expect(verifyPin("4821", a)).toBe(true);
    expect(verifyPin("4821", b)).toBe(true);
  });

  it("returns false instead of throwing on corrupt stored values", () => {
    expect(verifyPin("4821", "")).toBe(false);
    expect(verifyPin("4821", "garbage")).toBe(false);
    expect(verifyPin("4821", "scrypt$nothex$alsonothex")).toBe(false);
    expect(verifyPin("4821", "bcrypt$aa$bb")).toBe(false);
  });
});

describe("staff shift sessions", () => {
  const base = {
    staffId: "11111111-1111-1111-1111-111111111111",
    shopId: "22222222-2222-2222-2222-222222222222",
    role: "cashier" as const,
    name: "Bilal",
  };

  it("round-trips a valid session", () => {
    const session = verifyStaffSession(signStaffSession(base));
    expect(session).not.toBeNull();
    expect(session?.staffId).toBe(base.staffId);
    expect(session?.shopId).toBe(base.shopId);
    expect(session?.role).toBe("cashier");
    expect(session?.name).toBe("Bilal");
  });

  it("defaults to a one-shift expiry", () => {
    const session = verifyStaffSession(signStaffSession(base));
    const expectedExp = Date.now() + STAFF_SESSION_TTL_MS;
    // Generous window — we only care that it's roughly a shift, not exact ms.
    expect(session!.exp).toBeGreaterThan(expectedExp - 10_000);
    expect(session!.exp).toBeLessThanOrEqual(expectedExp + 10_000);
  });

  it("rejects a tampered payload", () => {
    const token = signStaffSession(base);
    const [, signature] = token.split(".");
    // Re-encode the payload as a manager while keeping the original signature.
    const forged = Buffer.from(JSON.stringify({ ...base, role: "manager", exp: Date.now() + 10_000 }))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(verifyStaffSession(`${forged}.${signature}`)).toBeNull();
  });

  it("rejects a bad or missing signature", () => {
    const token = signStaffSession(base);
    const [payload] = token.split(".");
    expect(verifyStaffSession(`${payload}.deadbeef`)).toBeNull();
    expect(verifyStaffSession(payload)).toBeNull();
    expect(verifyStaffSession("")).toBeNull();
    expect(verifyStaffSession(undefined)).toBeNull();
  });

  it("rejects an expired shift", () => {
    const expired = signStaffSession({ ...base, exp: Date.now() - 1 });
    expect(verifyStaffSession(expired)).toBeNull();
  });

  it("rejects an unknown role", () => {
    const token = signStaffSession({
      ...base,
      role: "owner" as unknown as "cashier",
    });
    expect(verifyStaffSession(token)).toBeNull();
  });
});
