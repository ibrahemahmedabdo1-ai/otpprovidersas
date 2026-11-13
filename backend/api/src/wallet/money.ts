import type { Result } from "../auth/validators";

/** Money is stored as integer micro-USD (1 USD = 1,000,000). Never use floating point for amounts. */
export const MICRO = 1_000_000n;
export const MIN_DEPOSIT_MICRO = 1n * MICRO;          // pending commercial approval: adjust in settings later
export const MAX_DEPOSIT_MICRO = 10_000n * MICRO;

export function microToUsd(v: bigint | number | string): string {
  const n = typeof v === "bigint" ? v : BigInt(v);
  const neg = n < 0n, abs = neg ? -n : n;
  const whole = abs / MICRO;
  let frac = (abs % MICRO).toString().padStart(6, "0").replace(/0+$/, "");
  if (frac.length < 2) frac = frac.padEnd(2, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

/** Accepts "12", "12.5", "12.50" or a JSON number; at most 2 decimals. Parsed from text, so there is no float rounding. */
export function parseUsdAmount(v: unknown): Result<bigint> {
  const text = typeof v === "number" ? String(v) : v;
  if (typeof text !== "string" || !/^\d{1,6}(\.\d{1,2})?$/.test(text.trim())) return { ok: false, error: "amount must be a positive number with at most 2 decimals" };
  const [w = "0", f = ""] = text.trim().split(".");
  const micro = BigInt(w) * MICRO + BigInt(f.padEnd(6, "0"));
  if (micro < MIN_DEPOSIT_MICRO) return { ok: false, error: `minimum amount is ${microToUsd(MIN_DEPOSIT_MICRO)} USD` };
  if (micro > MAX_DEPOSIT_MICRO) return { ok: false, error: `maximum amount per request is ${microToUsd(MAX_DEPOSIT_MICRO)} USD` };
  return { ok: true, value: micro };
}

export interface WalletRow { paid: bigint; promo: bigint; reserved: bigint; pending: bigint }
export function walletView(w: WalletRow) {
  const available = w.paid + w.promo - w.reserved;
  const f = (x: bigint) => ({ microUsd: Number(x), usd: microToUsd(x) });
  return { currency: "USD", paid: f(w.paid), promotional: f(w.promo), reserved: f(w.reserved), pending: f(w.pending), available: f(available) };
}
