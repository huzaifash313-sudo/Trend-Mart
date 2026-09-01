import {
  getLoginLockout,
  recordLoginFailure,
  clearLoginLockout,
  canSendForgotPassword,
  recordForgotPasswordSend,
  LOGIN_LOCKOUT,
} from "@/lib/loginLockout";

describe("loginLockout progressive policy", () => {
  const email = `user-${Date.now()}@example.com`;
  const ip = "203.0.113.10";

  beforeEach(() => {
    clearLoginLockout(email);
  });

  it("allows the first free attempts without cooldown", () => {
    for (let i = 0; i < LOGIN_LOCKOUT.FREE_ATTEMPTS - 1; i++) {
      const snap = recordLoginFailure(email, ip);
      expect(snap.forceReset).toBe(false);
      expect(snap.retryAfterSec).toBe(0);
      expect(getLoginLockout(email, ip).allowed).toBe(true);
    }
  });

  it("starts a 1-minute lock on the 5th failure and 2 minutes on the 6th", () => {
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
    let last = getLoginLockout(email, ip);
    for (let i = 0; i < LOGIN_LOCKOUT.FORCE_RESET_AFTER; i++) {
      last = recordLoginFailure(email, ip);
    }
    expect(last.forceReset).toBe(true);
    expect(getLoginLockout(email, ip).allowed).toBe(false);
    expect(getLoginLockout(email, ip).forceReset).toBe(true);
  });

  it("clears lockout after success", () => {
    for (let i = 0; i < LOGIN_LOCKOUT.FORCE_RESET_AFTER; i++) {
      recordLoginFailure(email, ip);
    }
    clearLoginLockout(email);
    expect(getLoginLockout(email, ip).allowed).toBe(true);
    expect(getLoginLockout(email, ip).forceReset).toBe(false);
  });

  it("caps forgot-password sends at 2 per window", () => {
    const e = `reset-${Date.now()}@example.com`;
    expect(canSendForgotPassword(e).allowed).toBe(true);
    recordForgotPasswordSend(e);
    expect(canSendForgotPassword(e).remaining).toBe(1);
    recordForgotPasswordSend(e);
    const blocked = canSendForgotPassword(e);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });
});
