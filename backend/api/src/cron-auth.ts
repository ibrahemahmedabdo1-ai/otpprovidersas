import { timingSafeEqual } from "node:crypto";

export const CRON_SECRET_MIN_LENGTH = 24;

export type CronAuthResult = "ok" | "not_configured" | "missing_header" | "mismatch";

/**
 * Checks the X-Cron-Secret header against the configured secret in constant time.
 * Returns an internal reason code only; neither value is ever returned or logged.
 */
export function checkCronSecret(given: string | undefined, want: string | undefined): CronAuthResult {
  if (!want || want.length < CRON_SECRET_MIN_LENGTH) return "not_configured";
  if (!given) return "missing_header";
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  if (a.length !== b.length) return "mismatch";
  return timingSafeEqual(a, b) ? "ok" : "mismatch";
}
