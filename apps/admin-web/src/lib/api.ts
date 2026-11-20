export type ApiResult<T = Record<string, unknown>> = { ok: boolean; status: number; data: T | null; networkError?: boolean };

/** Calls the API through the same-origin proxy (/api -> API_BASE_URL). The session cookie is httpOnly. */
export async function api<T = Record<string, unknown>>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api${path}`, {
      method, credentials: "same-origin", cache: "no-store",
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data: T | null = null;
    if (res.status !== 204) { try { data = (await res.json()) as T; } catch { data = null; } }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null, networkError: true };
  }
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: "The email or password is incorrect.",
  account_disabled: "This account is disabled.",
  email_not_verified: "This account's email is not verified.",
  rate_limited: "Too many attempts. Wait a few minutes and try again.",
  locked: "Too many failed attempts. Wait about 15 minutes.",
  validation_failed: "Some of the details are not valid.",
  unauthenticated: "Your session has ended. Sign in again.",
  forbidden: "Your role is not allowed to do that.",
  super_admin_approval_required: "This needs an approved Super Admin approval first. Use 'Request approval'.",
  receipt_verification_required: "A receipt verification note is required.",
  deposit_not_open: "This deposit is no longer open (already decided).",
  approval_not_pending_or_own_request: "That approval is not pending, or you requested it yourself. You cannot decide your own request.",
  not_found: "Not found.",
  invalid_code: "That code is not correct.",
  mfa_already_enrolled: "Two-step verification is already set up for this account.",
  origin_not_allowed: "Blocked by a security check. Reload the page and try again.",
};
export function errorText(r: ApiResult<unknown>): string {
  if (r.networkError) return "Could not reach the service. Check your connection.";
  const d = (r.data ?? {}) as { error?: string; retryAfterSec?: number; fields?: Record<string, string> };
  const code = d.error ?? (r.status === 401 ? "unauthenticated" : r.status === 429 ? "rate_limited" : "");
  let m = (code && MESSAGES[code]) || "Something went wrong. Try again.";
  if (d.fields) m += " " + Object.values(d.fields).join(" ");
  if (typeof d.retryAfterSec === "number") m += ` Try again in ${d.retryAfterSec} s.`;
  return m;
}
export type Me = { id: string; email: string; name: string; role: string; mfaVerified: boolean; mfaPending: boolean };
export const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(d);
};
export const validEmail = (s: string): boolean => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
export const ROLE_LABEL: Record<string, string> = { customer: "Customer", support_staff: "Support", admin_staff: "Admin", super_admin: "Super Admin" };
