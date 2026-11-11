import { hmac, safeEqual } from "./crypto.ts";

/** Header format: t=<unix seconds>,v1=<hex hmac of `${t}.${body}`> */
export function signWebhook(secret: string, body: string, now = Math.floor(Date.now() / 1000)): string {
  return `t=${now},v1=${hmac(secret, `${now}.${body}`)}`;
}
export type VerifyResult = { ok: true } | { ok: false; reason: "malformed" | "stale" | "bad_signature" | "replayed" };

/** Verifies signature, rejects timestamps outside tolerance, and rejects replays via `seen`. */
export function verifyWebhook(
  secret: string, body: string, header: string,
  opts: { toleranceSec?: number; now?: number; seen?: Set<string> } = {},
): VerifyResult {
  const tol = opts.toleranceSec ?? 300, now = opts.now ?? Math.floor(Date.now() / 1000);
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header);
  if (!m) return { ok: false, reason: "malformed" };
  if (Math.abs(now - Number(m[1])) > tol) return { ok: false, reason: "stale" };
  if (!safeEqual(hmac(secret, `${m[1]}.${body}`), m[2]!)) return { ok: false, reason: "bad_signature" };
  if (opts.seen) {
    if (opts.seen.has(m[2]!)) return { ok: false, reason: "replayed" };
    opts.seen.add(m[2]!);
  }
  return { ok: true };
}
