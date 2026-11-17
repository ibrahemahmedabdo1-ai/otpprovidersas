import { createHmac } from "node:crypto";
/** Header format: t=<unix seconds>,v1=<hex hmac-sha256 of `${t}.${body}`>. Receivers must reject stale timestamps. */
export function signWebhook(secret: string, body: string, now = Math.floor(Date.now() / 1000)): string {
  return `t=${now},v1=${createHmac("sha256", secret).update(`${now}.${body}`).digest("hex")}`;
}
/** Retry delays in seconds after attempt 1..5; after the 6th failure the delivery is marked dead. */
export const BACKOFF_SECONDS = [60, 300, 1800, 7200, 21600] as const;
export function nextDelaySeconds(attemptsMade: number): number | null {
  return attemptsMade >= 1 && attemptsMade <= BACKOFF_SECONDS.length ? (BACKOFF_SECONDS[attemptsMade - 1] ?? null) : null;
}
