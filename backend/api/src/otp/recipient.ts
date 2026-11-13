import { parseEmail, type Result } from "../auth/validators";

export type Channel = "email" | "whatsapp";
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const bad = <T>(error: string): Result<T> => ({ ok: false, error });

export function parseRecipient(channel: unknown, to: unknown): Result<{ channel: Channel; to: string }> {
  if (channel !== "email" && channel !== "whatsapp") return bad("channel must be 'email' or 'whatsapp'");
  if (channel === "email") {
    const e = parseEmail(to);
    return e.ok ? ok({ channel, to: e.value }) : bad("to must be a valid email address");
  }
  if (typeof to !== "string" || !/^\+[1-9]\d{6,14}$/.test(to.trim())) return bad("to must be a phone number in E.164 format, e.g. +628123456789");
  return ok({ channel, to: to.trim() });
}

/** Shown in API responses and the dashboard; the full recipient is never returned. */
export function maskRecipient(channel: Channel, to: string): string {
  if (channel === "email") {
    const [local = "", domain = ""] = to.split("@");
    return `${local.slice(0, 1)}***@${domain}`;
  }
  return `${to.slice(0, 3)}${"*".repeat(Math.max(to.length - 5, 3))}${to.slice(-2)}`;
}

export function parseIdempotencyKey(v: string | undefined): Result<string | null> {
  if (v === undefined || v === "") return ok(null);
  return /^[\w.-]{1,64}$/.test(v) ? ok(v) : bad("Idempotency-Key must be 1-64 characters: letters, digits, _ . -");
}
export const isOtpCode = (v: unknown): v is string => typeof v === "string" && /^\d{4,8}$/.test(v);
