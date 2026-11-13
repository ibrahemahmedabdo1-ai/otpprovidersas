import test from "node:test";
import assert from "node:assert/strict";
import { decideResend, decideVerify } from "./otp-rules";

const now = new Date("2026-01-01T12:00:00Z");
const future = new Date("2026-01-01T12:05:00Z");
const base = { status: "sent", attempts: 0, maxAttempts: 3, expiresAt: future };

test("correct code verifies", () => assert.deepEqual(decideVerify(base, now, true), { kind: "verified", attempts: 1 }));
test("wrong code reports attempts left, then locks on the final attempt", () => {
  assert.deepEqual(decideVerify(base, now, false), { kind: "invalid", attempts: 1, attemptsLeft: 2 });
  assert.deepEqual(decideVerify({ ...base, attempts: 1 }, now, false), { kind: "invalid", attempts: 2, attemptsLeft: 1 });
  assert.deepEqual(decideVerify({ ...base, attempts: 2 }, now, false), { kind: "locked", attempts: 3 });
});
test("once locked, even the correct code is refused", () => {
  assert.equal(decideVerify({ ...base, status: "locked", attempts: 3 }, now, true).kind, "already_locked");
  assert.equal(decideVerify({ ...base, attempts: 3 }, now, true).kind, "already_locked");
});
test("one-time use: verified, cancelled and failed requests cannot be verified again", () => {
  for (const status of ["verified", "cancelled", "failed"]) assert.equal(decideVerify({ ...base, status }, now, true).kind, "not_pending");
});
test("expiry is enforced, including exactly at the expiry instant", () => {
  assert.equal(decideVerify({ ...base, expiresAt: new Date("2026-01-01T11:59:59Z") }, now, true).kind, "expired");
  assert.equal(decideVerify({ ...base, expiresAt: now }, now, true).kind, "expired");
  assert.equal(decideVerify({ ...base, status: "expired" }, now, true).kind, "expired");
});
test("a correct code on the last allowed attempt still verifies", () => assert.deepEqual(decideVerify({ ...base, attempts: 2 }, now, true), { kind: "verified", attempts: 3 }));

const rs = { status: "sent", expiresAt: future, lastSentAt: new Date("2026-01-01T11:59:50Z"), resendCount: 0 };
test("resend respects the cooldown and reports the wait", () => {
  assert.deepEqual(decideResend(rs, now, 30), { kind: "cooldown", retryAfterSec: 20 });
  assert.deepEqual(decideResend(rs, now, 10), { kind: "ok" });
  assert.deepEqual(decideResend({ ...rs, lastSentAt: null }, now, 30), { kind: "ok" });
});
test("resend limits and state checks", () => {
  assert.equal(decideResend({ ...rs, lastSentAt: null, resendCount: 3 }, now, 0).kind, "max_resends");
  assert.equal(decideResend({ ...rs, status: "verified" }, now, 0).kind, "not_pending");
  assert.equal(decideResend({ ...rs, status: "locked" }, now, 0).kind, "not_pending");
  assert.equal(decideResend({ ...rs, expiresAt: now }, now, 0).kind, "expired");
});
