export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const bad = <T>(error: string): Result<T> => ({ ok: false, error });

export const LOCALES = ["ar", "en", "ru", "es", "de", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function parseEmail(v: unknown): Result<string> {
  if (typeof v !== "string") return bad("email is required");
  const e = v.trim().toLowerCase();
  if (e.length > 254 || !EMAIL_RE.test(e)) return bad("email is invalid");
  return ok(e);
}

const WEAK = new Set(["password1234", "passw0rd1234", "123456789012", "1234567890ab", "qwertyuiop12", "111111111111", "000000000000", "iloveyou1234", "administrator"]);
export function parsePassword(v: unknown, email?: string): Result<string> {
  if (typeof v !== "string") return bad("password is required");
  if (v.length < 12) return bad("password must be at least 12 characters");
  if (v.length > 128) return bad("password must be at most 128 characters");
  const lower = v.toLowerCase();
  if (WEAK.has(lower) || /^(.)\1+$/.test(v)) return bad("password is too common");
  const local = email?.split("@")[0] ?? "";
  if (local.length >= 4 && lower.includes(local)) return bad("password must not contain your email name");
  return ok(v);
}

export function parseDisplayName(v: unknown): Result<string> {
  if (v === undefined || v === null || v === "") return ok("");
  if (typeof v !== "string") return bad("name is invalid");
  const n = v.trim();
  // eslint-disable-next-line no-control-regex
  if (n.length > 80 || /[\u0000-\u001f\u007f<>]/.test(n)) return bad("name is invalid");
  return ok(n);
}

export function parseLocale(v: unknown): Result<Locale> {
  if (v === undefined || v === null || v === "") return ok("en");
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v) ? ok(v as Locale) : bad("locale is not supported");
}

export const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const isTokenShape = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(v);
