import { fmt, type Dict } from "../i18n";

export type ApiResult<T = Record<string, unknown>> = { ok: boolean; status: number; data: T | null; networkError?: boolean };

/** Calls the API through the same-origin proxy (/api → API_BASE_URL). The session cookie is httpOnly, so JS never reads it. */
export async function api<T = Record<string, unknown>>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  opts: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api${path}`, {
      method, credentials: "same-origin", cache: "no-store",
      headers: { ...(opts.body !== undefined ? { "content-type": "application/json" } : {}), ...opts.headers },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    let data: T | null = null;
    if (res.status !== 204) { try { data = (await res.json()) as T; } catch { data = null; } }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null, networkError: true };
  }
}

type ErrBody = { error?: string; retryAfterSec?: number; attemptsLeft?: number };

/** Turns an API failure into a translated, human sentence. Raw error codes are never shown. */
export function errorText(t: Dict, r: ApiResult<unknown>): string {
  if (r.networkError) return t.errors.network;
  const d = (r.data ?? {}) as ErrBody;
  const code = d.error ?? (r.status === 401 ? "unauthenticated" : r.status === 429 ? "rate_limited" : "");
  const dict = t.errors as unknown as Record<string, string>;
  let msg = (code && dict[code]) || t.errors.unknown;
  if (typeof d.retryAfterSec === "number") msg += " " + fmt(t.errors.retryIn, { n: d.retryAfterSec });
  if (typeof d.attemptsLeft === "number") msg += " " + fmt(t.errors.attemptsLeft, { n: d.attemptsLeft });
  return msg;
}

export type Money = { microUsd: number; usd: string };
export type Wallet = { currency: string; paid: Money; promotional: Money; reserved: Money; pending: Money; available: Money };
export type Project = {
  id: string; name: string; createdAt: string; activeKeys: number;
  channels: { email: boolean; whatsapp: boolean };
  otp: { length: number; ttlSeconds: number; maxAttempts: number; resendCooldownSeconds: number };
  dailyLimit: number | null;
};
export type ApiKey = { id: string; mode: "test" | "live"; prefix: string; lastUsedAt: string | null; revokedAt: string | null; createdAt: string };
export type Session = { id: string; ip: string | null; userAgent: string | null; createdAt: string; lastSeenAt: string; expiresAt: string; current: boolean };
export type Deposit = { id: string; amountUsd: string; status: string; note: string | null; createdAt: string; decidedAt: string | null };
export type Tx = { id: string; type: string; bucket: string; amountUsd: string; memo: string | null; createdAt: string };
export type Me = { id: string; email: string; name: string; role: string; organizationId: string | null; mfaVerified: boolean; mfaPending: boolean };
