/** Pure decision rules for OTP verification and resend. The service applies the decision inside a row-locked transaction. */
export interface VerifyState { status: string; attempts: number; maxAttempts: number; expiresAt: Date }
export type VerifyDecision =
  | { kind: "verified"; attempts: number }
  | { kind: "invalid"; attempts: number; attemptsLeft: number }
  | { kind: "locked"; attempts: number }          // this attempt exhausted the limit
  | { kind: "already_locked" }
  | { kind: "expired" }
  | { kind: "not_pending" };

export function decideVerify(row: VerifyState, now: Date, codeMatches: boolean): VerifyDecision {
  if (row.status === "locked") return { kind: "already_locked" };
  if (row.status === "expired") return { kind: "expired" };
  if (row.status !== "pending" && row.status !== "sent") return { kind: "not_pending" };   // verified, cancelled, failed: one-time use
  if (now.getTime() >= row.expiresAt.getTime()) return { kind: "expired" };
  if (row.attempts >= row.maxAttempts) return { kind: "already_locked" };
  const attempts = row.attempts + 1;
  if (codeMatches) return { kind: "verified", attempts };
  if (attempts >= row.maxAttempts) return { kind: "locked", attempts };
  return { kind: "invalid", attempts, attemptsLeft: row.maxAttempts - attempts };
}

export interface ResendState { status: string; expiresAt: Date; lastSentAt: Date | null; resendCount: number }
export type ResendDecision =
  | { kind: "ok" }
  | { kind: "cooldown"; retryAfterSec: number }
  | { kind: "max_resends" } | { kind: "expired" } | { kind: "not_pending" };

export const MAX_RESENDS = 3;
export function decideResend(row: ResendState, now: Date, cooldownSec: number, maxResends = MAX_RESENDS): ResendDecision {
  if (row.status !== "pending" && row.status !== "sent") return { kind: "not_pending" };
  if (now.getTime() >= row.expiresAt.getTime()) return { kind: "expired" };
  if (row.lastSentAt) {
    const wait = row.lastSentAt.getTime() + cooldownSec * 1000 - now.getTime();
    if (wait > 0) return { kind: "cooldown", retryAfterSec: Math.ceil(wait / 1000) };
  }
  if (row.resendCount >= maxResends) return { kind: "max_resends" };
  return { kind: "ok" };
}
