export interface CouponInput { code: string; name: string; creditMicro: number; maxRedemptions: number | null; maxPerOrg: number; expiresAt: string | null }
type Result = { ok: true; value: CouponInput } | { ok: false; fields: Record<string, string> };

/** Validates a Super Admin coupon definition. Credit is entered in USD (up to 4 decimals) and stored as integer micro-USD. */
export function parseCouponInput(b: Record<string, unknown>, now = Date.now()): Result {
  const f: Record<string, string> = {};
  const code = typeof b.code === "string" ? b.code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) f.code = "3-32 letters, digits, - or _";
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (name.length < 2 || name.length > 80) f.name = "2-80 characters required";
  const usd = b.creditUsd;
  const text = typeof usd === "number" ? String(usd) : typeof usd === "string" ? usd.trim() : "";
  let creditMicro = 0;
  if (!/^\d{1,4}(\.\d{1,4})?$/.test(text)) f.creditUsd = "amount in USD with at most 4 decimals";
  else { creditMicro = Math.round(Number(text) * 1_000_000); if (creditMicro < 100 || creditMicro > 1_000_000_000) f.creditUsd = "between 0.0001 and 1000 USD"; }
  let maxRedemptions: number | null = null;
  if (b.maxRedemptions !== undefined && b.maxRedemptions !== null && b.maxRedemptions !== "") {
    const n = Number(b.maxRedemptions);
    if (!Number.isInteger(n) || n < 1 || n > 1_000_000) f.maxRedemptions = "integer 1-1000000, or leave empty for unlimited"; else maxRedemptions = n;
  }
  let maxPerOrg = 1;
  if (b.maxPerOrg !== undefined && b.maxPerOrg !== null && b.maxPerOrg !== "") {
    const n = Number(b.maxPerOrg);
    if (!Number.isInteger(n) || n < 1 || n > 100) f.maxPerOrg = "integer 1-100"; else maxPerOrg = n;
  }
  let expiresAt: string | null = null;
  if (b.expiresAt !== undefined && b.expiresAt !== null && b.expiresAt !== "") {
    const d = typeof b.expiresAt === "string" ? Date.parse(b.expiresAt) : NaN;
    if (!Number.isFinite(d) || d <= now) f.expiresAt = "a future date"; else expiresAt = new Date(d).toISOString();
  }
  if (Object.keys(f).length) return { ok: false, fields: f };
  return { ok: true, value: { code, name, creditMicro, maxRedemptions, maxPerOrg, expiresAt } };
}
