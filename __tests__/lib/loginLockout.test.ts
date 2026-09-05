import {
  getLoginLockout,
  recordLoginFailure,
  clearLoginLockout,
  canSendForgotPassword,
  recordForgotPasswordSend,
  LOGIN_LOCKOUT,
} from "@/lib/loginLockout";

describe("loginLockout progressive policy", () => {
  // Every test gets fully isolated email + IP credentials: the lockout maps
  // are module-level, so sharing one email/IP across tests makes the per-IP
  // spray cap (30) trip in later tests and breaks determinism.
  let credentialCounter = 0;
  function freshCredentials() {
    credentialCounter += 1;
    return {
      email: `user-${Date.now()}-${credentialCounter}@example.com`,
      ip: `203.0.113.${credentialCounter}`,
    };
  }

  it("allows the first free attempts without cooldown", () => {
    const { email, ip } = freshCredentials();
    for (let i = 0; i < LOGIN_LOCKOUT.FREE_ATTEMPTS - 1; i++) {
      const snap = recordLoginFailure(email, ip);
      expect(snap.forceReset).toBe(false);
      expect(snap.retryAfterSec).toBe(0);
      expect(getLoginLockout(email, ip).allowed).toBe(true);
    }
  });

  it("starts a 1-minute lock on the 5th failure and 2 minutes on the 6th", () => {
    const { email, ip } = freshCredentials();
    let last = getLoginLockout(email, ip);
    for (let i = 0; i < LOGIN_LOCKOUT.FREE_ATTEMPTS; i++) {
      last = recordLoginFailure(email, ip);
    }
    expect(last.failures).toBe(5);
    expect(last.allowed).toBe(false);
    expect(last.retryAfterSec).toBeGreaterThanOrEqual(59);
    expect(last.retryAfterSec).toBeLessThanOrEqual(60);

    last = recordLoginFailure(email, ip);
    expect(last.failures).toBe(6);
    expect(last.retryAfterSec).toBeGreaterThanOrEqual(119);
    expect(last.retryAfterSec).toBeLessThanOrEqual(120);
  });

  it("forces password reset after the hard threshold", () => {
    const { email, ip } = freshCredentials();
    let last = getLoginLockout(email, ip);
    for (let i = 0; i < LOGIN_LOCKOUT.FORCE_RESET_AFTER; i++) {
      last = recordLoginFailure(email, ip);
    }
    expect(last.forceReset).toBe(true);
    expect(getLoginLockout(email, ip).allowed).toBe(false);
    expect(getLoginLockout(email, ip).forceReset).toBe(true);
  });

  it("clears lockout after success", () => {
    const { email, ip } = freshCredentials();
    for (let i = 0; i < LOGIN_LOCKOUT.FORCE_RESET_AFTER; i++) {
      recordLoginFailure(email, ip);
    }
    clearLoginLockout(email);
    expect(getLoginLockout(email, ip).allowed).toBe(true);
    expect(getLoginLockout(email, ip).forceReset).toBe(false);
  });

  it("keeps per-IP spray cap independent of the email lock", () => {
    const ip = `203.0.113.99`;
    const base = `spray-${Date.now()}@example.com`;
    // Bump a single IP past the spray cap using 30 distinct emails (each only
    // 1 failure, so no single email triggers its own force-reset lock).
    for (let i = 0; i < LOGIN_LOCKOUT.IP_MAX_FAILURES; i++) {
      recordLoginFailure(base.replace("@", `-${i}@`), ip);
    }
    const snap = getLoginLockout(base.replace("@", "-0@"), ip);
    expect(snap.allowed).toBe(false);
    expect(snap.message).toMatch(/network/i);
    // A different IP on the same email stays allowed (no email lock yet).
    expect(getLoginLockout(base.replace("@", "-0@"), "203.0.113.200").allowed).toBe(true);
  });

  it("caps forgot-password sends at 2 per window", () => {
    const e = `reset-${Date.now()}-${credentialCounter}@example.com`;
    expect(canSendForgotPassword(e).allowed).toBe(true);
    recordForgotPasswordSend(e);
    expect(canSendForgotPassword(e).remaining).toBe(1);
    recordForgotPasswordSend(e);
    const blocked = canSendForgotPassword(e);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });
});
